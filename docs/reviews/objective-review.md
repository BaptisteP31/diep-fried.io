# Revue indépendante des objectifs, rounds et IA

Reprise du 24 octobre 2026 dans le worktree existant `t3-b927d5ec`, branche
`t3/review-objective-modes-1`, HEAD de départ `2a7989a`. Lot revu : `e90f9f3`, intégré
par `8d3240b`. La tentative Claude a été limitée par l'API ; la ronde GPT précédente
a été interrompue par quota. Cette reprise conserve et termine ses corrections non
commitées. Aucun sous-agent, changement de branche, push ou PR.

Périmètre : six modes à objectifs, cinq boss, attente avec minimum de deux joueurs
par défaut, cycles de rounds, possession, ligne de vue, mémoire et nettoyage. Code
modifié uniquement dans `packages/sim` et le contrat nécessaire de `packages/shared` ;
rapport dans `docs/reviews`. Aucun changement client, serveur, génération de cartes,
coefficients d'équilibrage, licence AGPL ou assets tiers. Aucun Arena Closer ajouté.

## Findings reproduits et réponses

### 1. P2 — Tag : un arrivant ressuscitait un camp éliminé

La répartition choisissait le camp le moins peuplé de toute la configuration, donc
un camp vide alors que le round était déjà en cours. Deux joueurs répartis dans
deux camps, puis un troisième arrivant, suffisent à reproduire le problème.

**Réponse appliquée :** en `playing`, limiter les camps éligibles à ceux qui ont
encore des joueurs connectés, morts compris. La répartition initiale et le
rééquilibrage au reset gardent tous les camps. Le contexte temporaire ne modifie
pas la configuration publiée. Test : `Tag: an arrival cannot repopulate an empty camp during play`.

### 2. P2 — CTF : un drapeau porté restait figé lors du retour en attente

Si l'adversaire quittait le salon, `updateFlags` cessait de tourner, mais le
drapeau gardait son porteur et ses anciennes coordonnées pendant les déplacements
de celui-ci.

**Réponse appliquée :** le passage en `waiting` dépose les drapeaux portés à la
position courante du porteur. Les objectifs restent suspendus en attente et sont
recréés au prochain départ. Test : `CTF: entering waiting drops the carried flag at the carrier position`.
Le test de déconnexion du porteur dans `objectives.test.ts` reste également vert.

### 3. P1 — CTF : les objectifs divulguaient la position d'un porteur invisible

Le tank Stalker était correctement omis des entités ennemies, mais
`match.objectives[].x/y` suivait ses coordonnées exactes et `carrierId` le désignait.
La reproduction utilise les évolutions ordinaires, sans triche Sandbox.

**Réponse appliquée :** appliquer la même politique de visibilité au drapeau porté.
Pour un ennemi d'un porteur à opacité zéro, `carrierId` devient `null`, `x/y` deviennent
`homeX/homeY` et `flag.positionHidden` vaut `true`. L'état autoritaire du drapeau
reste intact. Le porteur et ses alliés gardent les coordonnées réelles ; la première
révélation rétablit identité et position. Test : `CTF: an enemy objective snapshot cannot locate an invisible carrier`.

Contrôle des canaux annexes : le classement n'exporte aucune coordonnée ; scores,
survivants et résultat n'ajoutent pas de positions individuelles. Les coordonnées
de zone et d'objectifs fixes sont publiques. Les drones gardent la politique déjà
intégrée `ownerId: 0` quand le propriétaire ennemi est invisible. Les événements
d'objectif n'ont pas de coordonnées ; les tirs manuels et les collisions restent
physiques. Ceci ne masque pas les indices de gameplay observables, comme des drones
visibles ou la dernière position vue.

### 4. P1 — Un objectif possédé restait offensif en attente

`think` recopiait l'entrée humaine avant de vérifier la phase ; `prepareTank`
continuait à appliquer mouvement et tirs malgré la protection. Un Dominator
possédé tuait l'adversaire dans un salon à deux joueurs avec minimum configuré à
trois. La variante Mothership se déplaçait aussi et produisait des drones.

**Réponse appliquée :** vérifier l'inactivité de l'objectif avant le pilotage,
vider son intention/cible et bloquer vitesse et canons dans `prepareTank`. Les
projectiles d'objectif déjà en vol deviennent aussi inoffensifs en attente via
`canDamage`, dans les deux sens d'une collision. Trois tests distinguent tir
nouveau, tir déjà en vol et mouvement/production de drones du Mothership :
`a possessed Dominator cannot fire damaging shots while waiting`,
`waiting also neutralizes an objective bullet already in flight`,
`a possessed Mothership cannot move or create drones while waiting`.

### 5. P2 — Le reset rejouait l'ancienne entrée humaine

Après remise à zéro, un joueur réapparaissait puis reprenait déplacement/tir sans
nouvelle entrée. La séquence précédente restait stockée dans `player.input`.

**Réponse appliquée :** effacer l'intention au reset, en conservant `receivedSeq`
et `appliedSeq`. Le test utilise les séquences 100, 99 puis 101 : aucun mouvement
ni tir rejoué, 99 refusée, 101 acceptée. Test :
`reset clears stale movement and fire but retains monotone input sequence numbers`.

## Preuves avant correction et contrôles sans finding

`packages/sim/test/objective-review.test.ts` contient **19 cas** : **7 régressions**
associées aux cinq findings, puis **12 contrôles d'invariants**. Les régressions
passent par l'API publique. Les contrôles de budgets et de mémoire observent aussi
les collections privées via une vue TypeScript de test, sans les modifier et sans
ajouter de méthode de diagnostic au runtime.

Pour la preuve négative, une copie des fichiers courants a été créée sous
`coverage/objective-review-baseline/` (ignoré par Git). Le diff des seuls fichiers
runtime `world.ts` et `model/match.ts` y a été inversé par `patch --batch -R -p1`.
Les tests ont été copiés tels quels. Aucun fichier du worktree de travail n'a été
écrasé, réinitialisé ou remplacé. Le test Tag a une zone de spawn assez grande
pour deux alliés : son échec négatif porte bien sur le mauvais camp, pas sur une
saturation de fixture.

Résultat de la copie avant correction : **7 régressions en échec**, correspondant
chacune au comportement décrit, **12 contrôles réussis**. Résultat corrigé :
**19/19 réussis**. Commande dans chaque racine :

```sh
rtk proxy npx vitest run packages/sim/test/objective-review.test.ts
```

Contrôles complémentaires :

- Chacun des six modes attend avec un seul joueur, démarre au deuxième, termine
  deux rounds et redémarre un troisième avec des identifiants d'entité neufs et
  une configuration inchangée.
- Déconnexion d'un pilote : objectif libéré, tank garé retiré, drones humains et
  budget humain nettoyés, commande en attente du joueur supprimé sans effet ; un
  remplaçant peut posséder l'objectif après le nouveau départ.
- Survival : éliminé puis cinq déconnexions/rejoins avec le même identifiant,
  inputs et demandes `respawn`/`possess` n'accordent aucune nouvelle vie pendant
  le round. Départ d'un survivant : victoire du dernier participant réel, puis
  réintégration du spectateur au round suivant.
- Deux morts de zone au même tick que la limite de temps : un seul résultat
  d'égalité, aucune seconde victoire pendant le podium.
- Domination et Mothership, deux resets chacun avec possession et boss : anciens
  corps, projectiles, fiches IA et clés de propriétaire négatives retirés ; budgets
  vides au nouveau départ, aucune possession restante. Pendant le podium, aucun
  dégât, nouvel XP ou événement de victoire supplémentaire. Les tests existants
  couvrent en plus capture/neutralisation/éjection, XP du boss mort et retrait de
  ses drones.
- Une IA n'acquiert pas un joueur derrière un mur, l'acquiert après ouverture de
  la ligne de vue, puis conserve seulement la dernière position connue d'une
  cible devenue protégée pendant trois secondes et l'oublie ensuite. Elle ne
  suit pas ses déplacements ultérieurs et cesse de tirer à expiration.
- Les **11 tests `audit-regressions.test.ts`** sont préservés sans changement :
  vulnérabilité Factory hors base, protection des unités et omission des tanks
  furtifs avec anonymisation `ownerId: 0`.

## Contrat utile au client et limites

Ajout optionnel et additif au protocole v1 : `ObjectiveState.flag.positionHidden?: boolean`.
Quand il vaut `true`, le client doit supprimer le marqueur de drapeau porté, y
compris sur la minimap ; les coordonnées de repli à la base ne sont pas sa position
réelle. `status: 'carried'` reste disponible pour le HUD sans révéler le porteur.
Un ancien client reste compatible au niveau du typage et du transport, mais peut
dessiner le marqueur à la base tant qu'il ne traite pas ce champ. Aucun changement
du client n'est fait dans ce lot.

Les contrats existants `match.round`, `self.spectator` et `self.possessing`
suffisent aux autres états ; purger les anciennes interpolations au changement de
round. Après reset, conserver une séquence d'input croissante et envoyer la
nouvelle intention. Aucun autre champ réseau n'est nécessaire à ces corrections.

Limites : audit déterministe de simulation, pas de QA navigateur ni de test de
reconnexion du transport serveur. Le minimum de deux joueurs est celui des
presets ; une configuration interne explicite peut le modifier. Pas de
pathfinding ni de preuve exhaustive de toute géométrie ou charge ; les valeurs
d'équilibrage restent expérimentales. Les formes sont conservées entre rounds
selon le contrat existant. Les opérations Sandbox autorisées servent uniquement
à préparer certains contrôles. Les cinq boss et les onze modes au total sont
couverts par les tests existants, sans prétention de fidélité exacte au jeu original.

## Validation finale

Environnement : Node `v26.12.1`.

- `rtk proxy npm run check` : **réussi** ; typecheck des quatre workspaces,
  **33 fichiers / 440 tests réussis**, puis Prettier réussi. Le warning expérimental
  Node concernant `localStorage` reste non bloquant.
- `rtk proxy npm run build` : **réussi** ; build Vite client et bundle esbuild serveur.
  Les notices de licence et polices tierces sont toujours émises dans le build.
- `rtk git diff --check` : **réussi**.

Les corrections n'ajoutent aucune dépendance et ne modifient pas le lockfile.

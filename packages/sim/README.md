# Simulation FFA / Sandbox / Teams / Maze

`createSimulation({ config, seed })` est le nouvel export de simulation autoritaire,
conforme à `Simulation`, choisie par défaut par le serveur.
`createPlaceholderSimulation` reste disponible. Le registre partagé contient les
**54 classes** du catalogue (1/4/13/36 aux niveaux 1/15/30/45), toutes accessibles.
Les coefficients sont des choix calibrables de diep-fried.io, sans revendication
numérique de fidélité. Les modes `ffa`, `sandbox`, `teams2`, `teams4` et `maze` sont jouables.
Le protocole reste en version 1 ; les commandes Sandbox sont des ajouts à l’union existante.

## Règles de cette implémentation

- Pas fixe `1 / tickRate`, graine `Rng` unique ; aucune horloge système. Les unités de
  vitesse sont des unités monde par seconde. Config reçue, inputs, commandes et
  snapshots sont copiés. `setInput` ignore les séquences déjà reçues, y compris après
  une mort ; `ackSeq` avance au prochain tick.
- Ordre : apparitions initiales et acquittement, commandes dans leur ordre d'arrivée,
  visée/vitesse/tirs, expiration, mouvement/collisions/dégâts/morts, régénération,
  remplacement des formes. Une commande refusée n'est pas conservée pour plus tard.
- Protection de 3 secondes depuis le spawn, y compris en mouvement. Le maintien du
  tir la termine immédiatement. Les balles traversent un tank protégé sans dommage
  ni consommation ; les corps restent solides. Les tirs d'un même propriétaire
  s'ignorent toujours ; les autres passent par `ModeRules.canDamage`.
- Arène bornée au rayon des corps : vitesse normale annulée pour les tanks et
  inversée pour les formes. Les balles quittant l'arène sont retirées. Les tirs
  partent de la bouche de chaque canon, avec ses multiplicateurs, son angle et son
  décalage latéral. `delay` s'applique au début d'une rafale ; les tirs ne sont pas
  rattrapés après relâchement. Échéancier fractionnaire pendant une rafale : chaque tir
  part au premier tick atteignant son échéance, la suivante est `échéance + période`,
  donc la cadence moyenne est exacte et chaque point de Reload compte à 30 Hz. Au plus
  un tir par canon et par tick.
- Grille spatiale à cellules de 128 unités et boîtes balayées. Les contacts circulaires
  sont calculés en mouvement relatif et traités par temps d'impact, puis identifiants.
  Les corps sont intégrés en sous-pas d'au plus 8 unités de déplacement prévu
  (32 sous-pas maximum). Les projectiles utilisent un balayage continu même à faible
  fréquence ; une balle traverse au maximum chaque cible une fois. Les collisions de
  corps séparent les positions et annulent la vitesse relative entrante. Les formes
  se séparent sans se blesser. Les dégâts de contact mutuels sont prélevés avant les
  récompenses, pour permettre deux morts simultanées. Une forme poussée revient à sa
  vitesse de dérive initiale : l'excédent décroît avec le frottement des tanks (5/s).
- Durabilité des balles indépendante de leurs dégâts : chaque impact consomme 8 PV
  contre une forme, `14 + 3 × bodyDamage` contre un tank, et les dégâts de la balle
  adverse contre une balle. Chaque cible reçoit un impact par balle, même si le
  contact dure plusieurs sous-pas. Les balles durables poursuivent leur trajectoire.
- Destruction d'une forme : récompense unique 10/25/130 XP selon son type. Un kill de
  tank donne `100 + floor(scoreVictime × 0.25)` XP, au coup fatal. Pas d'assistances.
  Les balles, missiles et pièges encore présents peuvent rapporter des XP après la mort de leur
  propriétaire. Les drones/minions sont retirés immédiatement à sa mort ou au changement
  de classe ; une déconnexion retire tous ses projectiles, sans explosion ni récompense. `DeathInfo` décrit le
  tank au moment du coup fatal ; les gains posthumes restent sur le joueur.
- Score = XP cumulé. Une apparition initiale au `startLevel` reçoit le score du seuil
  correspondant (utile pour accélérer Sandbox). Une mort garde le score affiché jusqu'à
  une commande `respawn` acceptée au plus tôt à `respawnTick` ; pas de réapparition
  automatique, pas de mise en attente d'une commande trop précoce. Au respawn :
  `floor(score × scoreKeptOnDeath)`, niveau recalculé, Tank, stats à zéro et points
  disponibles correspondant au niveau conservé. L'identifiant d'entité est neuf.
  **Contrat runtime provisoire** : c'est la fraction de score `scoreKeptOnDeath` qui
  fait foi, pas la convention documentaire « niveau `max(1, min(22, floor(L / 2)))` »
  de `docs/specification/scope.md`. Avec FFA (0.5), un niveau 45 (23 540 XP) repart à
  11 770 XP, soit niveau 32 au lieu de 22. Choix conservé jusqu'à calibration ; la
  modification éventuelle passera par `shared`, pas par la simulation.
- Choix de classe uniquement parmi les arêtes accessibles au niveau requis ; changer
  de branche ou revenir au Tank est refusé. Les points s'obtiennent aux niveaux 2–28,
  puis 30/33/36/39/42/45, soit 33. Un investissement coûte un point et respecte le
  plafond de la classe (7 par défaut). Aucun point au-delà du niveau 45.
- Snapshot : zone carrée de demi-étendue `view + 100 + rayon`, centrée sur le tank
  (dernière position après la mort). Le carré couvre tous les ratios d'écran. La vue
  du Sniper étend ce filtre. Classement global top 10 à chaque snapshot, scores
  décroissants, identifiant joueur pour départager, joueurs morts inclus.

## Coefficients choisis (à calibrer)

Toutes ces valeurs sont des choix de diep-fried.io ; aucune prétention de reproduction
numérique d'un serveur existant. Sources de vérité : `src/balance.ts`, `src/world.ts` et
`../shared/src/content/classes.ts`.

| Paramètre                       | Valeur / formule                                                 |
| ------------------------------- | ---------------------------------------------------------------- |
| Rayon tank                      | 25                                                               |
| Santé                           | `50 + 2 × (niveau - 1) + 15 × maxHealth`                         |
| Vitesse cible                   | `220 × vitesseClasse × (1 + 0.08 × movementSpeed)`               |
| Accélération/friction           | solution exponentielle, coefficient 5/s, arrêt sous 0.05 unité/s |
| Dégâts corps                    | `24 + 8 × bodyDamage` par seconde                                |
| Régénération                    | `1 + 0.8 × healthRegen` PV/s, après 5 s sans dégât               |
| Reload                          | `0.5 × reloadCanon × 0.9^reload` secondes                        |
| Balle                           | vitesse `600 × vitesseCanon × (1 + 0.12 × bulletSpeed)`          |
| Dégâts balle                    | `(12 + 3 × bulletDamage) × dégâtsCanon`                          |
| Durabilité balle                | `(14 + 5 × bulletPenetration) × pénétrationCanon`                |
| Rayon balle                     | `7 × sqrt(largeurCanon / 0.84)`                                  |
| Expiration                      | 2.5 secondes, arrondies en ticks                                 |
| Impulsion recul                 | `18 × reculCanon`, opposée à l'axe du canon                      |
| Vue                             | `900 × vueClasse`                                                |
| Seuil de niveau L               | `round(12 × (L - 1)^2 + 7 × (L - 1))` ; niveau 45 : 23 540 XP    |
| Formes carré/triangle/pentagone | proportions 65/25/10 %, PV 10/30/100, rayons 16/20/30            |
| Dérive / rotation formes        | vitesse initiale uniforme 12–28 ; rotation −0.6 à +0.6 rad/s     |
| Contact d'une forme             | 12 PV/s                                                          |

Tank : canon de référence, sans dispersion. Twin : deux canons décalés latéralement
±0.5 rayon, phase 0/0.5, dégâts ×0.7 et recul ×0.65 chacun. Sniper : reload ×1.6,
dégâts ×1.5, durabilité ×1.4, vitesse balle ×1.5, vue ×1.25 et vitesse tank ×0.95.
Machine Gun : reload ×0.4, dégâts ×0.6, recul ×0.45, dispersion uniforme ±0.16 rad.
Flank Guard : canon avant standard et canon arrière à π, dégâts/recul arrière ×0.7.
Les autres multiplicateurs non précisés valent 1.

## Validation et limites

`test/world.test.ts` applique la suite commune et exerce uniquement l'API publique
pour le mouvement, les quatre coins, les commandes invalides, les classes, les tirs,
les collisions, les points, les niveaux, les récompenses, la mort et le respawn.
Le rejeu chargé couvre 8 joueurs et les 200 formes du preset FFA pendant 300 ticks.
`test/spatial.test.ts` vérifie aussi des trajectoires de 2 000 unités par tick et
les paires traversant plusieurs cellules.

Le serveur utilise cette fabrique par défaut. Nid/alpha/crashers, objectifs et boss
ne font pas partie de ce lot.
Les formes utilisent des collisions circulaires, une dérive initiale et une rotation,
sans IA ni régénération. L'apparition cherche une zone dégagée pendant 128 essais au maximum, puis
utilise une grille déterministe dans la zone autorisée. Une arène saturée retarde
le spawn initial (ou refuse cette demande de respawn) plutôt que de placer dans un
mur, une base ennemie ou un autre corps. Le filtre de vue économise le réseau, pas la simulation.
La physique de foule compacte est approchée par séparation locale ; le balayage
continu garantit la détection des balles, sans résoudre un système rigide global.

## Classes et comportements effectifs

Chaque canon partage le même échéancier fractionnaire, avec phase `delay`,
Reload, dispersion déterministe, dégâts, pénétration, vitesse, bouche et recul.
Une volée à plombs consomme un événement de rechargement/recul par canon, pas par plomb.
Les canons automatiques disposent de leur propre état de déclenchement ; aucune
rafale de rattrapage après une période sans cible.

| Classes                                                          | Comportement                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tank, Twin, Sniper, Machine Gun, Flank Guard                     | Tir de référence, alternance Twin, longue portée Sniper, dispersion rapide Machine Gun, tir avant/arrière Flank Guard. Paramètres initiaux conservés.                                                                                                                                                     |
| Triple Shot, Quad Tank, Twin Flank                               | Éventail de trois canons, quatre directions, paires avant/arrière.                                                                                                                                                                                                                                        |
| Triplet, Penta Shot, Spread Shot, Octo Tank, Triple Twin         | Trois canons concentrés ; éventail de cinq ; onze canons avec centre lourd ; huit directions avec deux phases ; trois paires à 120°.                                                                                                                                                                      |
| Assassin, Ranger, Hunter, Predator, Streamliner                  | Portée/vue renforcées ; Ranger vue ×1.8 et balle 4 s ; Hunter deux tirs concentriques lourds/légers décalés ; Predator trois tirs décalés et demande de caméra Alt de 650 unités ; Streamliner cinq canons décalés en flux.                                                                               |
| Destroyer, Annihilator                                           | Projectiles larges, dégâts/pénétration et recul forts, Annihilator encore renforcé.                                                                                                                                                                                                                       |
| Gunner, Sprayer                                                  | Quatre microcanons à phases 0/¼/½/¾ ; Sprayer superpose flux dispersé et canon fin, cadences distinctes.                                                                                                                                                                                                  |
| Shotgun, Pellet Shot, Dual-Barrel                                | 12 plombs par volée ; 30 plombs via trois canons simultanés ; deux volées de 12 décalées d'un demi-cycle, toutes deux sur Fire. Alt n'a pas de fonction de tir pour Dual-Barrel.                                                                                                                          |
| Tri-Angle, Booster, Fighter                                      | Propulsion par recul des canons arrière : deux, quatre, et deux plus canons latéraux.                                                                                                                                                                                                                     |
| Overseer, Overlord, Manager                                      | Drones triangulaires persistants : maximum 8. Overlord quatre producteurs rapides, Manager un producteur et invisibilité. Fire guide au point visé, Alt repousse autour de ce point. Sans action, défense vers la cible la plus proche puis orbite.                                                       |
| Battleship                                                       | Petits drones de 7 s, maximum 20 ; deux producteurs guidables et deux autonomes. Les expirations peuvent temporairement réduire la population avant le prochain cycle.                                                                                                                                    |
| Hybrid, Overtrapper                                              | Respectivement canon Destroyer/piège avant et jusqu'à deux drones autonomes arrière, sans guidage souris.                                                                                                                                                                                                 |
| Necromancer                                                      | Aucun drone gratuit : amorçage par contact du tank avec un carré, puis infection par contact de ses drones. Conversion atomique et une récompense par carré ; corps carrés conservant le rayon de la forme. Maximum 14 + 4 × Reload, donc 42 à Reload 7. Hors carrés ou capacité pleine : dégâts normaux. |
| Factory                                                          | Jusqu'à six minions carrés, guidage/repel et défense automatique. Chacun possède un canon, tire vers un ennemi proche ou le point Fire, avec recul et Reload du propriétaire.                                                                                                                             |
| Trapper, Tri-Trapper, Gunner Trapper, Mega Trapper, Auto Trapper | Pièges de 30 s, freinage exponentiel 4/s, arrêt de la vitesse normale aux bords ; un/trois canons, microcanons avant + piège arrière, pièges géants durables, ou piège + tourelle automatique. Les pièges bloquent les balles par leur réserve de santé.                                                  |
| Skimmer                                                          | Missile de 5 s, deux canons arrière obliques produisant des balles.                                                                                                                                                                                                                                       |
| Rocketeer                                                        | Missile pénétrant de 5 s, accélération jusqu'à 2.5 × sa vitesse de croisière et canon de propulsion arrière.                                                                                                                                                                                              |
| Glider                                                           | Missile de 5 s en courbe continue (0.4 rad/s) avec canon secondaire arrière.                                                                                                                                                                                                                              |
| Firework                                                         | Mèche de 1.2 s, explosion à l'impact d'un corps ou à destruction/expiration, 16 éclats radiaux sans récursion. Position d'explosion au contact balayé pour un impact, y compris à basse fréquence. Sortie d'arène : explosion au point de sortie, éclats extérieurs rejetés.                              |
| Auto-3, Auto-5, Auto Tank                                        | Trois/cinq/quatre canons autonomes à 360°, sans clic.                                                                                                                                                                                                                                                     |
| Auto Gunner, Auto Trapper, Auto Smasher                          | Canon(s) principal(aux) conservés avec une tourelle indépendante. Auto Smasher n'a que sa tourelle.                                                                                                                                                                                                       |
| Stalker, Manager, Landmine                                       | Fondu jusqu'à opacité 0 à l'arrêt : 2 s pour Stalker/Manager ; Landmine attend 13 s puis fond sur 2 s. Mouvement, dégâts et tir balistique manuel révèlent. La rotation et le guidage des drones Manager ne révèlent pas. Les tourelles ignorent les tanks d'opacité <0.15.                               |
| Smasher, Landmine, Spike, Auto Smasher                           | Santé corps ×1.35, dégâts corps ×1.6, masse ×1.5 ; Spike dégâts ×2.5 et masse ×2.5 (moins de poussée). Caps corps 10. Smasher/Landmine/Spike ont les quatre stats de tir à 0, tout investissement devenu interdit est remboursé au choix de classe. Auto Smasher réactive les caps de tir à 7.            |

Les drones/minions vivent au plus 120 s (sauf Battleship : 7 s), puis sont renouvelés
par leurs producteurs ; Necromancer doit reconvertir. Ils restent dans l'arène et
à 1 200 unités maximum du tank. Les cibles autonomes sont cherchées à 750 unités.
La production de drones ne retire pas la protection de spawn ; leurs contacts
hostiles et leur ciblage sont désactivés tant que le propriétaire est protégé.
Fire ou Alt termine cette protection. Les tirs autonomes balistiques la terminent aussi.

Les projectiles persistants peuvent frapper de nouveau une même cible après 0.35 s ;
chaque impact consomme la réserve de pénétration, comme pour les balles. Leurs
historiques de contact sont purgés à échéance. Les balles et missiles ne frappent
chaque cible qu'une fois. Pas de séparation physique entre unités contrôlées d'un
même propriétaire : les formations sont approchées par des points d'orbite distincts.

Budgets par joueur, **toutes vies confondues tant que les anciens tirs persistent** :
512 projectiles au total, dont au plus 80 pièges et 24 missiles. Les drones/minions
ont en plus le plafond de classe. Un budget saturé saute les créations excédentaires
sans rattrapage. Les projectiles secondaires gardent le propriétaire racine et
consomment ce même budget ; ils ne produisent pas de nouveaux descendants.

## Snapshots et intégration client

Ajouts rétrocompatibles dans `model/entities.ts`, sans changement de version :
`ProjectileState.bodyShape?`, `classId?`, `barrelShots?` pour les corps non balistiques
et les unités armées ; `TankState.barrelAngles?` pour les classes à tourelles et
`cameraOffset?` pour Predator. Les tableaux et vecteurs sont copiés à chaque snapshot.
Les balles simples ne reçoivent pas de métadonnées inutiles.

Le filtre serveur Predator suit le décalage Alt. Le **rendu client de la caméra
et des nouvelles géométries n'est pas implémenté dans ce lot**. L'invisibilité est
une opacité et une règle de ciblage, pas une dissimulation des coordonnées réseau.
Pas de boss, d'équipes, de murs, de contournement d'obstacles ni de commandes de triche
ajoutés ici. Les IA suivent une cible proche sans stratégie tactique. Les missiles
sont des trajectoires choisies pour ce remake, sans modèle d'explosion surfacique :
Firework blesse par ses éclats et par l'impact de la coque. La collision reste circulaire.
Les secondaires héritent des statistiques courantes du joueur au moment du tir.

## Validation et charge

Les fixtures historiques de `world.test.ts` restent en place. `classes.test.ts`
compare le catalogue indépendant, parcourt les 54 chemins via l'API publique,
refuse les paliers prématurés et exerce chaque famille : phases, volées, saturation
14/42 et autres caps, arène/portée, conversion/XP, minions armés, défense autonome,
pièges persistants et blocage de balles, secondaires/explosions, dégâts de corps,
remboursements, furtivité, mort/changement de classe/déconnexion, copie des états
optionnels et rejeu déterministe avec les cinq familles de projectiles.

Mesures reproductibles depuis la racine (Node uniquement, horloge hors simulation) :

```sh
node --import tsx packages/sim/bench/load.mjs basic
node --import tsx packages/sim/bench/load.mjs swarm
```

Chaque scénario simule 900 ticks (30 s), huit joueurs et 200 formes, graine 17,
avec snapshots à 15 Hz. `basic` conserve les classes Twin/Machine Gun niveau 15 ;
`swarm` utilise deux Overlords, deux Battleships, deux Factories et deux Necromancers
niveau 45, avec points investis et conversion recherchée. Les pics de projectiles
sont l'union visible des huit snapshots, donc une borne inférieure de la population
réelle. Le temps par tick exclut la préparation des inputs et la sérialisation.

Les mesures finales de ce commit sont consignées ci-dessous. Ce sont des indications
sur cette machine, pas une garantie de charge ; les payloads JSON n'incluent ni
enveloppe WebSocket, ni compression. Les budgets bornent la population, pas un temps
CPU maximal : le ciblage autonome parcourt encore les corps du monde.

| Scénario | Tick moyen | Tick p95 | Pic contrôlés / projectiles visibles | Octets / snapshot | kB/s par joueur / agrégés |
| -------- | ---------- | -------- | ------------------------------------ | ----------------- | ------------------------- |
| basic    | 0.255 ms   | 0.488 ms | 0 / 80                               | 12 337            | 185.0 / 1 480.4           |
| swarm    | 2.210 ms   | 2.677 ms | 99 / 224                             | 22 393            | 335.9 / 2 687.2           |

Niveaux/classes indiqués à l'initialisation ; les morts/réapparitions suivent les
règles FFA ordinaires et peuvent réduire le niveau et ramener à une branche antérieure.
`swarm` tente de reprendre son chemin de classe au niveau autorisé après réapparition.

## Teams et Maze : configuration et règles

Le serveur choisit `seed` **avant** la génération, puis appelle
`prepareModeConfig(resolveModeConfig(mode, options), seed)` (export additionnel de
`@diep-fried/sim`). Le résultat contient les rectangles définitifs : `Room` reçoit
cette configuration et la passe à la simulation ; `room.joined.config` transmet
la même carte. `createSimulation` copie la configuration reçue sans la régénérer.
Un appelant hors serveur doit donc appeler `prepareModeConfig` lui-même pour les
presets Teams/Maze. Les cartes explicitement fournies sont préservées. Le helper
importe les générateurs locaux de `src/maps`, sans les modifier.

`teams2` déclare Bleu/Rouge ; `teams4` ajoute Vert/Violet, identifiants 1–4.
Au join, le camp le moins peuplé est choisi, égalités selon l'ordre des équipes.
Le comptage inclut les morts encore connectés ; le respawn conserve le camp.
Les alliés ne se blessent pas avec les presets sans friendly fire, y compris par
corps, drones, minions et projectiles. Les corps alliés restent solides.
Les spawns sont contenus dans la zone `spawn` de leur base, au rayon près.

La base est un sanctuaire **autoritaire** : tanks ennemis et formes neutres sont
bloqués à son périmètre, les tirs ennemis y sont détruits. Le mouvement est balayé,
y compris pour les drones/minions ; aucune commande god ne contourne la barrière.
Un tank entièrement dans sa propre base est invulnérable même en tirant ;
`spawnProtected` expose cette protection par le champ existant. Les projectiles
alliés peuvent sortir. Les formes neutres apparaissent et dérivent hors des bases.
Quatre drones indestructibles par base, rayon 18, vitesse maximale 500, dégâts 120
par impact (rechargement de contact ordinaire), chassent les tanks hostiles dans
une bande extérieure de 220 unités puis reviennent en garde. Ils sont transmis
comme `ProjectileState` de famille `drone`, équipe de la base et `ownerId` égal à
leur propre identifiant ; aucun propriétaire humain ni récompense de kill.
Ce sont des paramètres calibrables, pas des valeurs historiques. Les gardes utilisent
le rendu de projectile existant, sans nouvelle famille d'entité ni modification client.

Maze utilise les rectangles générés par `generateMaze`. Tous les corps subissent
un balayage cercle/rectangle : glissement des tanks/drones/minions/pièges et rebond
des formes. Les tirs balistiques sont supprimés au premier mur, après les impacts
antérieurs ; Firework explose au point d'arrêt. La bouche des canons est aussi
balayée pour empêcher un tir de naître derrière un mur. La séparation des corps et
la remise en laisse des drones ne peuvent pas les téléporter à travers les murs.
Le ciblage autonome (tourelles, drones et minions) requiert une ligne de vue libre.
Il n'y a pas de recherche de chemin : une unité guidée vers l'autre côté d'un mur
reste bloquée ou glisse, jusqu'à ce que sa cible ou la commande change.

## Commandes Sandbox (extension additive v1)

`PlayerCommand` accepte `{ type: 'sandbox', action }`, où `action` vaut uniquement
`levelUp | cycleClass | selfDestruct | toggleGod`. Le codec valide cette liste et
reconstruit l'objet ; niveau, classe ou booléen d'autorisation fournis en plus sont
ignorés. La simulation vérifie **uniquement** `config.sandbox.cheats` et la présence
d'un tank vivant. Le preset Sandbox l'active ; FFA/Teams/Maze le désactivent. Les
messages valides mais non autorisés sont ignorés, sans événement ni changement.

- `levelUp` ajoute exactement un niveau jusqu'à `min(45, maxLevel)`, en complétant
  l'XP du prochain seuil. Les points et l'événement `levelUp` suivent les règles
  ordinaires ; au plafond il ne se passe rien.
- `cycleClass` parcourt les 54 clés du catalogue dans leur ordre de déclaration,
  puis revient à Tank, indépendamment du niveau requis. Niveau, score et stats
  compatibles sont conservés ; les stats hors plafond sont remboursées. Canons,
  rechargements, camouflage et caméra sont réinitialisés, les anciens drones/minions
  sont nettoyés ; les autres projectiles suivent les règles ordinaires de changement
  de classe. La santé conserve les dégâts reçus, avec au moins 1 PV.
- `selfDestruct` émet la mort ordinaire, même sous god, sans XP de kill pour personne.
  Les conditions de respawn restent celles du mode. Les gains posthumes de tirs déjà
  présents suivent la règle ordinaire ; le suicide ne donne lui-même aucun XP.
- `toggleGod` commute l'immunité, exposée par `spawnProtected`, et résiste aux tirs
  même en tirant. Le second toggle rétablit la protection ordinaire de spawn/base.
  L'état god est effacé à la mort/au respawn ; il ne se transmet pas à une nouvelle vie.

`test/modes-gameplay.test.ts` couvre équilibrage et réapparition, alliés, bases et
neutralité des récompenses des gardes, spawns et formes hors murs, tirs rapides,
LoS, drones/minions, les quatre actions et leur refus sans autorisation. Les tests
codec couvrent les nouveaux modes et les actions inconnues/mal typées.

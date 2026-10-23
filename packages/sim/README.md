# Simulation FFA / Sandbox

`createSimulation({ config, seed })` est le nouvel export de simulation autoritaire,
conforme à `Simulation`. Le serveur doit choisir cette fabrique à l'intégration.
`createPlaceholderSimulation` reste disponible et inchangée. Aucun contrat réseau,
modèle partagé ni dépendance n'a changé. Les quatre évolutions du Tank sont maintenant
présentes dans le registre de contenu partagé ; les branches de niveau 30+ restent vides.

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
  rattrapés après relâchement. Cadence arrondie au prochain tick disponible.
- Grille spatiale à cellules de 128 unités et boîtes balayées. Les contacts circulaires
  sont calculés en mouvement relatif et traités par temps d'impact, puis identifiants.
  Les corps sont intégrés en sous-pas d'au plus 8 unités de déplacement prévu
  (32 sous-pas maximum). Les projectiles utilisent un balayage continu même à faible
  fréquence ; une balle traverse au maximum chaque cible une fois. Les collisions de
  corps séparent les positions et annulent la vitesse relative entrante. Les formes
  se séparent sans se blesser. Les dégâts de contact mutuels sont prélevés avant les
  récompenses, pour permettre deux morts simultanées.
- Durabilité des balles indépendante de leurs dégâts : chaque impact consomme 8 PV
  contre une forme, `14 + 3 × bodyDamage` contre un tank, et les dégâts de la balle
  adverse contre une balle. Chaque cible reçoit un impact par balle, même si le
  contact dure plusieurs sous-pas. Les balles durables poursuivent leur trajectoire.
- Destruction d'une forme : récompense unique 10/25/130 XP selon son type. Un kill de
  tank donne `100 + floor(scoreVictime × 0.25)` XP, au coup fatal. Pas d'assistances.
  Les projectiles encore en vol peuvent rapporter des XP après la mort de leur
  propriétaire. Une déconnexion retire aussi ses projectiles. `DeathInfo` décrit le
  tank au moment du coup fatal ; les gains posthumes restent sur le joueur.
- Score = XP cumulé. Une apparition initiale au `startLevel` reçoit le score du seuil
  correspondant (utile pour accélérer Sandbox). Une mort garde le score affiché jusqu'à
  une commande `respawn` acceptée au plus tôt à `respawnTick` ; pas de réapparition
  automatique, pas de mise en attente d'une commande trop précoce. Au respawn :
  `floor(score × scoreKeptOnDeath)`, niveau recalculé, Tank, stats à zéro et points
  disponibles correspondant au niveau conservé. L'identifiant d'entité est neuf.
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

Ce lot ne branche pas le serveur sur la nouvelle fabrique. Pas de drones, pièges,
équipes, murs Maze, nid/alpha/crashers, triche réseau Sandbox ou classes de niveau 30+.
Les formes utilisent des collisions circulaires, une dérive initiale et une rotation,
sans IA ni régénération. L'apparition cherche une zone dégagée pendant 32 essais,
puis prend la meilleure candidate : une arène saturée peut encore contenir des
chevauchements initiaux. Le filtre de vue économise le réseau, pas la simulation.
La physique de foule compacte est approchée par séparation locale ; le balayage
continu garantit la détection des balles, sans résoudre un système rigide global.

Mesure locale reproductible : `node --import tsx packages/sim/bench/load.mjs` depuis
la racine (30 secondes simulées, 8 joueurs niveau 15 en mouvement/tir continus,
classes Twin/Machine Gun, 200 formes, graine 17, snapshots à 15 Hz). Première mesure
sur ce worktree : pas moyen 0.242 ms, p95 0.452 ms ; 12 183 octets et 46.5 entités en
moyenne par snapshot, soit **182.8 kB/s par joueur**, **1 462 kB/s agrégés**. Il s'agit
des payloads JSON UTF-8 complets, sans compression, enveloppe réseau ni coût WebSocket.
Le débit reste élevé malgré le filtre de vue ; delta, cadence de classement et
compression sont des pistes pour un lot réseau ultérieur. Les temps CPU sont
indicatifs de cette machine, pas une garantie de charge serveur.

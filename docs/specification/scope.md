# Spécification Fonctionnelle, Périmètre v1 & Matrice de Complétude — diep-fried.io

**Date de référence** : 23 octobre 2026  
**Auteur / Rôle** : Sous-agent de recherche et spécification gameplay  
**Statut** : Proposition de spécification, relue le 23 octobre 2026 — à valider par le coordinateur. Les valeurs numériques et choix techniques ne sont des exigences contraignantes que s'ils sont marqués **Documenté** et explicitement ratifiés ; sinon ce sont des **propositions** (voir `uncertainties.md`).  
**Légende** : _Documenté_ = rapporté par une source publique datée ; _Proposition_ = choix de conception du chercheur à valider ; _Non résolu_ = ambigu ou dépendant de la version.  
**Worktree / Branche** : `t3/gameplay-research-spec`

---

## 1. Vision et principes directeurs

`diep-fried.io` est un jeu multijoueur 2D en arène, autonome, libre et auto-hébergeable, inspiré des mécaniques classiques de _Diep.io_. Le projet permet à un groupe d'amis de lancer un serveur en quelques secondes, de partager une URL de salon privé et de jouer sans dépendance externe.

### Principes directeurs (la simulation autoritaire et l'absence d'assets propriétaires viennent du cadrage du projet ; les détails techniques sont des propositions) :

1. **Simulation autoritaire (proposition d'architecture à ratifier)** : Le serveur exécute la physique à pas fixe (fixed-timestep), détecte et résout les collisions, gère les points de vie, l'attribution des points d'expérience, les niveaux et la validation des tirs. Le client n'est qu'un afficheur prédictif et interpolé.
2. **Zéro code ni actif propriétaire** (cadrage du projet, `docs/DEVELOPMENT.md`) : Aucune ressource graphique propriétaire, aucun fichier WebAssembly ou bundle JavaScript original n'est extrait ou importé. L'intégralité du rendu repose sur des primitives vectorielles procédurales (cercles, rectangles, polygones réguliers, contours sombres) décrites par du code libre.
3. **Souveraineté et auto-hébergement** : Aucun appel à des régies publicitaires, traqueurs, SDK de monétisation ou services d'authentification centralisés. La configuration d'un salon s'effectue via variables d'environnement, arguments CLI ou interface de lobby intégrée.
4. **Démarche scientifique de modélisation** : Toute constante physique ou courbe mathématique non accessible publiquement est explicitement documentée comme un choix de notre jeu (_game design decision_) et calibrée pour le confort de jeu, sans prétention de fidélité au code serveur d'origine, qui n'a pas été analysé.

---

## 2. Périmètre fonctionnel v1 vs extensions futures

### 2.1 Périmètre v1 (Socle MVP et modes compétitifs essentiels)

Le périmètre v1 constitue le contrat cible pour le premier produit jouable complet :

- **FFA (Free For All)** :
  - Arène fermée standard (proposition : $4000 \times 4000$ unités de simulation, à calibrer).
  - Distribution continue de formes géométriques neutres (Carrés, Triangles, Pentagones) avec nid central dense (_Pentagon Nest_) peuplé de Pentagones, Alpha Pentagons et Crashers agressifs.
  - Tableau des scores dynamique (_Leaderboard_) affichant en temps réel les 10 meilleurs joueurs de la salle.
  - Réapparition au niveau $\max(1, \min(22, \lfloor \text{niveau} / 2 \rfloor))$ (proposition ; le minimum 1 évite le niveau 0 aux niveaux 1 ; le plafond 22 n'a d'effet que si le niveau dépasse 45 — voir `uncertainties.md`).
- **Sandbox (Terrain d'essai / Laboratoire privé)** :
  - Arène isolée de taille réduite (proposition : $2000 \times 2000$).
  - Commandes de triche et de test activées pour le propriétaire du salon (raccourcis du jeu d'origine à re-tester ; les touches ci-dessous sont les touches retenues par le remake) :
    - Touche `\` : Ouvre/applique un changement instantané de classe sans restriction d'arbre (l'interface exacte — cycle vs sélection — est à définir).
    - Touche `K` : Montée de niveau (+1 par appui ; un saut direct au niveau 45 n'est pas défini et reste une question ouverte).
    - Touche `O` : Suicide / Réinitialisation immédiate.
    - Touche `;` : Bascule d'invulnérabilité (Godmode).
- **2 Teams & 4 Teams** :
  - 2 Équipes (Bleu vs Rouge) ou 4 Équipes (Bleu, Rouge, Vert, Violet).
  - Sanctuaires d'apparition protégés (règles de proposition, à valider) : zones de couleur d'équipe dans lesquelles les tirs adverses sont bloqués, gardées par des drones protecteurs (_Base Protectors_) conçus pour éliminer rapidement tout ennemi s'y aventurant.
  - Désactivation du tir allié (_friendly-fire_ nul) pour les tirs, drones et collisions.
- **Maze (Labyrinthe)** :
  - Arène cloisonnée par un réseau procédural de murs infranchissables.
  - Les murs sont indestructibles en v1 (choix) et bloquent les déplacements des tanks, le passage des projectiles, des drones et des pièges, ainsi que la visibilité directe (rayon de champ de vision contraint par la géométrie).

### 2.2 Modes à objectifs documentés (Jalon v1.5 / Post-MVP)

Ces modes reposent sur la même boucle de simulation mais introduisent des conditions de fin de partie et des entités spécifiques. Note : `docs/DEVELOPMENT.md` place « modes à objectifs, IA et boss » au jalon 4 ; l'étiquette « v1.5 » ci-dessous désigne un périmètre hors socle MVP, et son rattachement exact à un jalon reste à arbitrer par le coordinateur.

- **Domination** :
  - Arène 2 équipes avec 4 Dominators neutres situés aux points cardinaux.
  - Attaquer un Dominator réduit ses PV ; une fois détruit, il bascule sous le contrôle de l'équipe ayant asséné le coup de grâce et tire sur l'équipe adverse.
  - Victoire dès qu'une équipe contrôle simultanément les 4 Dominators, déclenchant l'intervention des Arena Closers.
- **Tag** :
  - Mode infection (variantes à 2 ou 4 équipes, règles documentées mais non vérifiées). Lorsqu'un joueur est tué, il réapparaît immédiatement dans l'équipe de son assaillant.
  - Fin de partie dès qu'une seule équipe a converti la totalité des joueurs connectés.

### 2.3 Modes historiques, incertains ou non retenus en v1

- **Capture the Flag (CTF)** et **Breakout** : modes à objectifs cités par la documentation communautaire (`docs/research/diep-io-inventaire.md` §7) ; CTF apparaît aussi dans le texte indexé du site officiel. Règles, rotation et disponibilité actuelles **non résolues**. Ils font partie du périmètre complet visé mais sont **mis en backlog** (`scopeStage: backlog-uncertain-documentation` dans le catalogue) en attente d'une documentation fiable ; ils ne sont ni abandonnés ni spécifiés.

- **Mothership** : Deux vaisseaux-mères colossaux (niveau 140) pilotés par des joueurs. Mode historique, documenté dans le catalogue mais exclu de la v1.
- **Survival / Battle Royale** : Arène à 10 joueurs avec bordure rétrécissant continuellement. Le sélecteur observé dans le DOM s'intitule « Battle Royale » ; son identité avec le mode historique Survival est une hypothèse. Exclu de la v1 en raison des besoins d'ordonnancement de lobby spécifiques.

---

## 3. Réconciliation formelle du catalogue des classes

### 3.1 Résolution du delta 51 vs 54 classes

L'inventaire préliminaire (`docs/research/diep-io-inventaire.md`) recensait 51 noms de classes. La documentation officielle et les sources communautaires de référence attestent de **54 classes normales jouables**.

L'analyse comparative détaillée met en évidence que l'inventaire initial omettait la branche **Shotgun** (confirmée par la page Upgrades du wiki, vérification du coordinateur du 23 octobre 2026). Les catégories du wiki incluent d'anciens tanks : le total ne doit pas être recalculé à partir d'elles.

1. **Shotgun** (Tier 3 — Niveau 30) : branche issue du Machine Gun, portant le nombre de tanks Tier 3 de 12 à **13**.
2. **Pellet Shot** (Tier 4 — Niveau 45) : évolution du Shotgun tirant des volées de plombs (30 selon la description communautaire, non vérifié) avec champ de vision étendu, portant le nombre de tanks Tier 4 de 34 à 35.
3. **Dual-Barrel** (Tier 4 — Niveau 45) : évolution du Shotgun dotée de deux canons jumeaux à recul important (convention de commande : voir §3.4), portant le nombre final de tanks Tier 4 à **36**.

$$\text{Total classes normales} = 1\ (\text{Tier 1}) + 4\ (\text{Tier 2}) + 13\ (\text{Tier 3}) + 36\ (\text{Tier 4}) = \mathbf{54}$$

### 3.2 Graphe d'évolution hiérarchique

```
Tier 1 (Niveau 1)
└── Tank
    ├── Tier 2 (Niveau 15) : Twin
    │   ├── Tier 3 (Niveau 30) : Triple Shot
    │   │   ├── Tier 4 (Niveau 45) : Triplet
    │   │   ├── Tier 4 (Niveau 45) : Penta Shot
    │   │   └── Tier 4 (Niveau 45) : Spread Shot
    │   ├── Tier 3 (Niveau 30) : Quad Tank (aussi via Flank Guard)
    │   │   ├── Tier 4 (Niveau 45) : Octo Tank
    │   │   └── Tier 4 (Niveau 45) : Auto 5 (aussi via Auto 3)
    │   └── Tier 3 (Niveau 30) : Twin Flank (aussi via Flank Guard)
    │       ├── Tier 4 (Niveau 45) : Triple Twin
    │       └── Tier 4 (Niveau 45) : Battleship (aussi via Overseer)
    │
    ├── Tier 2 (Niveau 15) : Sniper
    │   ├── Tier 3 (Niveau 30) : Assassin
    │   │   ├── Tier 4 (Niveau 45) : Ranger
    │   │   └── Tier 4 (Niveau 45) : Stalker
    │   ├── Tier 3 (Niveau 30) : Overseer
    │   │   ├── Tier 4 (Niveau 45) : Overlord
    │   │   ├── Tier 4 (Niveau 45) : Necromancer
    │   │   ├── Tier 4 (Niveau 45) : Manager
    │   │   ├── Tier 4 (Niveau 45) : Overtrapper (aussi via Trapper)
    │   │   ├── Tier 4 (Niveau 45) : Battleship (aussi via Twin Flank)
    │   │   └── Tier 4 (Niveau 45) : Factory
    │   ├── Tier 3 (Niveau 30) : Hunter
    │   │   ├── Tier 4 (Niveau 45) : Predator
    │   │   └── Tier 4 (Niveau 45) : Streamliner (aussi via Gunner)
    │   └── Tier 3 (Niveau 30) : Trapper
    │       ├── Tier 4 (Niveau 45) : Tri-Trapper
    │       ├── Tier 4 (Niveau 45) : Gunner Trapper (aussi via Gunner)
    │       ├── Tier 4 (Niveau 45) : Mega Trapper
    │       ├── Tier 4 (Niveau 45) : Auto Trapper
    │       └── Tier 4 (Niveau 45) : Overtrapper (aussi via Overseer)
    │
    ├── Tier 2 (Niveau 15) : Machine Gun
    │   ├── Tier 3 (Niveau 30) : Destroyer
    │   │   ├── Tier 4 (Niveau 45) : Hybrid
    │   │   ├── Tier 4 (Niveau 45) : Annihilator
    │   │   ├── Tier 4 (Niveau 45) : Skimmer
    │   │   ├── Tier 4 (Niveau 45) : Rocketeer
    │   │   ├── Tier 4 (Niveau 45) : Glider
    │   │   └── Tier 4 (Niveau 45) : Firework
    │   ├── Tier 3 (Niveau 30) : Gunner
    │   │   ├── Tier 4 (Niveau 45) : Auto Gunner (aussi via Auto 3)
    │   │   ├── Tier 4 (Niveau 45) : Gunner Trapper (aussi via Trapper)
    │   │   └── Tier 4 (Niveau 45) : Streamliner (aussi via Hunter)
    │   ├── Tier 3 (Niveau 30) : Shotgun
    │   │   ├── Tier 4 (Niveau 45) : Pellet Shot
    │   │   └── Tier 4 (Niveau 45) : Dual-Barrel
    │   └── [Tier-Jump direct au Niveau 45] : Sprayer
    │
    ├── Tier 2 (Niveau 15) : Flank Guard
    │   ├── Tier 3 (Niveau 30) : Tri-Angle
    │   │   ├── Tier 4 (Niveau 45) : Booster
    │   │   └── Tier 4 (Niveau 45) : Fighter
    │   ├── Tier 3 (Niveau 30) : Quad Tank (partagé avec Twin)
    │   ├── Tier 3 (Niveau 30) : Twin Flank (partagé avec Twin)
    │   └── Tier 3 (Niveau 30) : Auto 3
    │       ├── Tier 4 (Niveau 45) : Auto 5 (partagé avec Quad Tank)
    │       └── Tier 4 (Niveau 45) : Auto Gunner (partagé avec Gunner)
    │
    ├── [Tier-Jump direct au Niveau 30] : Smasher
    │   ├── Tier 4 (Niveau 45) : Landmine
    │   ├── Tier 4 (Niveau 45) : Auto Smasher
    │   └── Tier 4 (Niveau 45) : Spike
    │
    └── [Tier-Jump direct au Niveau 45] : Auto Tank
```

### 3.3 Exceptions de saut de Tier (_Tier-Jumping_)

Les arêtes à plusieurs parents (Quad Tank, Twin Flank, Auto 5, Auto Gunner, Battleship, Overtrapper, Streamliner, Gunner Trapper) sont reprises de la documentation communautaire et n'ont pas été revérifiées une à une ; seul le total de 54 classes a été confirmé.

1. **Smasher** : Se débloque au niveau 30 en restant sous la forme du Tank de base (Tier 1). Ne passe pas par le Tier 2. Possède un profil de statistiques spécifique (Plafond de 10 points sur 4 stats corporelles, stats de balles désactivées).
2. **Sprayer** : Se débloque au niveau 45 en restant sous la forme du Machine Gun (Tier 2). Ne passe pas par le Tier 3.
3. **Auto Tank** : Se débloque directement au niveau 45 en restant sous la forme du Tank de base (Tier 1), en sautant à la fois le Tier 2 et le Tier 3.

### 3.4 Conventions de version retenues par le remake

- **Dual-Barrel** : le changelog du wiki (https://diepio.fandom.com/wiki/Changelog) signale, selon la vérification du coordinateur, un changement au **2 novembre 2025** (deux canons déclenchés par le clic gauche, tir décalé). _Convention retenue (choix du remake)_ : comportement actuel — clic gauche / Espace tire les deux canons en décalé ; l'ancienne convention clic gauche = canon gauche / clic droit = canon droit est **héritée** et non implémentée en v1. Le texte exact du changelog n'a pas pu être relu par le relecteur (HTTP 402).

---

## 4. Matrice de complétude technique pour développeurs

| Sous-système             | Composants requis                                                                       | Statut v1                                                                 | Dépendances            | Contrats & Règles clés                                                                                                                                                                                                                                                                                                     |
| :----------------------- | :-------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monde & Espace**       | Arène rectangulaire, grille de fond, partitionnement spatial (Spatial Hash Grid)        | **Inclus**                                                                | Moteur mathématique 2D | Limites solides fermées avec rebond amorti. Partitionnement spatial visant un coût moyen proche de $O(1)$ par requête pour le broadphase (à mesurer).                                                                                                                                                                      |
| **Physique & Dynamique** | Intégration Euler semi-implicite, frottement visqueux, impulsion de recul (_recoil_)    | **Inclus**                                                                | Monde                  | $\vec{v}_{t+1} = (\vec{v}_t + \frac{\vec{F}}{m}\Delta t) \cdot (1 - \mu\Delta t)$. Recul additif lié à la masse et à la vitesse du projectile tiré (proposition). La formule, le coefficient $\mu$ et son unité (par tick ou par seconde) sont à valider ; elle doit être exprimée indépendamment de la fréquence de tick. |
| **Combat & Projectiles** | Balles, plombs, missiles, dispersion angulaire, cadences de tir déphasées               | **Inclus**                                                                | Physique               | Pénétration et santé du projectile décrémentées simultanément à l'impact selon les dégâts adverses.                                                                                                                                                                                                                        |
| **Drones & Minions**     | Drones triangulaires (Overseer/Overlord), carrés (Necromancer), minions armés (Factory) | **Inclus**                                                                | IA & Input joueur      | Suivi dynamique de la position curseur. Répulsion/dispersion en maintenant le clic droit / Maj. Capacité maximale par tank (valeurs du catalogue, à valider).                                                                                                                                                              |
| **Pièges & Barrières**   | Pièges triangulaires décélérant rapidement et persistant au sol                         | **Inclus**                                                                | Physique               | Durée de vie proposée : 30 secondes (valeur à valider). Collision contre projectiles adverses.                                                                                                                                                                                                                             |
| **Progression & Stats**  | 8 attributs, distribution de 33 points, formule d'expérience exponentielle              | **Inclus**                                                                | Boucle joueur          | Plafond à 7 points (10 pour Smasher). Points distribués aux niveaux 2–28 continus, puis 30, 33, 36, 39, 42, 45.                                                                                                                                                                                                            |
| **Formes neutres**       | Carrés, Triangles, Pentagones, Alpha Pentagons, Crashers                                | **Inclus**                                                                | Spatial Hash Grid      | Régénération automatique du stock de formes. Distribution nest central. Crashers ciblant le tank le plus proche dans le nid.                                                                                                                                                                                               |
| **Tourelles autonomes**  | Tourelles Auto 3, Auto 5, tourelles secondaires sur châssis                             | **Inclus**                                                                | Détection d'entités    | Rotation indépendante $360^\circ$. Ciblage prioritaire : 1) joueurs ennemis menaçants, 2) Crashers, 3) formes neutres.                                                                                                                                                                                                     |
| **Arène & Modes v1**     | FFA, Sandbox, 2 Teams, 4 Teams, Maze                                                    | **Inclus**                                                                | Gestionnaire de salon  | Zones de bases d'équipe avec drones protecteurs (proposition). Murs de Maze indestructibles en v1.                                                                                                                                                                                                                         |
| **Réseau & Salons**      | Serveur WebSocket autoritaire, serialization JSON/binaire compact, salons privés        | **Inclus**                                                                | Node.js / WS           | Identifiant de salon unique (UUID/slug dans l'URL). Tick serveur fixe (30 ou 60 Hz : à qualifier par mesure). Envoi d'états différentiels (proposition ; protocole JSON puis éventuellement binaire, à décider après mesure).                                                                                              |
| **Client Canvas & HUD**  | Canvas 2D procédural, interpolation fluide, barre de vie/XP, minimap, leaderboard       | **Inclus**                                                                | Client browser         | Rendu vectoriel sans images rasterisées. Raccourcis AZERTY/QWERTY configurables. Écran de mort avec stats de partie.                                                                                                                                                                                                       |
| **Boss d'arène**         | Guardian, Summoner, Defender, Fallen Overlord, Fallen Booster                           | **Post-v1** (v1.5)                                                        | IA de boss             | Horloge d'apparition automatique (intervalle de 10-15 minutes : proposition non vérifiée). Comportements d'attaque avancés.                                                                                                                                                                                                |
| **Modes à objectifs**    | Domination (4 Dominators), Tag ; CTF et Breakout en backlog incertain                   | **Post-v1** (v1.5) ; CTF/Breakout : **backlog, documentation incertaine** | Contrôle de zones      | Dominators pilotables par touche H, boucle de capture de balise.                                                                                                                                                                                                                                                           |

---

## 5. Backlog d'implémentation ordonné par dépendances

Ce backlog séquentiel garantit qu'aucune couche logicielle n'est construite sur une base manquante :

### Étape 1 : Socle géométrique, physique et salon FFA minimal

1. **Module Math & Partage** : Vecteurs 2D, cercles, polygones, collisions Cercle-Cercle et Cercle-Segment, grille spatiale (`SpatialHashGrid`).
2. **Boucle serveur autoritaire** : Boucle fixed-step (cadence proposée 60 ticks/s, à qualifier par mesure), gestionnaire de salon privé (Room Manager avec code d'accès dans l'URL), protocole WebSocket d'échanges d'inputs et d'états (format JSON/binaire à décider).
3. **Entités élémentaires** : Châssis circulaire du joueur (Tank de base Tier 1), canon simple orienté par l'angle de visée, formes neutres statiques (Carrés, Triangles, Pentagones).
4. **Physique & Tir** : Déplacement inertiel (accélération WASD/ZQSD + frottement), recul à l'éjection de balle, collision et destruction des formes avec gain de score.
5. **Client Canvas 2D de base** : Rendu du fond quadrillé, dessin procédural des tanks et balles avec contours sombres, interpolation des positions distantes (`snapshot interpolation`).

### Étape 2 : Sandbox, système de progression et Tier 2

1. **Mode Sandbox** : Implémentation du switch de classe (`\`), montée de niveau (`K`), suicide (`O`) et invulnérabilité (`;`).
2. **Système de progression** : Table d'expérience (1 à 45), attribution des 33 points de compétence, mise à jour dynamique des 8 statistiques (régénération, santé max, dégâts de contact, vitesse des balles, pénétration, dégâts des balles, cadence de tir/reload, vitesse de déplacement — il n'existe pas de statistique « recul »).
3. **Classes Tier 2 (Niveau 15)** :
   - `Twin` : 2 canons parallèles à tirs alternés.
   - `Sniper` : 1 canon long, vitesse de balle accrue, cadence réduite, multiplicateur FOV ($1.25\times$).
   - `Machine Gun` : 1 canon trapézoïdal à dispersion aléatoire et cadence élevée.
   - `Flank Guard` : 1 canon frontal standard + 1 canon arrière à impulsion de propulsion.

### Étape 3 : Familles avancées Tier 3 & Drones élémentaires

1. **Pénétration & Durabilité des projectiles** : Modélisation de l'épuisement simultané de la santé des balles lors des collisions balle-contre-balle.
2. **Classes Tier 3 (13 classes)** :
   - Spammers : `Triple Shot`, `Quad Tank`, `Twin Flank`, `Gunner`.
   - Snipers : `Assassin` ($1.5\times$ FOV), `Hunter` (tirs concentriques à calibres multiples).
   - Heavy : `Destroyer` (balle géante, recul massif pour propulsion).
   - Shotgun : `Shotgun` (grappe de plombs à dispersion conique ; 12 plombs/30° sont des propositions).
   - Thruster : `Tri-Angle` (deux propulseurs arrière à $150^\circ$, accélération extrême).
   - Tourelles IA : `Auto 3` (3 tourelles indépendantes à détection $360^\circ$).
   - Drones : `Overseer` (génération de drones, plafond de 8 selon le catalogue, contrôlés à la souris, commandes gauche/droite).
   - Pièges : `Trapper` (pose de structures triangulaires persistantes).
   - Rammer : `Smasher` (châssis renforcé sans canon, saut de tier depuis Tank, plafond de 10 points).

### Étape 4 : Déploiement complet des 36 classes Tier 4

1. **Finalisation des 36 classes Tier 4 par groupes (les familles du catalogue sont un regroupement choisi, non officiel)** :
   - Spammers ultimes : `Triplet`, `Penta Shot` (éventail 5 canons à recul important), `Spread Shot`, `Octo Tank`, `Triple Twin`, `Auto 5`, `Auto Gunner`, `Sprayer`.
   - Snipers ultimes : `Ranger` ($1.75\times$ FOV), `Stalker` (invisibilité complète à l'arrêt), `Predator` (décalage de caméra au clic droit), `Streamliner` (5 canons empilés).
   - Drones ultimes : `Overlord` (4 spawners rapides), `Necromancer` (conversion des carrés neutres en essaim), `Manager` (drones + camouflage), `Factory` (minions tank autonomes), `Battleship` (micro-drones essaims).
   - Trappers ultimes : `Tri-Trapper`, `Gunner Trapper`, `Mega Trapper`, `Auto Trapper`, `Overtrapper`.
   - Heavy & Missiles : `Annihilator`, `Hybrid` (Destroyer + drones de défense), `Skimmer` (missiles propulsés par balles arrière), `Rocketeer` (roquettes à propulsion unique), `Glider`, `Firework`.
   - Shotguns ultimes : `Pellet Shot` (volée de plombs), `Dual-Barrel` (deux canons, convention de commande §3.4).
   - Rammers & Thrusters : `Booster`, `Fighter`, `Landmine`, `Spike`, `Auto Smasher`, `Auto Tank`.

### Étape 5 : Équipes (2 Teams / 4 Teams) et Labyrinthe (Maze)

1. **Gestion des équipes** : Matrice d'alliances, couleur des entités synchronisée, désactivation du friendly-fire.
2. **Sanctuaires de base** : Délimitation des zones de sécurité, drones de base (létaux, paramètres à calibrer) chassant tout intrus ennemi.
3. **Moteur de Labyrinthe (Maze)** : Générateur procédural de grille de blocs infranchissables, collision solide rigide cercle-rectangle, occlusion de champ de vision.

### Étape 6 : Validation, Polish d'ergonomie et Packaging d'auto-hébergement

1. **Interface & HUD** : Minimap avec position du joueur et zones de bases, affichage du ping/FPS, arbre d'évolution interactif (touche `Y`).
2. **Configuration et conteneurisation** : Fichier de config JSON/ENV (vitesse de tick, slots max, port), Dockerfile d'auto-hébergement autonome.

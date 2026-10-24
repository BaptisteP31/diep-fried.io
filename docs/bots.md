# Bots Joueurs Synthétiques de diep-fried.io

## 1. Vue d'ensemble

diep-fried.io intègre des bots joueurs synthétiques permettant de jouer seul ou accompagné dans tous les salons et modes de jeu.

Les bots sont implémentés via un décorateur transparent `createBotSimulation(options)` conforme à l'interface `SimulationFactory`. Ce wrapper encapsule l'instance autoritaire produite par `createSimulation(options)` sans altérer le moteur interne (`world.ts`), garantissant que la simulation pure reste strictement déterministe, injectable et découplée du transport réseau.

Le serveur (`apps/server`) utilise `createBotSimulation` comme fabrique par défaut pour tous les salons.

## 2. Contrat d'API et configuration

### 2.1 Options de salon (`RoomOptions`)

À la création d'un salon (`room.create`), le créateur peut spécifier :

```ts
export interface RoomOptions {
  maxPlayers?: number;
  arenaSize?: 'small' | 'medium' | 'large';
  shapeDensity?: 'low' | 'normal' | 'high';
  /** Nombre de bots joueurs souhaité (entier entre 0 et 12). Option 0 désactive les bots. */
  botCount?: number;
  /** Niveau de difficulté des bots : 'easy' | 'normal' | 'hard'. Défaut: 'normal'. */
  botDifficulty?: BotDifficulty;
}
```

### 2.2 Configuration résolue (`ModeConfig`)

`resolveModeConfig(mode, options)` résout la configuration de manière additive et sécurisée :

```ts
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotConfig {
  count: number;
  difficulty: BotDifficulty;
}

export interface ModeConfig {
  // ...
  /** Bots synthétiques du salon. Absent si non configuré. */
  bots?: BotConfig;
}
```

- **Valeurs par défaut** : 5 bots, difficulté `'normal'`.
- **Plafond dur** : le nombre de bots est plafonné à `Math.min(12, maxPlayers - 1)`.
- **Désactivation** : l'option `botCount: 0` positionne `config.bots = { count: 0, difficulty }`, ce qui désactive totalement l'apparition des bots.
- **Validation réseau et bornage** : le codec `decodeClientMessage` valide strictement les types (entier 0..12 pour `botCount`, énumération valide pour `botDifficulty`) et rejette tout message malformé avec une erreur non fatale. Le résolveur applique un bornage défensif contre `NaN`, les valeurs non finies ou négatives pour `maxPlayers` et `botCount`.

## 3. Identité et équité des bots

Les bots sont des joueurs légitimes dans l'univers de simulation :

- **Identifiants positifs réservés** : plage réservée `BOT_ID_BASE = 900_000` (identifiants `900_001` à `900_012`). Les identifiants négatifs restent strictement réservés aux entités IA internes de `world.ts` (bosses, dominators, mothership).
- **Pseudonymes distincts** : préfixe `[BOT] ` (`[BOT] Alpha`, `[BOT] Bravo`, etc.).
- **Aucune triche** : ils débutent au niveau de départ du mode avec le tank de base (`tank`). Ils récoltent des formes ou combattent pour acquérir de l'expérience, dépensent leurs points de statistiques (`upgradeStat`) et choisissent leurs évolutions (`chooseClass`) uniquement parmi les choix légalement proposés par l'arbre de classes. Ils n'ont aucun accès aux commandes de triche Sandbox, aucune invulnérabilité artificielle, ni vision omnisciente.
- **Rounds et classement** : ils comptent pour le quorum de joueurs des modes à objectifs (`MatchConfig.minPlayers`) et figurent dans le classement (`leaderboard`) des snapshots. Ils ne possèdent ni socket WebSocket, ni session réseau, ni jeton de reprise.

## 4. Priorité humaine et cycle de vie

- **Comptage `maxPlayers`** : la limite de joueurs de l'arène inclut humains + bots.
- **Slots prioritaires aux humains** : à mesure que des joueurs humains rejoignent le salon, le wrapper réduit la population active de bots pour libérer les places jusqu'à `maxPlayers`. L'éviction des bots intervient avant l'insertion du joueur humain dans la simulation sous-jacente, garantissant que la capacité maximale n'est jamais dépassée. Si des humains quittent, la population de bots est restaurée.
- **Réinsertion propre des bots** : lorsqu'un bot est retiré puis réinséré au départ d'un humain, son état tactique et spatial (points de passage, destination, détection de blocage, cibles) est réinitialisé (`brain.reset()`) pour éviter toute manœuvre obsolète, tout en préservant la stricte monotonie de `seq`.
- **Nettoyage automatique (cleanup)** : dès que le dernier joueur humain quitte le salon, tous les bots sont retirés de la simulation. Le salon ne reste pas artificiellement actif et s'éteint normalement selon son délai d'inactivité (`emptyRoomTtlMs`).
- **Distinction des métriques** : `Room.playerCount` et l'endpoint `/healthz` comptent uniquement les joueurs humains connectés (sièges actifs). Les bots résident exclusivement au sein de la simulation.
- **Reconnexion sans duplication** : la reconnexion d'un joueur existant (`Room.resume`) ne déclenche aucun nouvel appel d'ajout de joueur et ne duplique pas les bots.
- **Monotonie de séquence** : la séquence `seq` des intentions de chaque bot croît de manière strictement monotone et n'est jamais réinitialisée lors des changements ou remises à zéro de round.

## 5. Intelligence artificielle et navigation

L'IA des bots est entièrement autoritaire et déterministe, alimentée par une graine `Rng` dérivée de la graine du salon :

- **Cadence de pensée 5–10 Hz** : la prise de décision de haut niveau s'exécute à 7,5 Hz (toutes les 4 frames de simulation à 30 Hz) avec déphasage selon l'indice du bot pour lisser le temps CPU par tick. Les intentions motrices (`move`, `aim`, `fire`) sont maintenues et émises à 30 Hz.
- **Perception autoritaire** : les bots n'accèdent jamais à l'état interne de `World`. Ils perçoivent leur environnement uniquement via `snapshotFor(botId)`. Les tanks ennemis invisibles (`opacity === 0`) sont filtrés en amont par la simulation et restent indétectables par les bots.
- **Navigation et évitement d'obstacles** :
  - Les murs de la carte (`config.map.walls`) et les bases ennemies (`config.map.zones`) sont traités comme des obstacles infranchissables.
  - Évitement local : calcul de faisceaux de balayage par segments (`sweepCircleVsWalls`) avec rayon augmenté d'une marge de sécurité.
  - Grille A* globale : pour les arènes avec labyrinthes (Maze), un graphe de navigation sur grille à budget d'expansion borné calcule les points de passage (waypoints).
  - Anti-blocage : détection d'immobilité prolongée et manœuvre d'échappement aléatoire garantissant que les bots ne restent pas bloqués indéfiniment contre les murs.
- **Contrat de visée (`PlayerInput.aim`)** : l'orientation et le guidage s'expriment strictement par un vecteur relatif au centre du tank en unités monde (et non des coordonnées absolues), borné défensivement par `LIMITS.maxAimDistance`.
- **Profils de difficulté** :
  - `easy` : réaction lente, lissage de visée important, dispersion aléatoire accrue (jusqu'à ±0,22 rad), seuil de fuite bas (PV < 25%).
  - `normal` : réaction équilibrée, dispersion modérée (jusqu'à ±0,09 rad), seuil de fuite standard (PV < 35%).
  - `hard` : visée vive avec anticipation balistique (lead) précise, dispersion minimale (±0,02 rad), seuil de fuite réactif (PV < 40%).
- **Comportements et objectifs** :
  - _Farming_ : destruction des formes neutres visibles pour monter en niveau.
  - _Combat_ : engagement des adversaires visibles à distance optimale, esquive par pas latéraux (strafing), sans s'aventurer dans les bases ennemies.
  - _Fuite_ : repli tactique en cas de santé critique ou face aux essaims de drones / boss (confiné dans la `safeZone` en mode Survival).
  - _CTF_ : transport du drapeau ennemi vers la base et le drapeau alliés afin de marquer le point ; récupération des drapeaux alliés tombés ; assaut des drapeaux adverses disponibles (non portés, hors base ennemie) ; respect strict de `positionHidden` (les coordonnées masquées d'un drapeau porté par un adversaire invisible ne sont pas poursuivies).
  - _Domination_ : attaque et capture des Dominators neutres ou ennemis.
  - _Breakout_ : occupation et défense des territoires.
  - _Survival_ : maintien obligatoire à l'intérieur de la zone sûre (`safeZone`) ; en cas d'élimination, le bot passe spectateur et attend le round suivant pour réapparaître avec un état tactique neuf.
  - _Tag_ : traque des joueurs des camps adverses.

## 6. Limites documentées de l'IA

1. **Absence de coordination stratégique d'équipe** : les bots prennent leurs décisions de manière individuelle et n'exécutent pas de stratégies complexes coordonnées (pas de tirs de barrage combinés ni de répartition hiérarchique des rôles).
2. **Mémoire spatiale à court terme** : les bots ne cartographient pas la position historique des ennemis au-delà de leur champ de vision actuel.
3. **Navigation discrétisée** : la grille de navigation A* utilise un maillage grossier de 160 unités pour rester extrêmement rapide (< 0,1 ms par requête). Dans des configurations géométriques très étroites ou alambiquées, des trajectoires sous-optimales peuvent être observées.
4. **Pas d'apprentissage automatique** : les comportements sont des heuristiques déterministes calibrées pour offrir un jeu vivant, réactif et plaisant sans surcharge serveur.

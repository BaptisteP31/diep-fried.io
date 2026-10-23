# Architecture de diep-fried.io

État : contrats v1, 54 classes jouables, modes FFA/Sandbox/Teams/Maze (extensions additives ci-dessous). Ce document fait référence pour l'API partagée ; toute modification d'un contrat listé ici passe par le coordinateur et met ce fichier à jour dans le même commit.

Rappel : toutes les constantes numériques du dépôt (tick, tailles, santé, vitesses, délais, densités) sont des **choix de diep-fried.io**, pas des mesures du jeu original. Seules les couleurs de `apps/client/src/render/palette.ts` proviennent du relevé `docs/research/rendering-assets/verified-css-tokens.json`.

## 1. Vue d'ensemble

```
navigateur                                    serveur Node (un seul processus)
┌──────────────────────────────┐   WebSocket  ┌────────────────────────────────────────┐
│ apps/client                  │   JSON /ws   │ apps/server                            │
│  input ─► PlayerInput (seq) ─┼─────────────►│ transport/Session ─► rooms/Room        │
│  net/GameConnection          │              │                        │ setInput      │
│  state/SnapshotBuffer ◄──────┼──────────────┼── snapshot ◄── Room ◄──┤ step()        │
│  render/Renderer (Canvas 2D) │              │                        ▼               │
└──────────────────────────────┘              │ packages/sim  Simulation (autoritaire) │
         ▲ fichiers statiques, /healthz       │ http.ts : /healthz + client construit  │
         └────────────────────────────────────┴────────────────────────────────────────┘
                     packages/shared : modèle, protocole, contenu (importé partout)
```

- Le serveur est autoritaire : le client n'envoie que des **intentions** (direction, point visé, boutons) et des **commandes** ponctuelles ; il ne dicte jamais une position, un dégât ou un niveau.
- La simulation avance à pas fixe (`ModeConfig.tickRate`, 30 Hz par défaut) et envoie un snapshot complet filtré par joueur tous les `snapshotInterval` ticks (2, soit 15 Hz).
- Le client affiche le monde avec un retard d'interpolation de deux intervalles de snapshot (≈ 133 ms par défaut). La prédiction locale est prévue (section 8), pas implémentée.
- Un seul processus sert le client construit, `/healthz` et `/ws` sur le même port : l'auto-hébergement se résume à `npm ci && npm run build && npm start`.

## 2. Choix techniques et compromis

| Sujet                   | Choix                                                                                                    | Compromis accepté                                                                                                                                                  |
| :---------------------- | :------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Langage                 | TypeScript strict partout (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)                     | Code plus verbeux aux frontières (validation, options).                                                                                                            |
| Organisation            | npm workspaces, 4 paquets, aucune étape de build entre paquets : chaque paquet exporte ses sources `.ts` | Les paquets internes ne sont pas publiables tels quels ; Vite, esbuild, tsx et Vitest les compilent à la volée.                                                    |
| Pureté de la simulation | `packages/shared` et `packages/sim` vérifiés avec `lib: ES2023` et `types: []`                           | `setTimeout`, `document`, `process`, `Buffer` y provoquent une erreur de typecheck : c'est voulu.                                                                  |
| Client                  | Vite 8, Canvas 2D, DOM natif pour les menus, aucun framework                                             | Interface à écrire à la main ; suffisant pour un HUD et quelques écrans.                                                                                           |
| Serveur                 | Node ≥ 22.12, `node:http` + `ws`, pas de framework HTTP                                                  | Fichiers statiques servis par un petit gestionnaire maison (traversée de chemin testée).                                                                           |
| Build serveur           | esbuild regroupe `apps/server` et les paquets internes en `dist/main.js` ; seul `ws` reste externe       | Les erreurs d'exécution pointent vers le bundle (source maps activées).                                                                                            |
| Format réseau           | JSON texte, snapshots complets                                                                           | ≈ 750 octets par snapshot pour un seul tank, à 15 Hz. Le codec est isolé dans `protocol/codec.ts` ; on mesurera avant de passer au binaire ou au delta.            |
| Tick                    | 30 Hz simulation, 15 Hz snapshots                                                                        | Non mesuré sur l'original ; réglable par mode.                                                                                                                     |
| Déterminisme            | `Rng` à graine, pas fixe, aucune horloge dans la simulation                                              | Permet le rejeu, les tests et une future prédiction client. Ne garantit pas l'identité binaire entre moteurs JS (flottants) : ne pas en dépendre pour du lockstep. |
| Salons                  | En mémoire, code à 6 caractères, fermeture après 60 s vide                                               | Un redémarrage perd les parties : acceptable entre amis, sans base de données.                                                                                     |
| Tests                   | Vitest à la racine, tests de comportement et d'intégration réelle (serveur sur port 0, vrais sockets)    | Pas de tests de rendu pixel ; le rendu se vérifie visuellement.                                                                                                    |
| Style                   | Prettier (`npm run format`), pas d'ESLint au jalon 1                                                     | Moins de garde-fous ; réduit les conflits de format entre agents.                                                                                                  |
| TypeScript              | 7.x (compilateur natif), uniquement pour le typecheck                                                    | Si un outil exige l'API JS de TypeScript 5, épingler `typescript@5` dans ce paquet.                                                                                |

Installation reproductible : `package-lock.json` est versionné ; utiliser `npm ci`. npm 12 bloque le script `postinstall` d'esbuild : ce n'est pas nécessaire, le binaire de plateforme est installé par une dépendance optionnelle (build vérifié dans ces conditions).

## 3. Répertoires et responsabilités

| Répertoire                      | Contenu                                                                                                       | Responsable                      | Règle                                                                                                 |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------ | :------------------------------- | :---------------------------------------------------------------------------------------------------- |
| `packages/shared/src/model/`    | Identifiants, géométrie, statistiques, états d'entités, configuration de mode, intentions/commandes/snapshots | Coordinateur (contrat)           | Changement incompatible = `PROTOCOL_VERSION + 1` et mise à jour de ce document.                       |
| `packages/shared/src/protocol/` | Version, limites, messages, codec et validation                                                               | Agent réseau, revue coordinateur | Tout message client est validé dans `codec.ts` et testé (valide + rejets).                            |
| `packages/shared/src/content/`  | Définitions de classes (canons, plafonds), presets de modes                                                   | Agent simulation                 | Données seulement ; le client les lit pour dessiner.                                                  |
| `packages/sim/`                 | Interface `Simulation`, horloge, RNG, règles de mode, simulation provisoire puis complète                     | Agent simulation                 | Aucune dépendance au DOM, à Node, au réseau ou à l'heure.                                             |
| `apps/server/`                  | HTTP (`/healthz`, statique), WebSocket, sessions, salons, configuration                                       | Agent réseau                     | Aucune règle de jeu : le salon traduit entre transport et `Simulation`.                               |
| `apps/client/`                  | Connexion, entrées, interpolation, rendu, interface                                                           | Agent client                     | Ne lit que les snapshots ; aucune règle de jeu autoritaire.                                           |
| `assets/`                       | Polices Ubuntu et leur licence                                                                                | Coordinateur                     | Toute ressource tierce ajoutée au client est déclarée dans `NOTICES` de `apps/client/vite.config.ts`. |
| `docs/`                         | Recherches, architecture, développement                                                                       | Coordinateur                     | `docs/research/asset-collection/reference-only/` reste hors Git.                                      |

Graphe de dépendances autorisé : `shared` ← `sim` ← `server` ; `shared` ← `client`. Le client pourra importer `sim` pour la prédiction ; `sim` n'importe jamais `server` ni `client`.

## 4. API exacte

Les définitions TypeScript font foi ; cette section résume leur sens. Point d'entrée unique : `@diep-fried/shared` et `@diep-fried/sim`.

### 4.1 Modèle (`packages/shared/src/model`)

- Repère monde : x vers la droite, y vers le bas, arène `[0, width] × [0, height]`. Angles en radians, 0 = +x.
- `EntityId`, `PlayerId`, `Tick` : entiers attribués par le serveur, jamais réutilisés dans un salon. Un joueur garde son `PlayerId` d'une vie à l'autre ; son `EntityId` change à chaque apparition.
- `TeamId` : `0` neutre (formes), `1..4` équipes déclarées par `ModeConfig.teams`, `≥ 100` équipe individuelle d'un joueur en FFA. Couleur côté client : même équipe que soi → bleu, équipe déclarée → sa couleur, sinon rouge.
- `ClassId` : slug `^[a-z][a-z0-9-]{0,31}$`, jamais un identifiant numérique historique.
- `STAT_IDS` : ordre contractuel des 8 statistiques (touches 1 à 8) : `healthRegen, maxHealth, bodyDamage, bulletSpeed, bulletPenetration, bulletDamage, reload, movementSpeed`.
- `EntityState = TankState | ProjectileState | ShapeState`, discriminée par `kind`. Champs communs : `id, x, y, vx, vy, angle, radius, team`.
  - `TankState` : `playerId | null`, `name`, `classId`, `level`, `score`, `health`, `maxHealth`, `opacity`, `barrelShots` (tick du dernier tir par canon, pour le recul visuel), `spawnProtected`. Ajouts optionnels : `barrelAngles` (orientations monde des canons autonomes, tableau de même longueur que `barrelShots`) et `cameraOffset: { x, y }` (décalage monde demandé par Predator + Alt). Le filtre serveur suit ce décalage ; le rendu client doit encore le consommer.
  - `ProjectileState` : `family` (`bullet | drone | trap | missile | minion`), `ownerId`, `health?`, `maxHealth?`. Ajouts optionnels : `bodyShape?: circle | triangle | square`, `classId?` (classe de lancement), `barrelShots?` pour missiles/minions. Les tirs secondaires gardent comme `ownerId` le tank racine, pour attribution, équipes et nettoyage. Tous ces ajouts sont facultatifs ; les anciens snapshots restent valides, sans changement de version.
  - `ShapeState` : `shape` (`square | triangle | pentagon | alphaPentagon | crasher`), `shiny`, `health`, `maxHealth`.
- `PlayerInput` : `{ seq, move: {x,y} ∈ [-1,1]², aim: {x,y} relatif au tank (≤ 10 000), fire, alt }`. État maintenu, valable jusqu'au suivant ; `seq` strictement croissant par connexion (des trous sont permis).
- `PlayerCommand` : `upgradeStat { stat }`, `chooseClass { classId }`, `respawn`, ajout v1 `sandbox { action: levelUp | cycleClass | selfDestruct | toggleGod }`. Le codec valide strictement les quatre actions ; seule la simulation autorise une triche si `config.sandbox.cheats` et tank vivant. Toute commande impossible/non autorisée est ignorée.
- `SnapshotPayload` : `{ tick, ackSeq, self: SelfState, entities, leaderboard? }`. Une entité absente a disparu ou est hors de vue : le client peut l'estomper localement.
- `SelfState` : `playerId, entityId | null, alive, classId, level, score, levelProgress (0..1), statPoints, stats, statCaps, classChoices, view, respawnTick | null`. `view` = demi-étendue visible en unités monde sur le plus grand axe de l'écran.
- `DeathInfo` : `playerId, tick, killerName | null, score, level, classId, respawnTick`.
- `MODE_IDS = [ffa, sandbox, teams2, teams4, maze]` (extension additive v1).
- `ModeConfig` : configuration résolue d'un salon (`mode, tickRate, snapshotInterval, arena, maxPlayers, teams, friendlyFire, map { walls, zones }, shapes { targetCount }, progression { maxLevel, startLevel, scoreKeptOnDeath }, respawn { delayTicks }, sandbox { cheats }`).
- `RoomOptions` : réglages demandables à la création (`maxPlayers?`, `arenaSize?: small|medium|large`, `shapeDensity?: low|normal|high`), bornés par `resolveModeConfig`.

### 4.2 Protocole (`packages/shared/src/protocol`)

- `PROTOCOL_VERSION = 1`, WebSocket sur `WS_PATH = /ws`, santé sur `HEALTH_PATH = /healthz`.
- Un message = un objet JSON texte discriminé par `t`. Messages binaires refusés. Taille client ≤ 4096 octets (`ws.maxPayload`).
- Séquence : connexion → `hello` → `welcome` (ou `error protocol_mismatch` fatal, fermeture 1008) → `room.create` | `room.join` → `room.joined` → flux.

| Sens | `t`           | Charge                                            | Phase                                                                                                      |
| :--- | :------------ | :------------------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| C→S  | `hello`       | `protocol, client`                                | poignée de main (seul message accepté, sinon erreur fatale)                                                |
| C→S  | `room.create` | `name, mode, options: RoomOptions`                | hors salon                                                                                                 |
| C→S  | `room.join`   | `code, name, resumeToken?`                        | hors salon                                                                                                 |
| C→S  | `room.leave`  | —                                                 | en salon                                                                                                   |
| C→S  | `input`       | `input: PlayerInput`                              | en salon                                                                                                   |
| C→S  | `command`     | `command: PlayerCommand`                          | en salon                                                                                                   |
| C→S  | `ping`        | `id`                                              | toujours                                                                                                   |
| S→C  | `welcome`     | `protocol, server`                                | après `hello`                                                                                              |
| S→C  | `room.joined` | `code, playerId, config: ModeConfig, resumeToken` | après création ou entrée                                                                                   |
| S→C  | `room.left`   | `reason: requested                                | closed                                                                                                     | kicked`          |     |
| S→C  | `snapshot`    | `SnapshotPayload`                                 | tous les `snapshotInterval` ticks ; abandonnable si le client est en retard                                |
| S→C  | `death`       | `DeathInfo`                                       | à la mort du tank du joueur                                                                                |
| S→C  | `notice`      | `text`                                            | arrivées, départs, éliminations                                                                            |
| S→C  | `pong`        | `id, tick                                         | null`                                                                                                      | réponse à `ping` |
| S→C  | `error`       | `code, message, fatal`                            | `protocol_mismatch, bad_message, unexpected_message, room_not_found, room_full, server_full, rate_limited` |

- `decodeClientMessage` valide chaque champ et reconstruit l'objet (champs inconnus ignorés, pseudonyme nettoyé et limité à 16 caractères). Un message invalide produit `error bad_message` non fatal.
- Compatibilité : ajouter un champ optionnel ou un membre d'union reste dans la version courante si les clients existants peuvent l'ignorer ; retirer, renommer ou changer le sens d'un champ incrémente `PROTOCOL_VERSION`.
- Codes de salon : 6 caractères de `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Lien de partage : `/?room=CODE`.

### 4.3 Simulation (`packages/sim`)

```ts
interface Simulation {
  readonly config: ModeConfig;
  readonly tick: Tick;
  addPlayer(playerId, { name }): void; // tank présent après le prochain step()
  removePlayer(playerId): void; // sans effet si inconnu
  setInput(playerId, input): void; // seq non croissants ignorés
  queueCommand(playerId, command): void; // appliquée au prochain step(), ordre d'arrivée
  step(): SimEvent[]; // exactement un tick ; 'spawn' | 'death' | 'levelUp'
  snapshotFor(playerId): SnapshotPayload | undefined;
}
type SimulationFactory = (options: { config: ModeConfig; seed: number }) => Simulation;
```

- Le serveur possède l'horloge (`FixedStepClock`, rattrapage limité à 5 ticks par appel, retard au-delà abandonné et compté) ; la simulation ne lit jamais l'heure.
- Ordre recommandé d'un `step()` : intentions et commandes → mouvement/accélération/frottement → tirs → collisions (partition spatiale) → dégâts → morts et récompenses → règles de mode → apparitions (formes, réapparitions).
- `ModeRules` (`assignTeam`, `spawnPoint`, `canDamage`) isole ce qui varie selon le mode ; FFA, Sandbox, Teams 2/4 et Maze sont implémentés. `ModeContext.teamSizes?` ajoute un comptage optionnel des camps (morts connectés inclus), sans changer `Simulation`.
- `createPlaceholderSimulation` : tank immobile par joueur, orientation de visée appliquée, aucune règle de jeu. Il sert à faire tourner serveur et client en attendant la simulation complète, qui le remplace derrière la même interface.
- `packages/sim/test/simulation-contract.ts` fournit `describeSimulationContract(nom, fabrique)` : toute implémentation doit passer cette suite (ticks, apparition, bornes de l'arène, `ackSeq`, joueurs inconnus, déterminisme).

### 4.4 Contenu (`packages/shared/src/content`)

- `ClassDefinition` : `id, name, level, upgradesTo, barrels, statCaps?, view, speed, droneLimit?`. Paramètres optionnels de classe : `dronesPerReload`, `bodyHealth`, `bodyDamage`, `mass`, `stealth { delay, fade }`, `altCameraDistance`.
- `BarrelDefinition` (repère local, unités = rayon du corps) : `angle, offset, length, width, tipWidth?, delay, projectile` et multiplicateurs `reload, damage, penetration, speed, spread, recoil`. La même définition sert à la simulation (tirs) et au rendu (canons, vignettes, arbre). Paramètres optionnels de canon : `pellets`, `auto`, `autonomous`, `conversionOnly`, `lifetime`, `radius`, `missile` (`skimmer | rocketeer | glider | firework`).
- `STARTING_CLASS = 'tank'` ; 54 classes du catalogue sont définies, réparties 1/4/13/36 aux niveaux 1/15/30/45, toutes accessibles par des arêtes validées. `DEFAULT_STAT_CAP = 7` ; corps Smasher à 10 et statistiques de tir interdites remboursées. Les règles détaillées et limites sont dans `packages/sim/README.md`.
- `resolveModeConfig(mode, options)` renvoie une copie indépendante du preset. Pour Teams/Maze, le serveur choisit la graine puis appelle l’export additionnel `prepareModeConfig(config, seed)` de `@diep-fried/sim`, qui importe les générateurs locaux de cartes. Ce résultat est passé à `Room` et à `Simulation`, puis envoyé tel quel dans `room.joined.config`. La simulation ne régénère jamais une carte cachée ; les appelants hors serveur doivent résoudre la carte avant de la construire.

### 4.5 Serveur (variables d'environnement)

| Variable             | Défaut                         | Rôle                                     |
| :------------------- | :----------------------------- | :--------------------------------------- |
| `HOST`               | `0.0.0.0`                      | Interface d'écoute                       |
| `PORT`               | `8080`                         | Port HTTP et WebSocket                   |
| `STATIC_DIR`         | `apps/client/dist` s'il existe | Client servi ; vide pour désactiver      |
| `MAX_ROOMS`          | `32`                           | Salons simultanés                        |
| `EMPTY_ROOM_TTL_MS`  | `60000`                        | Durée de vie d'un salon vide             |
| `DIEP_FRIED_VERSION` | `dev`                          | Version annoncée (`welcome`, `/healthz`) |

`GET /healthz` → `{ status: "ok", protocol, version, uptimeSeconds, rooms, players }`.

## 5. Familles et modes implémentés

Les familles de classes et les modes sans objectifs sont implémentés dans la simulation :

- **Drones** : `ProjectileState.family = 'drone'` avec `health`, `ClassDefinition.droneLimit`, guidage avec `fire` vers `PlayerInput.aim` (point visé) et `alt` (repousser), défense autonome au repos et portée bornée. Necromancer : conversion de carrés par contact du tank ou de ses drones, capacité `14 + 4 × Reload` (42 au plafond).
- **Pièges** : `family = 'trap'`, frottement fort et longue durée de vie, définis par canon (`projectile: 'trap'`).
- **Missiles et minions** : `family = 'missile' | 'minion'` ; portent les champs optionnels `barrelShots`, `classId`, `bodyShape`. Factory produit des minions armés ; les missiles tirent des balles secondaires ou explosent en éclats.
- **Tourelles automatiques, Smasher, invisibilité** : pilotés par les paramètres de classe/canon ci-dessus ; `TankState.opacity` porte le fondu. Les tourelles choisissent la cible hostile visible la plus proche. Le rendu des géométries avancées reste un lot client distinct.
- **Équipes (2/4 Teams)** : camps équilibrés au join, conservés au respawn ; bases latérales (2) ou aux coins (4). Les presets interdisent les dégâts alliés. Une barrière autoritaire balayée exclut tanks/tirs ennemis et formes des bases. Un tank entièrement dans sa base reste protégé même en tirant (`spawnProtected`). Quatre gardes indestructibles/base chassent les hostiles dans une bande de 220 unités, sans XP humain ; rendu `ProjectileState.family = drone`, `ownerId = id` du garde, aucun nouveau contrat d’entité.
- **Maze** : `map.walls` définitifs envoyés dans `room.joined` ; balayage continu tanks/formes/tirs/drones/minions/pièges, bouches de canon incluses. Les impacts de tirs avant un mur sont résolus puis le mur détruit le projectile ; Firework explose au contact. LoS requise pour le ciblage IA. Pas de pathfinding ni d’occlusion réseau des snapshots.
- **Modes à objectifs (Domination, Tag, CTF…)** : nouveau `ModeId` + preset, crochet de fin de tick dans `ModeRules`, état d'objectif ajouté au snapshot par un champ optionnel.
- **Sandbox** : `sandbox.cheats` autorise `levelUp` (+1, plafond 45 et `maxLevel`), `cycleClass` (54 classes, niveau/score conservés, stats incompatibles remboursées, drones/caméra nettoyés), `selfDestruct` (mort sans XP de kill), `toggleGod` (immunité visible via `spawnProtected`, effacée à la mort/au respawn). Les actions ne donnent aucun pouvoir dans les presets FFA/Teams/Maze ; aucun objectif ni boss dans ce lot. Règles détaillées dans `packages/sim/README.md`.
- **IA et boss** : `TankState.playerId = null` ; leur comportement vit dans la simulation.

## 6. Commandes

```bash
npm ci               # installation reproductible
npm run dev          # serveur (tsx watch, :8080) + client Vite (:5173, proxy /ws et /healthz)
npm run build        # client (apps/client/dist) puis serveur (apps/server/dist/main.js)
npm start            # serveur construit, sert aussi le client construit
npm run typecheck    # tous les paquets ; shared et sim sans DOM ni Node
npm test             # Vitest
npm run format       # Prettier ; npm run check = typecheck + test + format:check
```

## 7. Critères d'acceptation

### Jalon 1 (ce lot)

- [x] `npm ci`, `npm run typecheck`, `npm test`, `npm run build` réussissent depuis un clone propre.
- [x] `npm start` sert le client, `/healthz` et `/ws` sur un seul port.
- [x] Un navigateur crée un salon, reçoit son code et des snapshots ; un second client rejoint par code.
- [x] Contrats versionnés pour états, intentions séquencées, snapshots, salons, mort/réapparition, statistiques/classes et configuration de mode.

### Jalon 2 : partie privée FFA/Sandbox jouable

1. Trois navigateurs sur trois machines rejoignent un même salon via le lien `/?room=CODE`.
2. Déplacement avec accélération et frottement, visée souris, tir avec recul ; rendu fluide à 60 images/s sans saccade visible à 100 ms de latence simulée.
3. Formes neutres (carré, triangle, pentagone) à population maintenue selon `shapes.targetCount`, rotation et dérive.
4. Collisions tank/forme/projectile/tank, pénétration des projectiles, santé, régénération, barres de vie.
5. Score et expérience, niveaux jusqu'à `maxLevel`, points de statistiques dépensables avec 1–8, plafonds respectés.
6. Mort (écran avec responsable et score), réapparition après `respawn.delayTicks` avec `scoreKeptOnDeath`.
7. Classement dans les snapshots ; HUD : score, niveau, barre d'expérience, statistiques.
8. Serveur autoritaire : aucune position, aucun dégât et aucun niveau acceptés du client ; messages invalides ou trop fréquents rejetés (`rate_limited`).
9. Snapshots filtrés par champ de vision ; débit mesuré et consigné pour 8 joueurs et la population de formes par défaut.
10. Déconnexion et retour dans le salon avec `resumeToken` dans un délai de grâce.
11. La simulation complète passe `describeSimulationContract` ; tests de comportement pour mouvement, collisions, dégâts et progression.
12. Démarrage documenté pour un hôte : `npm ci && npm run build && npm start`, derrière un proxy TLS optionnel.

## 8. Risques et parades

| Risque                                            | Parade                                                                                                                              |
| :------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------- |
| Débit JSON trop élevé avec beaucoup d'entités     | Filtrage par vue d'abord, puis mesure ; delta ou binaire seulement derrière `codec.ts`.                                             |
| Latence ressentie sur son propre tank             | Prédiction locale + réconciliation via `ackSeq` (la simulation étant pure, le client peut la réutiliser).                           |
| Surcharge serveur                                 | `FixedStepClock` abandonne le retard et le compte ; à exposer dans `/healthz`. Partition spatiale pour les collisions.              |
| Abus d'un client                                  | Validation stricte existante ; limitation de débit, nombre de connexions par IP et contrôle d'`Origin` à ajouter par le lot réseau. |
| Dérive des contrats entre agents                  | Contrats centralisés dans `shared`, suite de contrat de simulation, revue du coordinateur sur `model/` et `protocol/`.              |
| Constantes inventées présentées comme fidèles     | Toute constante est commentée comme choix ; les mesures futures vont dans `docs/research/` avec leur source.                        |
| Propriété intellectuelle                          | Rendu entièrement procédural, aucun code ni asset du client original ; ressources tierces déclarées avec leur licence.              |
| Écosystème jeune (TypeScript 7, Vite 8, Vitest 5) | Versions verrouillées par le lockfile ; retour à TypeScript 5 possible sans changement de code.                                     |

## 9. Licence

Le code du projet est sous **AGPL-3.0-or-later**, conformément au choix de l’utilisateur. Le texte intégral figure dans [LICENSE](../LICENSE).

Les ressources tierces conservent leur licence : Ubuntu (UFL-1.0), drapeaux flag-icons (MIT) et icône Font Awesome Free (CC BY 4.0). Les avis et textes associés sont conservés dans leurs répertoires et dans les notices du build client. Les références propriétaires locales sont exclues de Git et de la distribution.

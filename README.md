# diep-fried.io

Jeu de tanks multijoueur autonome et auto-hébergeable, inspiré du gameplay classique de Diep.io. Version expérimentale jouable : 54 classes, 11 modes, cinq boss, salons privés, commandes Sandbox, rendu procédural, arbre d’évolution et HUD de rounds. Le serveur est autoritaire et auto-hébergeable.

## Démarrage

Node ≥ 22.12, npm et GNU tar (pour exporter le source du build) :

```sh
npm ci
npm run dev
```

Client sur `http://localhost:5173`. Pour construire et servir sur un seul port : `npm run build`, puis `npm start` (port 8080). Voir [l’auto-hébergement](docs/self-hosting.md).

## Licence

Le code original de ce projet est sous **AGPL-3.0-or-later** : GNU Affero General Public License version 3, ou toute version ultérieure. Texte intégral : [LICENSE](LICENSE).

Les ressources tierces conservent leurs licences et avis : Ubuntu sous UFL-1.0 ; drapeaux flag-icons sous MIT ; icône Font Awesome Free sous CC BY 4.0. Les références propriétaires de recherche ne font pas partie de la distribution.

Pour une instance modifiée accessible en réseau, proposer aux utilisateurs l’accès au code source correspondant conformément à la licence. La publication du code et le lien vers la révision déployée font partie de la préparation d’une diffusion publique.

## Développement

[Architecture](docs/architecture.md), [jalons](docs/DEVELOPMENT.md), [spécification](docs/specification/scope.md), [vérification initiale](docs/qa-first-playable.md).

## Docker Compose et réseau local

```sh
docker compose up -d --build
```

Le jeu est accessible sur `http://IP_DE_LA_MACHINE:8080` depuis les appareils du réseau local. HTTP et WebSocket utilisent le même port. Pour choisir un autre port : `GAME_PORT=8090 docker compose up -d --build`. Logs : `docker compose logs -f game` ; arrêt : `docker compose down`.

## Modes et commandes

FFA, Sandbox, 2 équipes, 4 équipes, Maze, Domination, Tag, Capture du drapeau, Breakout, Survival et Mothership. Les modes à objectifs demandent deux joueurs pour commencer.

Déplacement WASD/flèches (ZQSD sur AZERTY), souris pour viser, clic gauche/Espace pour tirer, E pour le tir automatique, C pour la rotation, 1–8 pour les statistiques et Y pour les évolutions. H prend ou rend un objectif allié proche dans les modes compatibles. Les commandes sont reconfigurables. En Sandbox, les boutons et raccourcis permettent de monter de niveau, changer de classe, s’autodétruire, basculer l’invulnérabilité et invoquer un boss.

## Vérification et limites

`npm run check`, `npm run build`, `node scripts/smoke.mjs --no-build`, `node scripts/load.mjs --no-build` et `npm run smoke:source -- --rebuild` vérifient respectivement types/tests/format, production, réseau, charge et reconstruction du source. La CI couvre Node 22 et 24.

Le jeu cible le navigateur de bureau, clavier et souris. Pas de commandes tactiles ni de prédiction locale ; les coefficients d’équilibrage restent expérimentaux. Les collisions sont circulaires et l’IA n’a pas de pathfinding tactique. Certaines règles, notamment Breakout, sont des conventions documentées du remake et ne constituent pas une reproduction exacte du jeu original. Les parties sont conservées en mémoire et disparaissent au redémarrage du serveur.

Le build de production propose son archive source sous `/source/source.tar.gz`, son manifeste et ses empreintes, ainsi que les avis de licence. Aucun accès aux services officiels de Diep.io n’est nécessaire.

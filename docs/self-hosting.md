# Auto-hébergement

Le serveur HTTP et WebSocket est un processus unique, sans base de données. Les salons, joueurs et jetons sont en mémoire ; un redémarrage les perd. Le serveur utilise encore `createPlaceholderSimulation` par défaut : tanks immobiles, sans formes ni projectiles. L'injection `createGameServer(config, simulationFactory)` reste disponible pour intégrer la simulation complète.

## Lancement local

Node >= 22.12 et npm sont requis. Depuis la racine :

```sh
npm ci
npm run check
npm run build
HOST=127.0.0.1 PORT=8080 npm start
```

Ouvrir `http://localhost:8080`. Le client construit est servi par le même port que `/ws` et `/healthz`. `STATIC_DIR=''` désactive les fichiers statiques. Pour le développement, `npm run dev` lance le proxy Vite sur `http://localhost:5173`.

## Docker

```sh
docker build -t diep-fried .
docker run --rm --name diep-fried -p 127.0.0.1:8080:8080 \
  -e ALLOWED_ORIGINS=https://jeu.example.org \
  -e ALLOW_NO_ORIGIN=false \
  diep-fried
```

Le Dockerfile sépare dépendances, compilation et exécution. L'image finale contient le bundle serveur, le client construit et les dépendances de production ; elle s'exécute sous l'utilisateur `node`. Son healthcheck interroge `/healthz`. `docker stop diep-fried` envoie SIGTERM ; laisser un délai Docker supérieur à `SHUTDOWN_TIMEOUT_MS` (deux secondes par défaut, dix secondes conviennent).

## TLS et reverse proxy

Exemple Caddy : le domaine doit pointer vers l'hôte et les ports 80/443 doivent être accessibles pour obtenir le certificat. Le port Node reste lié à la boucle locale.

```caddyfile
jeu.example.org {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy prend en charge TLS et les upgrades WebSocket. Avec un autre proxy, transmettre `Host`, autoriser l'upgrade HTTP/1.1 `Connection: upgrade` / `Upgrade: websocket` sur `/ws`, et régler son timeout d'inactivité au-dessus de deux intervalles de heartbeat (par exemple 60 secondes). Servir la page en HTTPS produit des connexions `wss://` ; configurer l'origine publique exacte côté serveur :

```sh
HOST=127.0.0.1 PORT=8080 \
ALLOWED_ORIGINS=https://jeu.example.org ALLOW_NO_ORIGIN=false \
MAX_CONNECTIONS_PER_IP=64 npm start
```

Le plafond IP utilise exclusivement l'adresse du pair TCP et ignore `X-Forwarded-For`. Derrière un proxy unique, tous ses utilisateurs partagent donc le même quota : l'augmenter en conséquence et appliquer aussi des limites par IP au proxy. Il n'existe pas de mode « trust proxy » implicite.

## Configuration

Toutes ces valeurs sont des choix d'exploitation à calibrer pour l'hôte.

| Variable                 | Défaut                        | Effet                                                                                                    |
| ------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `HOST` / `PORT`          | `0.0.0.0` / `8080`            | Interface et port HTTP/WS                                                                                |
| `STATIC_DIR`             | `apps/client/dist` si présent | Répertoire statique ; chaîne vide pour désactiver                                                        |
| `DIEP_FRIED_VERSION`     | `dev`                         | Version de `/healthz` et `welcome`                                                                       |
| `MAX_ROOMS`              | `32`                          | Nombre de salons, y compris salons vides en attente d'expiration                                         |
| `EMPTY_ROOM_TTL_MS`      | `60000`                       | Expiration après le dernier siège libéré, balayage toutes les cinq secondes                              |
| `RESUME_GRACE_MS`        | `15000`                       | Réservation du joueur après coupure ; `0` désactive la grâce                                             |
| `MESSAGES_PER_SECOND`    | `120`                         | Recharge du budget par connexion                                                                         |
| `MESSAGE_BURST`          | `240`                         | Capacité initiale et maximale du budget                                                                  |
| `MAX_CONNECTIONS_PER_IP` | `16`                          | Connexions simultanées par adresse TCP, lobby inclus                                                     |
| `ALLOWED_ORIGINS`        | non défini                    | Même hôte et port que `Host`, schéma HTTP(S) ; si défini, liste d'origines exactes séparées par virgules |
| `ALLOW_NO_ORIGIN`        | `true`                        | Autorise les clients natifs/scripts sans en-tête `Origin`                                                |
| `HEARTBEAT_INTERVAL_MS`  | `15000`                       | Ping WS ; terminaison si le pong manque au passage suivant                                               |
| `SHUTDOWN_TIMEOUT_MS`    | `2000`                        | Délai maximal accordé aux fermetures WS avant terminaison forcée                                         |

`ALLOWED_ORIGINS` attend par exemple `https://jeu.example.org,http://localhost:5173`, sans chemin ni slash final. Une valeur vide interdit toute origine présente. L'origine opaque `null` est refusée. Sans `Origin`, seule `ALLOW_NO_ORIGIN` décide, même avec une liste configurée. Le contrôle d'origine protège les navigateurs ; un client natif peut fournir cet en-tête et n'est pas authentifié par ce mécanisme. Pour la production, définir explicitement les origines publiques.

Chaque message de données, y compris invalide, binaire, `ping` applicatif ou antérieur à `hello`, consomme un jeton. Le premier dépassement produit `error rate_limited` fatal et une fermeture 1008. Les trames de contrôle ping/pong WS ne sont pas des messages applicatifs. La limite existante de 4096 octets par message reste appliquée par `ws` (fermeture 1009 si dépassée).

## Reprise et arrêt

Conserver le `resumeToken` de `room.joined` et le code du salon, puis refaire `hello` et `room.join` avec ce jeton sur la nouvelle connexion. Le jeton est un secret bearer aléatoire de 256 bits, envoyé uniquement dans le flux JSON : utiliser TLS, éviter URL et journaux. Le serveur n'en conserve qu'une empreinte SHA-256 et le compare à temps constant. Il demeure stable pendant la vie du siège pour permettre une nouvelle tentative si la réponse de reprise a été perdue.

La reprise conserve `PlayerId`, tank et nom initial. Une connexion encore vivante est remplacée : elle reçoit `room.left kicked` puis une fermeture 1008. Pendant la grâce, le joueur reste dans la simulation, occupe une place et peut subir les effets du jeu ; ses intentions sont neutralisées à la coupure. Une reprise peut recommencer `input.seq` à zéro ; `ackSeq` utilise la séquence de la nouvelle connexion. Un jeton absent signifie une nouvelle entrée ; un jeton fourni mais invalide ou expiré renvoie `bad_message` sans créer de joueur. Le client peut ensuite proposer explicitement une nouvelle entrée sans jeton. `room.leave` libère immédiatement le siège et invalide le jeton.

SIGINT/SIGTERM arrête les horloges, envoie `room.left closed` aux joueurs, ferme joueurs et lobby avec le code WS 1001, puis termine les sockets non coopérantes au délai configuré. Les jetons deviennent invalides. Les détails de compatibilité sont dans [la note réseau](../apps/server/NETWORK.md).

## Santé et mesure de débit

`GET /healthz` garde les champs existants et ajoute `droppedSimulationMs` (cumul du temps abandonné par les horloges, même après expiration d'un salon) et `network` : `connections`, `bytesReceived`, `bytesSent`, `snapshotsSent`, `snapshotsDropped`, `rateLimited`, `rejectedOrigins`, `rejectedConnections`, `heartbeatTimeouts`. `players` inclut les sièges réservés pendant la grâce. Les compteurs repartent à zéro au redémarrage.

Les octets sont les charges utiles WS : réception des messages livrés par `ws`, même invalides, et envois réussis au transport. Ils excluent trames, TCP, TLS, HTTP, ping/pong WS et messages trop gros rejetés avant livraison. Ils ne prouvent pas la réception par le navigateur. Les snapshots dont la file d'envoi dépasse 256 Kio sont abandonnés et comptés ; les autres messages gardent leur ordre.

Mesure reproductible, huit sockets réels sur la boucle locale :

```sh
npx tsx apps/server/scripts/measure-bandwidth.ts 3000
```

Le 23 octobre 2026, Node 26.12.1, fenêtre de 3,000 s : 360 snapshots, environ 15 snapshots/s/joueur, 2 556 octets/snapshot, 306 710 octets/s sortants au total et 38 339 octets/s/joueur (environ 300 Kio/s au total, 37,4 Kio/s/joueur). Les positions étant aléatoires, le nombre exact d'octets varie légèrement. L'image Docker cible séparément Node 22.

**Limite de cette mesure :** le placeholder affiche huit tanks immobiles, zéro forme et zéro projectile, alors que le preset demande 200 formes. Ce résultat mesure le transport actuel et ne valide ni le débit ni la charge CPU d'une partie complète. Refaire la mesure avec la simulation intégrée, sa population réelle de formes et des joueurs actifs avant de dimensionner un hébergement. Aucun binaire ni delta n'est introduit.

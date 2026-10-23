# Mesure réseau et charge locale

Campagne du 23 octobre 2026, commit des scripts
`26486dbabcb753e941875bae068ac9881a9cd421`, runtime issu de
`75893866c46155c49323f1fbe8939bb8fb7ac0bf` (inchangé par ces scripts).
Ces résultats décrivent un scénario local ; ils ne garantissent pas une capacité
d'hébergement ni une validation exhaustive du jeu.

## Reproduction

```sh
npm ci
npm run build
node scripts/smoke.mjs --no-build
node scripts/load.mjs --no-build
```

Sans `--no-build`, chaque script reconstruit client et serveur. Le JSON final
inclut SHA, version Node et métriques. Le script lance un processus séparé du
**bundle serveur de production**, en utilisant le même exécutable Node que le
pilote ; `PORT=0` laisse l'OS attribuer un port libre, sans réservation préalable.
Il ne remplace pas la simulation et n'importe aucune implémentation interne de
`sim`, `shared`, `client` ou `server`. Il utilise HTTP et le protocole JSON public,
via la dépendance `ws` déjà présente au serveur.

Le smoke connecte deux clients ; la charge en connecte huit pendant au moins
30 secondes après leur arrivée en FFA. Arène et densité de formes restent aux
valeurs du preset ; huit places sont demandées. Chaque client transmet environ
20 intentions/s, se déplace en cercle et maintient le tir avec une visée tournante.
Les morts déclenchent des commandes publiques `respawn` jusqu'à acceptation.
Aucune triche, injection de simulation ni hausse de niveau artificielle.

À mi-parcours, une socket est fermée puis remplacée : `hello`, `room.join` avec
le jeton reçu, vérification du même PlayerId et reprise des séquences depuis zéro.
Les jetons ne sont pas journalisés. Le chronomètre inclut cette courte reprise.

Les assertions vérifient :

- `hello/welcome`, création/jonction et identifiant de version ; santé HTTP ;
- snapshots progressifs sans interruption supérieure à 3 s ; acquittements ;
- déplacement physique, tirs de canon, présence de formes pour chaque connexion,
  et observation d'au moins un projectile dans le scénario ;
- nombres finis et rejet des `null` inattendus issus d'une sérialisation NaN/Infinity ;
- reprise du même joueur, absence d'erreur serveur/fermeture inattendue/crash ;
- départ explicite, puis zéro joueur, zéro socket et suppression du salon vide ;
- arrêt SIGTERM avec un joueur dans un salon et une socket lobby :
  `room.left closed`, fermetures WS 1001 et processus terminé avec le code 0 ;
- un seul HTML de production, absence de fichiers QA/référence, HTTP des licences
  et égalité des textes AGPL/UFL et des deux TTF avec les sources du dépôt.

Le nettoyage accélère uniquement `EMPTY_ROOM_TTL_MS` à zéro ; le balayage reste
celui du serveur (5 s) et l'assertion attend au plus 8 s. Les autres réglages réseau
et de gameplay gardent leurs valeurs normales dans l'environnement de mesure.
Les sockets sont terminées et le processus enfant arrêté dans `finally` en cas
d'échec. Chaque exécution utilise son propre port et ses propres salons.

## Méthode de mesure

Les deltas de `/healthz.network` sont pris entre le début et la fin de la fenêtre
d'activité. `bytesSent` et `bytesReceived` mesurent la **charge utile WS**, sans
en-têtes WS/TCP/TLS, HTTP ou ping/pong de contrôle. Le débit sortant par joueur
est une moyenne du total, pas le débit maximal d'un client.

`snapshotsDropped` mesure les abandons pour contre-pression ;
`droppedSimulationMs` mesure le retard abandonné par l'horloge.
`droppedTicksEquivalent = droppedSimulationMs × tickRate / 1000` est une conversion,
pas un compteur indépendant. La cadence observée utilise les ticks de snapshots
du premier client ; les bords de fenêtre l'arrondissent autour de 30 Hz.

La mémoire est le RSS **du processus serveur seul**, lu dans `/proc/<pid>/status`
au début, environ une fois par seconde et à la fin. Le pic est un maximum
échantillonné, pas le pic instantané. Hors Linux, les valeurs sont `null`.
Le RSS du pilote et les buffers noyau sont exclus ; aucune conclusion d'absence
de fuite mémoire ne découle d'une fenêtre de 30 s.

## Résultats observés

Machine partagée : Linux x86_64 7.2.9, Intel Core Ultra 7 155H, 22 processeurs
logiques visibles, environ 31 Gio de RAM. Réseau loopback, sans TLS ni proxy.
Les mesures des deux versions Node sont exécutées séparément en conteneurs
Alpine avec réseau host, sans limite CPU/mémoire imposée. Positions et monde
aléatoires : les débits varient entre répétitions.

Résultats des clones propres sur le commit `26486dbabcb753e941875bae068ac9881a9cd421` :

| Mesure — charge huit joueurs                   | Node 22.23.1 | Node 24.22.1 |
| ---------------------------------------------- | -----------: | -----------: |
| Fenêtre d'activité (s)                         |       30,031 |       30,040 |
| Charge utile sortante totale (octets/s)        |      970 883 |    1 102 061 |
| Sortie moyenne par joueur (octets/s)           |      121 360 |      137 758 |
| Charge utile entrante totale (octets/s)        |       26 145 |       26 185 |
| Snapshots/s au total, fenêtre mesurée          |       120,11 |       120,07 |
| Snapshots reçus, préparation comprise          |        3 651 |        3 652 |
| Cadence observée (Hz)                          |       30,036 |       30,026 |
| Snapshots abandonnés                           |            0 |            0 |
| Simulation abandonnée (ms / ticks équivalents) |        0 / 0 |        0 / 0 |
| RSS début (octets)                             |   97 652 736 |   80 257 024 |
| RSS pic échantillonné (octets)                 |  100 470 784 |   92 332 032 |
| RSS fin (octets)                               |  100 462 592 |   92 323 840 |
| Reprise même joueur, nettoyage, arrêt code 0   |      réussis |      réussis |

Le smoke à deux joueurs passe aussi sur les deux versions : respectivement
2,526 et 2,520 s, zéro snapshot/temps de simulation abandonné, mouvement/tir,
reprise et arrêt validés. Le smoke reconstruit le projet lui-même sur Node 22 ;
Node 24 utilise le build précédent avec `--no-build`.

Les différences de débit ne permettent pas de comparer la performance intrinsèque
des deux versions Node : le monde, les positions et les entités visibles diffèrent
entre ces campagnes non déterministes. Le maximum RSS observé reste proche de
96 Mio sous Node 22 et 88 Mio sous Node 24 pour ces exécutions seulement.

## Limites et prochaine campagne

Huit joueurs de départ avec leurs tanks de base dans un seul salon FFA ne couvrent
pas les 54 classes, la densité maximale, les autres modes, les connexions lentes,
les pertes réseau, le WAN, le TLS, plusieurs salons ni une endurance prolongée.
Ce scénario montre une vraie simulation active avec formes et projectiles,
contrairement aux anciennes mesures de transport sur placeholder.

Les objectifs et boss sont en cours d'intégration ailleurs : aucune conclusion
ne porte sur eux. Après leur intégration, relancer `check`, `build`, smoke et
charge sur le nouveau SHA, conserver le JSON avec la version et ajouter des
scénarios publics dédiés à ces mécaniques. Un résultat à zéro tick perdu sur
cette machine ne constitue pas un budget CPU ni une promesse de capacité.
Les points de préparation de livraison figurent dans [release.md](release.md).

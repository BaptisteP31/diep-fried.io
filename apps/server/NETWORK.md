# Note réseau pour intégration

Cette note complète l'architecture sans modifier `docs/architecture.md`. Le protocole reste en version 1 ; aucune modification de `shared`, de `sim`, des modèles, du lockfile ou des dépendances n'est nécessaire. Les choix de délais et de quotas sont propres à ce serveur, réglables et à calibrer.

## Contrats existants activés

- `room.join.resumeToken` et `room.joined.resumeToken` sont utilisés. Jeton fourni mais inconnu/expiré : `error bad_message`, non fatal, sans nouvelle entrée implicite. Salon inconnu : `room_not_found` inchangé. La reprise est examinée avant le plafond du salon.
- La grâce conserve le siège, le nom et le `PlayerId` sans rappeler `addPlayer`. Une connexion vivante est remplacée par la dernière reprise valide ; l'ancienne reçoit `room.left kicked`, fermeture 1008. Les opérations du salon vérifient l'identité du membre pour qu'un ancien close ne libère jamais le siège repris.
- `room.leave` détruit immédiatement le siège. Une coupure le détache pendant `RESUME_GRACE_MS`, neutralise les boutons et le mouvement via `setInput`, puis appelle `removePlayer` à expiration. Le TTL de salon vide commence seulement après libération de tous les sièges, grâce comprise.
- À l'arrêt : `room.left closed`, fermeture WS 1001, délai borné, puis terminaison forcée. `close()` est idempotent.

## Adaptation des séquences

`Simulation.setInput` ignore les séquences non croissantes pour toute la vie du joueur, alors que le protocole les définit par connexion. Chaque siège possède un compteur interne monotone, indépendant des valeurs client. Chaque entrée acceptée est passée à la simulation avec ce compteur et une correspondance vers la séquence reçue. Les snapshots rétablissent l'acquittement client effectivement appliqué et purgent les correspondances précédentes.

La reprise réinitialise la séquence client et les correspondances, en conservant le compteur simulation. Un input neutre interne empêche de conserver les commandes de l'ancienne socket. Tant qu'aucune entrée de la nouvelle connexion n'est acquittée, `ackSeq` vaut zéro, comme au démarrage. Les doublons et retours en arrière sont ignorés au serveur avant traduction. Même une ancienne entrée à `Number.MAX_SAFE_INTEGER` ne bloque pas une reprise à zéro. Aucun nouvel argument ni reset de simulation n'est requis ; les séquences internes ne sont jamais révélées au client.

## Compatibilité et intégration

`createGameServer(config, simulationFactory)` est conservé ; le placeholder reste le défaut. Les nouvelles propriétés réseau de `ServerConfig` sont optionnelles pour les appelants existants et ont des valeurs par défaut. Les propriétés `/healthz.droppedSimulationMs` et `/healthz.network` sont additives. `RoomMember.end`, l'identité du membre dans les opérations de salon et la grâce passée au gestionnaire sont des interfaces internes au serveur.

Le contrôle Origin est une restriction nouvellement active : par défaut même hôte/port que `Host` pour les navigateurs HTTP(S), clients sans Origin autorisés. Définir `ALLOWED_ORIGINS` pour un client servi depuis une autre origine ; définir `ALLOW_NO_ORIGIN=false` pour exiger l'en-tête. Les limites IP utilisent le pair TCP sans confiance dans les en-têtes proxy. Le heartbeat WS ne dépend pas des messages `ping`/`pong` JSON.

Les tests sockets couvrent reprise après coupure, remplacement vivant, séquences hautes/basses et doublons, jetons faux/vides/d'un autre salon, grâce et capacité, départ explicite, neutralisation au point d'injection, quotas et recharge, libération des upgrades refusés sans fermeture client, origine, heartbeat, taille/binaire, métriques, huit joueurs et arrêt coopérant/non coopérant. Le test de neutralisation observe l'interface de la vraie simulation provisoire ; ce placeholder ne permet pas de vérifier les conséquences physiques des boutons ou du mouvement.

Les instructions d'exploitation, compteurs et la mesure avec ses limites figurent dans [self-hosting.md](../../docs/self-hosting.md). Le coordinateur devra refaire cette mesure et valider le comportement physique à la déconnexion avec `createSimulation` avant de déclarer l'acceptation de la partie complète.

Sous pression de capacité, les salons sans joueur ni siège réservé en grâce sont récupérés avant de refuser une création. Les salons occupés ou reprenables sont conservés.

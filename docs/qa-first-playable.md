# Vérification de la première boucle jouable

23 octobre 2026, branche integration, après intégration des lots réseau, simulation, revue Opus et correction du client d4818cb.

- `npm run check` : typecheck, 168 tests et format passent.
- `npm run build` : client et serveur construits.
- Serveur construit démarré sur 127.0.0.1:8090.
- Navigateur T3 réel : création FFA, arrivée d'un second profil incognito via code de salon, classement affichant les deux joueurs, HUD, minimap et formes visibles.
- requestAnimationFrame observé sur 60 frames, commandes déplacement et tir automatique exercées.
- `/healthz` pendant la session : 2 joueurs, 2 connexions, aucun snapshot ni temps de simulation abandonné.

Cette vérification ne remplace pas un test réseau sur plusieurs machines ni une partie prolongée. Mort/réapparition, collisions et progression sont couverts automatiquement ; pas de validation visuelle exhaustive de ces chemins dans cette session.

Mesure locale du transport avec la vraie simulation : 8 clients tirant en continu, 200 formes configurées, filtrage par vue ; fenêtre de 2 s, environ 15 snapshots/s/joueur, moyenne 9,2 ko/snapshot et 138 ko/s/joueur. Les positions et les interactions varient entre exécutions. Ce débit JSON est encore élevé et sera optimisé après stabilisation du contenu ; il ne comprend ni TCP/TLS ni trames WebSocket.

Reste à développer : classes avancées et comportements, modes équipes et Maze, modes à objectifs, boss, réglages Sandbox complets, optimisation et validation prolongée. Cette étape n'est pas une version complète de Diep.io.

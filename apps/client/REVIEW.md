# Revue d’intégration client

Périmètre : `apps/client/` uniquement, sans prédiction ni changement des contrats,
du serveur ou de la simulation.

- Cycle explicite : `disconnected → connecting → ready → joining → joined`.
  Une intention de menu attend `welcome`, puis les autres entrées sont bloquées
  jusqu’à la réponse. Les événements d’anciennes sockets sont ignorés.
- Une coupure revient au menu. Une nouvelle action recrée la socket ; aucun
  retry automatique. Handshake et entrée expirent après 10 secondes, sans rejeu
  d’une demande dont le résultat est incertain.
- Un refus de reprise `bad_message` ou `room_not_found` supprime le jeton et
  explique l’échec. Le bouton « Nouvelle entrée (sans reprise) » abandonne
  explicitement l’ancienne identité. Aucun repli automatique sans jeton.
- `room.left` demandé, fermé ou expulsé purge l’état et la session enregistrée ;
  la raison reste affichée si le serveur ferme ensuite la socket.
- Un snapshot mort suffit à afficher la réapparition, même sans événement
  `death`. Le résumé utilise alors le score/niveau actuels de `self`, avec
  responsable inconnu ; un délai absent reste en attente du serveur.
- Chaque changement de salon purge tampon, caméra/fondus, entrées/séquences,
  bascules, pings et caches du HUD. Le HUD attend le premier snapshot.
- Choix de classe : un seul chemin via le callback du HUD. La modale capture
  les raccourcis, garde le focus et neutralise les commandes maintenues. Les
  anciens raccourcis supprimés ne réapparaissent plus après rechargement.
- Le stockage inaccessible ne bloque plus le démarrage ou les actions du menu ;
  la session conserve un repli en mémoire pour la durée de la page.

## Vérification

Tests Vitest avec WebSocket injectée : coupure/reconnexion, attente de welcome,
doubles entrées, délais, refus de jeton, erreurs réseau et construction, raisons
de sortie, intégration de main, mort sans événement, neutralisation des entrées
et stockage indisponible. Aucune dépendance ajoutée.

L’image historique `qa-gameplay.jpg` mesure bien 4 178 octets et est entièrement
noire : elle ne valide pas l’interface. `preview_status/open` fonctionne, mais
deux snapshots ont échoué avec `Preview automation snapshot timed out after
15000ms.` Le navigateur de secours n’est pas disponible.

Inspection visuelle effectuée avec `html_preview` de T3 sur le bundle compilé
embarqué : menu, modale/rebind et écran de mort. Viewport fixé à 1280×800 et
polices de secours pour ce rendu isolé. Fixtures réseau pour les écrans en salon ;
assertions navigateur : un clic de classe émet une commande, un rebind n’émet
aucune commande de jeu, un snapshot mort affiche le résumé et le délai attendus.
Ce contrôle ne constitue pas une session multijoueur ni une validation du
gameplay : la simulation de cette base reste un placeholder.

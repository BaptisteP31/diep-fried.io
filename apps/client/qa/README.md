# QA du client objectifs — 24 octobre 2026

Exécution dans le worktree `t3-4a6fcd9f`, branche `t3/objective-mode-client-ui`.
Client construit servi par le serveur local du même worktree sur `127.0.0.1:8093`.
Le serveur parent 8090 n’a pas été modifié. Les règles de simulation et le protocole
n’ont pas été modifiés dans ce lot.

## Navigateur réel

Deux contextes Chromium indépendants, viewport 1440 × 900, puis un troisième
contexte pour l’arrivée Survival en cours de manche. Actions par les boutons,
le clavier et la souris du client construit. Les snapshots WebSocket ont été
observés sans être réécrits ; aucune position, santé ou règle serveur injectée.

- Domination : attente à un joueur, démarrage à deux, quatre objectifs du monde
  et de la minimap, mouvement, commande H envoyée et refusée sans objectif allié
  proche. Captures `domination-waiting`, `domination-playing-alice/bob`.
- CTF : attente et démarrage à deux ; prise du drapeau rouge, transport avec
  indicateur monde/minimap puis retour à la base bleue. Snapshot du score **1–0**
  et des deux drapeaux de nouveau à leur base. Captures `ctf-waiting`,
  `ctf-playing-alice/bob`, `ctf-flag-carried`, `ctf-capture-scored`.
- Mothership : approche du vaisseau allié, possession H confirmée par
  `self.possessing` et `possessedBy`, silhouette hexagonale, seconde pression H
  rétablissant le tank et libérant l’objectif. Captures `mothership-possessed`
  et `mothership-released`.
- Breakout : capture du territoire central par les Bleus ; cinq repères monde
  et minimap. Capture `breakout-territory-captured`.
- Survival : troisième joueur spectateur, bouton de réapparition désactivé ;
  élimination d’un participant hors zone après le délai de rétrécissement réel
  de 60 s, vainqueur Bob annoncé et reprise dans 10 s ; round 2 avec le spectateur
  redevenu vivant. Captures `survival-spectator`, `survival-finished`,
  `survival-next-round`.
- Sandbox : bouton d’invulnérabilité puis `Invoquer un boss`, commande
  `summonBoss` réellement envoyée, Guardian reçu et rendu avec sa silhouette
  triangulaire et ses drones. Capture `sandbox-boss`.

Aucune exception JavaScript de page pendant le scénario réussi.
Les 15 PNG et `evidence.json` sont sauvegardés localement à côté de ce document,
ignorés par Git. Le script de QA et son runtime Playwright sont conservés dans
les répertoires locaux ignorés `node_modules/.objective-qa/` et `.qa-runtime/`.

T3 a été retenté après relance du serveur : navigation réussie mais deux snapshots
ont échoué avec `Preview automation snapshot timed out after 15000ms.`.
Le fallback Chromium/Playwright autorisé a donc été utilisé.

## Contrôles

- `npm run check` : typecheck des quatre workspaces, **439 tests** dans 34 fichiers,
  et contrôle Prettier réussis.
- `npm run build` : bundles client/serveur réussis ; avis AGPL et Ubuntu émis.
- `git diff --check` : réussi.
- Tests client : horloges et résultats issus du serveur, objectifs CTF et santé,
  notifications, corps spéciaux, calques et minimap, spectateur et respawn,
  commande H, remise à zéro interpolation/fondu/entrées et séquence au round
  suivant. Régression ajoutée : préserver le résumé `death` lorsque `self`
  confirme l’élimination, puis le purger au round suivant.

## Limites

La QA navigateur ne couvre pas une victoire complète Domination, les trois
captures gagnantes CTF, la destruction d’un Mothership, la victoire Breakout,
ni chaque variante de boss. Les silhouettes Summoner, Guardian, Dominator et
Mothership sont couvertes par les tests Canvas. Tag et les modes sans objectifs
n’ont pas fait l’objet d’une nouvelle partie navigateur complète dans cette
reprise. Aucun jugement d’équilibrage, de fidélité au jeu original ou de support
tactile n’est déduit de ces essais. Les correctifs de simulation du lot de revue
séparé restent à intégrer par le parent.

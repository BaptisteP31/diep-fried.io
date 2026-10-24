# Validation intégrée — 24 octobre 2026

Version expérimentale de bureau : 54 classes jouables, 11 modes, cinq boss, salons privés et code AGPL-3.0-or-later. Les coefficients et plusieurs règles restent des conventions du remake, sans garantie d’identité avec Diep.io.

## Contrôles automatiques

- Types des quatre workspaces, Prettier et 461 tests Vitest : réussis.
- Six tests Node supplémentaires pour l’archive source : réussis.
- Build client et serveur : réussi ; polices Ubuntu et avis AGPL/UFL/MIT Vite distribués.
- Smoke réseau : deux joueurs, déplacement/tirs, reprise du même joueur, nettoyage et arrêt corrects.
- Charge de huit joueurs pendant 30 s : environ 30 ticks/s, 15 snapshots/s/joueur, 1,14 Mo/s sortants JSON au total, aucun snapshot ni temps de simulation abandonné ; mémoire RSS échantillonnée autour de 90–98 Mo. Mesure locale, non garantie sur un autre matériel ou réseau.
- Reconstruction du client et du serveur à partir de l’archive distribuée, sans `.git` : réussie, archive déterministe identique et empreintes conformes.

## Navigateur

Le navigateur collaboratif T3 a échoué deux fois avec `Preview automation snapshot timed out after 15000ms.` ; aucun navigateur CUA n’était disponible. Le fallback Chromium/Playwright a donc été utilisé avec le même script que le lot client, adapté au serveur intégré 8090 et deux contextes indépendants. Aucun état serveur réécrit par les tests navigateur.

Scénarios : Domination attente/démarrage à deux et quatre marqueurs ; CTF prise et capture avec score 1–0 ; Mothership prise et restitution du pilotage ; Breakout capture de territoire ; Survival arrivée spectateur, fin réelle par élimination puis round 2 ; Sandbox invocation d’un boss. Captures et données locales sous `node_modules/.final-qa/` (ignorées par Git).

## Revues et limites

Les cinq constats de l’audit classes/équipes et les cinq de la revue objectifs ont été corrigés. Un défaut supplémentaire de progression du tank rendu après pilotage, remonté par une revue Claude tardive, a été reproduit puis corrigé sans remplacer les conventions déjà validées de camouflage et de Tag.

Le support tactile, la prédiction locale, le pathfinding tactique et les Arena Closers ne sont pas implémentés. Collisions circulaires et équilibrage expérimental. Les victoires complètes des modes à objectifs sont couvertes en simulation ; le navigateur ne rejoue pas toutes les victoires ni toutes les variantes de boss. Aucun essai sur plusieurs machines via Internet n’a été réalisé. Parties en mémoire, perdues au redémarrage. Débit JSON encore élevé pour de petites connexions montantes.

La CI Node 22/24 et le Dockerfile sont fournis ; les tests de distribution en clone propre et Docker de la phase précédente sont documentés dans `release.md`. Aucun push GitHub, aucune PR et aucun déploiement public effectués.

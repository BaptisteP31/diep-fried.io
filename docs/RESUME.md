# Reprise après pause de quota

Pause explicitement demandée le 23 octobre 2026, reprise autonome autorisée après environ quatre heures. Les trois tâches ont été arrêtées et leur statut confirmé `interrupted`, sans enfant actif. Aucun worktree n'a été nettoyé.

Timer T3 « Reprendre diep-fried.io après reset quota », ID `scheduled-task:command:mcp:70e88c7f-04d2-41a6-a244-26eece106add:schedule-task:diep-resume-after-quota-20261023`. Intervalle 4 h, premier passage **2026-10-23 22:51:12 UTC**, soit **24 octobre 00:51 à Paris**. Désactiver le timer dès la relance réussie ; s'il reste un blocage quota, conserver la prochaine tentative sans dupliquer de travail.

## État intégré

Branche `integration`, HEAD avant ce checkpoint `67148fb`. Code AGPL-3.0-or-later, 54 classes, 11 modes et boss côté simulation. Dernier contrôle complet : 421 tests, typecheck, format et build verts. Scripts CI/smoke/load intégrés. Aucun push ni déploiement externe. `main` contient seulement la recherche initiale ; ne pas la présenter comme version actuelle.

## Sauvegarde supplémentaire

`/home/baptiste/.t3/checkpoints/diep-fried-budget-pause-20261023/` contient `worktrees.json`, les patches binaires par rapport au HEAD de chaque branche et les fichiers non suivis copiés. Les modifications originales restent dans leurs worktrees. Ne pas appliquer ces patches si elles y sont déjà présentes.

## Lots à reprendre dans les worktrees existants

1. **Client objectifs**, `/home/baptiste/.t3/worktrees/diep-fried.io/t3-4a6fcd9f`, branche `t3/objective-mode-client-ui`, base `8d3240b`. Ownership `apps/client/`. HUD waiting/playing/finished, scores et round, objectifs/drapeaux/territoires/zone Survival et minimap, silhouettes boss via special definitions, pilotage H, Sandbox summonBoss, état spectateur, purge interpolation au nouveau round, labels des 11 modes. Les changements sont non commités ; 108 tests client et build réussissaient avant l'interruption, QA réelle à terminer. T3 snapshot avait échoué deux fois (`Preview automation snapshot timed out after 15000ms.`) ; un fallback navigateur est permis par les instructions. Serveur QA prévu 8093. Ne pas déranger le serveur parent 8090.

2. **Revue objectifs**, `/home/baptiste/.t3/worktrees/diep-fried.io/t3-b927d5ec`, branche `t3/review-objective-modes-1`, base `2a7989a`. Ownership simulation et contrats nécessaires ; pas client/server/maps. La première tentative Claude avait échoué par rate limit. La reprise GPT a reproduit puis commencé à corriger cinq bugs : arrivée Tag dans un camp éliminé ; drapeau porté figé en waiting ; fuite de position d'un porteur invisible par objectif ; Dominator possédé offensif en waiting ; ancienne entrée rejouée au reset. Changements non commités dans `world.ts`, `model/match.ts` et nouveau `objective-review.test.ts`. Terminer les contrôles déconnexion/possess/Survival/mémoire IA et tests avant commit. Préserver les correctifs Factory/base et omission des positions stealth déjà intégrés, avec les 11 tests `audit-regressions`.

3. **Archive source**, `/home/baptiste/.t3/worktrees/diep-fried.io/t3-ab331da2`, branche `t3/add-source-archive-release`, base `2a7989a`. Ownership scripts source, Vite config, href source du menu, scripts package, Docker/ignore et docs release. Objectif : archive correspondant au build servie localement `/source/source.tar.gz`, manifeste et empreintes, source complet nécessaire à reconstruction ; exclusion `.git`, secrets/env, dépendances, builds, QA et références propriétaires. Fonctionner en clone et Docker sans `.git`, et build direct client workspace. Plugin Vite en cours sous `scripts/source/` : export avant build, vérification sources inchangées, émission dans dist/source. Avis MIT helper Vite à inclure en plus Ubuntu/AGPL. Archive/extraction/reconstruction et exclusions à tester. Ne pas prétendre que GitHub contient déjà le source (aucun push).

## Orchestration de reprise

Lire l'historique pour les briefs originaux et conserver les objections ci-dessus. Vérifier anciens task_status et worktrees avant relance. Utiliser le catalogue live des modèles. Les anciennes tâches sont interrompues : chaque nouvelle ronde de revue exige un nouveau `delegate_task`, avec brief original et état antérieur, jamais `t3_thread_send` sur le childThreadId.

Pour conserver les modifications non commitées, ne pas demander `isolation: worktree` depuis integration : cela les perdrait dans le nouveau checkout. Utiliser une tâche déléguée partagée pointant explicitement vers le worktree existant pour poursuivre ses fichiers, ou un mécanisme de reprise approprié. Ne pas manipuler les branches d'autres lots. Ne pas lancer de nouvelles conversations top-level sans demande utilisateur.

Après chaque lot : tests/build, commit local, intégration séquentielle et résolution attentive des conflits (en particulier renderer, index, world). Après intégration globale : check/build, smoke et charge 8 joueurs, QA navigateur réelle à deux profils pour nouveaux modes, validation archive source et état de licence, mise à jour README/jalons. Pas de push/deploy sans instruction correspondante. L'objectif reste une version complète autonome, avec limites de fidélité/équilibrage honnêtement décrites.

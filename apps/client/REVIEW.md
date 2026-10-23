# Revue d’intégration client — Jalon Rendu des 54 Classes et Familles d’Armes

Périmètre : `apps/client/` uniquement, sans prédiction ni modification des paquetages
`packages/sim`, `packages/shared`, `apps/server` ou du fichier `package-lock.json`.

## Synthèse des réalisations

1. **Rendu effectif des 54 classes et géométries partagées** :
   - Exploitation directe des sources de données partagées (`CLASS_DEFINITIONS`, `BarrelDefinition`).
   - Prise en charge des tourelles autonomes orientables via `tank.barrelAngles` pour les classes `auto-3`, `auto-5`, `auto-tank`, `auto-gunner`, `auto-trapper`, `auto-smasher`.
   - Centrage caméra Predator prenant en compte `tank.cameraOffset` avec conversion rigoureuse et cohérente de la visée (`screenToWorld` / `worldToScreen`).
   - Familles de projectiles enrichies :
     - Drones : distinction des drones triangulaires classiques et des drones carrés de Necromancer (`projectile.bodyShape === 'square'`).
     - Traps : géométrie en caltrop / étoile à 3 pointes acérées.
     - Missiles armés : Skimmer (2 propulseurs arrière angulés) et Rocketeer / Glider (1 propulseur arrière) avec recul animé issu de `projectile.barrelShots`.
     - Minions armés (Factory) : corps carré et mini-canon avant avec recul animé.
     - Barres de vie affichées sur les projectiles persistants endommagés (drones, minions).
   - Corps spécifiques de la famille Smasher :
     - Smasher et Auto-Smasher : blindage hexagonal régulier.
     - Landmine : calques doubles d'hexagones superposés décalés de 30° (`Math.PI / 6`).
     - Spike : couronne de 12 pointes triangulaires acérées autour du corps.
   - Gestion de l'opacité et de la furtivité :
     - Joueur local : maintenu à 35% de visibilité minimale.
     - Alliés de même équipe : maintenus à 35% pour la coordination d'équipe.
     - Ennemis : aucun rehaussement d'opacité. À opacité < 0.2 (ou nulle), l'ennemi est totalement invisible, et son étiquette de nom ainsi que sa barre de vie sont intégralement supprimées pour ne jamais le révéler. En cours d'estompage, l'opacité du label et de la barre suit celle du tank.

2. **Arbre d’évolution [Y] et ergonomie des commandes** :
   - Intégration de la touche [Y] maintenue (`onUpgradeTree`) affichant l'arbre complet des 54 classes réparties en 4 paliers (Niveau 1, Niveau 15, Niveau 30, Niveau 45).
   - Vignettes miniatures générées procéduralement avec échelle adaptative évitant tout rognage pour les canons longs (Ranger, Predator, Streamliner) ou les corps larges (Spike, Landmine).
   - Bouton d'accès rapide `[Y] Évolutions` intégré au bandeau HUD pour l'accessibilité à la souris et au tactile.
   - Aide aux commandes mise à jour dans la modale des raccourcis.

3. **Traitement conforme du corps Smasher dans le HUD** :
   - Les 4 statistiques de tir (`bulletSpeed`, `bulletPenetration`, `bulletDamage`, `reload`) ayant un plafond de 0 (`cap === 0`) sont correctement masquées (`hidden = true`) et désactivées (`item.btn.disabled = true`, classe CSS `.stat-disabled`).
   - Les 4 statistiques de corps (`healthRegen`, `maxHealth`, `bodyDamage`, `movementSpeed`) disposent de 10 segments de progression remplissables.

4. **Conformité Licence AGPL-3.0** :
   - Affichage explicite des mentions dans le menu et la documentation avec liens actifs vers `/licenses/AGPL-3.0.txt`, le code source du projet et `/licenses/THIRD_PARTY_NOTICES.txt`.
   - Configuration Vite préservée sans modification (plugin de distribution des avis AGPL inclus).

5. **Interface Responsive Desktop / Mobile** :
   - Styles CSS avec media queries adaptatives (`@media (max-width: 768px)` et `@media (max-width: 480px)`) dimensionnant les panneaux pour éviter les chevauchements majeurs entre le HUD, le classement, la minicarte, les barres d'XP et le panneau de statistiques.
   - Aucun contrôle tactile fictif de gameplay n'est promis (les contrôles restent clavier/souris ; les menus et le HUD sont responsives et cliquables).

## Validation et Tests

- **Tests Vitest** :
  - `apps/client/test/camera.test.ts` : validation de la bijection `screenToWorld` / `worldToScreen`, du décalage caméra Predator et de la parfaite cohérence du vecteur de visée.
  - `apps/client/test/render-angles.test.ts` : calculs purs des angles relatifs des tourelles auto (`tank.barrelAngles`), replis statiques, armement des missiles/minions, géométries des traps/drones, et règles d'opacité furtive alliée vs ennemie.
  - `apps/client/test/evolution-tree.test.ts` : couverture complète des 54 classes, rendu sans erreur de toutes les miniatures, et vérification unitaire du masquage des statistiques à cap 0 dans le DOM du HUD.
  - 283 tests passés avec succès sur l'ensemble de la suite (`npm test`).
  - Validation du typage strict TypeScript sans erreur (`npm run typecheck`).
  - Compilation réussie du bundle client de production (`npm run build`).

- **Validation QA Navigateur (Port 8091)** :
  - Serveur de validation lancé sur le port dédié 8091 (`apps/client/qa-server.mjs`) sans impacter le port 8090 du serveur parent.
  - Scène synthétique interactive déployée (`apps/client/qa-showcase.html`) présentant simultanément :
    - Les 54 vignettes de classes.
    - Les tourelles auto animées, le Predator, Smasher, Spike, Landmine et Auto-Smasher.
    - Les traps à 3 pointes, drones triangles et carrés, missiles Skimmer (2 propulseurs) et Rocketeer (1 propulseur), et Factory minions armés avec barre de vie.
    - La comparaison de furtivité (joueur local, allié visible, ennemi invisible non révélé).
  - Capture visuelle réelle validée par le moteur headless T3 (`html_preview`) :
    - Fichier : `apps/client/qa-render-capture.png`
    - SHA256 : `e5826a2ad29d4b2c57381a217bde24d2e05dbdd17ed0367b3cf628e89079d837`

## Limites documentées

- Aucune prédiction côté client n'a été ajoutée dans ce lot (conformément aux directives).
- Les contrôles tactiles virtuels de gameplay (joysticks à l'écran) ne sont pas implémentés ; l'interface utilisateur (menus, boutons HUD, sélection d'évolutions) est en revanche pleinement responsive et manipulable sur écran tactile.
- Les raccourcis Sandbox ne sont pas codés dans ce lot en attente de l'intégration de la commande union par l'agent modes.

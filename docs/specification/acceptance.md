# Scénarios d'Acceptation et Critères de Test — diep-fried.io

**Date de référence** : 23 octobre 2026  
**Statut** : Document de test et d'acceptation fonctionnelle  
**Format** : Spécification par scénarios exécutables (Gherkin / Given-When-Then)  

---

## 1. Scénarios par famille d'armes et de tanks

### 1.1 Famille Direct Fire & Spammers (Twin, Triplet, Penta Shot, Octo Tank)

#### Scénario 1.1.1 : Cadence déphasée et recul additif du Twin
* **Étant donné** un joueur pilotant un tank `Twin` avec 0 point en Recul/Reload et immobile à la position $(x_0, y_0)$.
* **Quand** le joueur maintient le bouton de tir vers l'angle $\theta = 0$ (vers la droite).
* **Alors** :
  1. Les deux canons font feu de manière déphasée (le canon gauche tire à $t$, le canon droit tire à $t + \frac{\text{reloadInterval}}{2}$).
  2. Chaque balle éjectée applique une impulsion de recul orientée à $\theta + \pi$ (vers la gauche).
  3. La vitesse instantanée du tank devient négative sur l'axe X sans aucune commande de déplacement clavier.

#### Scénario 1.1.2 : Éventail de dispersion et poussée inverse du Penta Shot
* **Étant donné** un joueur de niveau 45 ayant sélectionné la classe `Penta Shot`.
* **Quand** le joueur fait feu en continu dans une direction fixe.
* **Alors** :
  1. 5 projectiles sont émis selon un arc en éventail symétrique centré sur le curseur.
  2. Les tirs se déclenchent selon un ordre séquentiel précis (centre, puis intermédiaires, puis extérieurs) créant un flux continu.
  3. La somme vectorielle des reculs produit une accélération inverse massive, permettant au joueur d'utiliser son tir comme propulseur principal pour se déplacer plus vite que sa vitesse de course de base.

#### Scénario 1.1.3 : Annulation du recul sur classes omnidirectionnelles (Quad Tank, Octo Tank)
* **Étant donné** un joueur pilotant un `Quad Tank` (4 canons à $90^\circ$) ou un `Octo Tank` (8 canons à $45^\circ$).
* **Quand** le joueur tire en continu sans bouger au clavier.
* **Alors** :
  1. Les canons opposés font feu de manière synchronisée ou symétrique.
  2. La résultante vectorielle des forces de recul est nulle ($\sum \vec{F}_{\text{recul}} = \vec{0}$).
  3. Le centre de masse du tank reste rigoureusement stationnaire.

---

### 1.2 Famille Sniper & Longue Portée (Sniper, Assassin, Ranger, Stalker, Predator)

#### Scénario 1.2.1 : Élargissement dynamique du champ de vision (FOV)
* **Étant donné** un tank `Tank` (Tier 1) observant une fenêtre d'arène de largeur $W_0$.
* **Quand** le joueur évolue successivement en `Sniper` (Niv 15), puis `Assassin` (Niv 30), puis `Ranger` (Niv 45).
* **Alors** :
  1. La caméra du client dézoome proportionnellement au multiplicateur FOV de chaque classe :
     * `Sniper` : champ de vision multiplié par $1.25\times$.
     * `Assassin` : champ de vision multiplié par $1.50\times$.
     * `Ranger` : champ de vision multiplié par $1.75\times$.
  2. Le serveur étend en conséquence le rayon d'intérêt (*Interest Management*) du joueur pour lui transmettre les entités distantes invisibles pour un tank de base.

#### Scénario 1.2.2 : Décalage optique de la lentille du Predator
* **Étant donné** un joueur pilotant un `Predator`.
* **Quand** le joueur maintient le clic droit de la souris ou la touche Maj.
* **Alors** :
  1. La caméra glisse de manière continue dans la direction du réticule de visée jusqu'à $1.5\times$ la distance de vue normale.
  2. Le corps du tank du joueur reste au point d'origine mais peut se retrouver en bordure ou hors de l'écran local.
  3. Dès le relâchement du clic droit, la caméra se recentre immédiatement sur le châssis du tank.

#### Scénario 1.2.3 : Camouflage d'immobilité du Stalker
* **Étant donné** un joueur pilotant un `Stalker` visible sur l'écran d'un joueur adverse.
* **Quand** le joueur Stalker cesse tout déplacement et tout tir.
* **Alors** :
  1. L'opacité de son tank décroît de façon progressive sur une période de 2.0 secondes.
  2. À $t \ge 2.0\,\text{s}$, l'opacité atteint $0.0$ (invisibilité totale pour les adversaires).
  3. Si le Stalker bouge d'au moins 1 unité ou déclenche un tir, son opacité repasse instantanément à $1.0$ (visibilité complète).

---

### 1.3 Famille Heavy Cannon & Haute Inertie (Destroyer, Annihilator, Rocketeer, Skimmer)

#### Scénario 1.3.1 : Dégâts destructeurs et recul propulseur du Destroyer / Annihilator
* **Étant donné** un joueur pilotant un `Annihilator` doté d'une vitesse de déplacement normale.
* **Quand** le joueur tire un coup unique dos à un ennemi.
* **Alors** :
  1. Un projectile de diamètre supérieur à la moitié du châssis est éjecté.
  2. Le recul impulsif propulse instantanément le tank vers l'avant à une vélocité supérieure au plafond de vitesse de course.
  3. Si le projectile percute une forme neutre ou un tank léger de niveau inférieur, la cible subit une perte massive de PV pouvant provoquer un coup critique fatal (*one-shot*).

#### Scénario 1.3.2 : Propulsion active de la roquette du Rocketeer
* **Étant donné** un joueur tirant avec un `Rocketeer`.
* **Quand** le missile quitte le canon principal.
* **Alors** :
  1. Le missile génère à son arrière une émission de micro-balles de propulsion.
  2. La vitesse du missile s'accélère continuellement pendant son premier tiers de trajectoire.
  3. Les micro-balles arrière infligent des dégâts secondaires aux entités situées immédiatement derrière la ligne de mire.

---

### 1.4 Famille Shotgun & Déflagrations (Shotgun, Pellet Shot, Dual-Barrel)

#### Scénario 1.4.1 : Dispersion volumique de plombs du Shotgun
* **Étant donné** un tank `Shotgun` de niveau 30.
* **Quand** le joueur déclenche un tir.
* **Alors** :
  1. Une grappe de 12 plombs miniatures est instantanément générée avec des vélocités et des angles distribués aléatoirement dans un cône de dispersion de $30^\circ$.
  2. Chaque plomb possède une durée de vie courte ($< 1.2\,\text{s}$).
  3. Si un tank ennemi au corps-à-corps encaisse l'intégralité de la grappe, il subit une impulsion de recul le repoussant violemment en arrière (*rammer repellent*).

#### Scénario 1.4.2 : Tirs scindés gauche/droite du Dual-Barrel
* **Étant donné** un joueur aux commandes d'un `Dual-Barrel` (Tier 4).
* **Quand** le joueur utilise soit le clic gauche, soit le clic droit, soit les deux simultanément.
* **Alors** :
  1. Clic gauche active uniquement le canon gauche.
  2. Clic droit active uniquement le canon droit.
  3. Les deux boutons pressés simultanément déclenchent les deux canons en même temps, infligeant un double burst frontal et une impulsion de recul colossale vers l'arrière.

---

### 1.5 Famille Drone Controllers & Minions (Overseer, Overlord, Necromancer, Factory)

#### Scénario 1.5.1 : Contrôle dynamique de l'essaim d'Overlord
* **Étant donné** un tank `Overlord` entouré de ses 8 drones triangulaires en orbite passive.
* **Quand** le joueur déplace son curseur de souris et effectue les actions suivantes :
  * Clic gauche maintenu : les 8 drones convergent vers les coordonnées exactes du curseur.
  * Clic droit maintenu : les 8 drones divergent et s'éloignent du curseur dans la direction opposée (*repel*).
* **Alors** :
  1. Les drones accélèrent de façon fluide vers la cible sans téléportation.
  2. Si 2 drones sont détruits par des tirs ennemis, les 4 spawners de l'Overlord régénèrent automatiquement les drones manquants jusqu'au plafond strict de 8.

#### Scénario 1.5.2 : Infection et conversion de formes par le Necromancer
* **Étant donné** un tank `Necromancer` sans aucun drone actif ($N = 0$).
* **Quand** le Necromancer entre en contact physique avec un `Square` neutre (jaune).
* **Alors** :
  1. Le carré ne subit pas de dégâts de collision classiques mais est instantanément converti en drone carré sous le contrôle du Necromancer.
  2. La couleur du carré adopte celle de l'équipe du joueur.
  3. Le compteur de drones s'incrémente de 1, jusqu'à la limite maximale définie par la statistique Reload (pouvant atteindre 42 carrés).

#### Scénario 1.5.3 : Minions autonomes de la Factory
* **Étant donné** une `Factory` active de niveau 45.
* **Quand** la Factory produit un minion.
* **Alors** :
  1. Le minion est une petite entité autonome dotée de son propre corps circulaire et d'un canon.
  2. Le minion tire des balles dans la direction de son orientation tout en se propulsant via son propre recul.
  3. Les minions suivent les commandes de curseur du joueur pour former une ligne de front défensive.
  4. Le nombre simultané de minions ne peut jamais dépasser 6.

---

### 1.6 Famille Trapper & Barrières Cinétiques (Trapper, Tri-Trapper, Mega Trapper)

#### Scénario 1.6.1 : Déploiement et persistance des pièges
* **Étant donné** un `Trapper` tirant un piège à vitesse maximale.
* **Quand** le piège quitte le canon.
* **Alors** :
  1. Le piège décélère rapidement sous l'effet d'une forte friction et s'immobilise après quelques mètres.
  2. Le piège reste ancré dans l'arène pendant une durée fixe de 30 secondes avant de disparaître.
  3. Tout projectile adverse percutant le piège subit une absorption de dégâts mutuelle ; si le piège a plus de points de vie résiduels que la balle, la balle est anéantie et le piège subsiste avec ses PV restants.

---

### 1.7 Famille Smasher & Rammers (Smasher, Landmine, Spike)

#### Scénario 1.7.1 : Profil de statistiques et plafond à 10 points
* **Étant donné** un joueur atteignant le niveau 30 sans avoir évolué au niveau 15 (Tank de base).
* **Quand** le joueur sélectionne la classe `Smasher`.
* **Alors** :
  1. Les 4 statistiques de tir (`Bullet Speed`, `Bullet Penetration`, `Bullet Damage`, `Reload`) sont grisées et désactivées.
  2. Les 4 statistiques corporelles (`Health Regen`, `Max Health`, `Body Damage`, `Movement Speed`) voient leur jauge maximale passer de 7 à 10 points.
  3. Tous les points précédemment investis ou futurs peuvent être alloués jusqu'à 10 par stat.

#### Scénario 1.7.2 : Collision et calcul des dégâts au contact
* **Étant donné** un `Spike` doté de 10 points en `Body Damage` et 10 points en `Max Health`, percutant frontalement un `Twin` orienté vers lui.
* **Quand** la boîte de collision circulaire du Spike intersecte celle du Twin.
* **Alors** :
  1. Les deux entités s'échangent des dégâts à chaque tick de contact proportionnels à leur valeur respective de Body Damage.
  2. Le Twin est pulvérisé en moins de 3 ticks consécutifs.
  3. Le Spike subit une diminution de santé proportionnelle aux PV du Twin mais survit grâce à son armure de coque renforcée.

---

### 1.8 Famille Tourelles Autonomes (Auto 3, Auto 5, Auto Gunner, Auto Smasher)

#### Scénario 1.8.1 : Ciblage autonome et hiérarchie des menaces
* **Étant donné** un joueur pilotant un `Auto 3` se déplaçant dans l'arène sans cliquer sur la souris.
* **Quand** un carré neutre à 300 unités et un tank ennemi à 400 unités entrent dans le rayon d'acquisition.
* **Alors** :
  1. Les tourelles tournent automatiquement vers leurs cibles respectives de manière indépendante.
  2. La priorité d'engagement cible le tank ennemi en priorité par rapport aux formes passives.
  3. Les tirs sont déclenchés automatiquement dès que la tourelle est alignée sur sa cible.

---

## 2. Scénarios des mécaniques de base de simulation

### 2.1 Mouvement, inertie et limites du monde
* **Étant donné** un tank quelconque avec une vitesse nulle au centre de l'arène.
* **Quand** le joueur appuie sur la touche de déplacement vers le haut pendant 1 seconde, puis relâche toute touche.
* **Alors** :
  1. Le tank accélère avec une courbe exponentielle jusqu'à atteindre sa vitesse maximale théorique.
  2. Dès le relâchement, la friction visqueuse ralentit progressivement le tank jusqu'à l'arrêt complet en environ 0.5 seconde.
  3. Si le tank percute la bordure extérieure de l'arène, sa composante de vitesse normale au bord est annulée et sa position est bornée à $[r, \text{tailleArène} - r]$.

### 2.2 Formes neutres, destruction et attribution de score/XP
* **Étant donné** un `Square` neutre (10 PV, 10 XP) présent sur la carte.
* **Quand** un joueur lui tire dessus avec une balle infligeant 12 de dégâts.
* **Alors** :
  1. Le carré est détruit au tick de collision.
  2. Un effet de particule de destruction est émis.
  3. Le score du joueur s'incrémente exactement de 10 points.
  4. La barre d'expérience du joueur augmente de 10 points d'XP, déclenchant un passage de niveau si le palier requis est franchi.

### 2.3 Mort et réapparition (Respawn)
* **Étant donné** un joueur de niveau 45 totalisant 23 536 points de score.
* **Quand** ses points de vie tombent à 0 à la suite d'un tir adverse.
* **Alors** :
  1. Le tank explose et disparaît de la simulation.
  2. L'assaillant reçoit l'attribution du kill et le gain de score associé.
  3. Un écran de fin de partie s'affiche avec le score final, le temps de survie et la cause de la mort.
  4. Lorsque le joueur clique sur "Respawn" ou presse Entrée, il réapparaît avec un niveau égal à $\min(22, \lfloor 45 / 2 \rfloor) = 22$, avec les points de compétences correspondants prêts à être alloués.

---

## 3. Scénarios d'acceptation par mode de jeu

### 3.1 Mode Sandbox : Commandes de triche privées
* **Étant donné** un joueur connecté dans une instance en mode `Sandbox`.
* **Quand** le joueur appuie sur les touches dédiées du clavier :
  * Touche `K` : son niveau passe immédiatement au niveau supérieur (ou niveau 45 direct).
  * Touche `\` : son tank se métamorphose instantanément en la classe suivante du catalogue sans passer par les paliers d'évolution.
  * Touche `;` : son statut passe en `Godmode` (invulnérable aux collisions et aux balles ennemies).
  * Touche `O` : le tank subit un suicide forcé immédiat.
* **Alors** : toutes les commandes répondent en moins d'un tick sans désynchroniser l'état du serveur.

### 3.2 Mode 2 Teams & 4 Teams : Sanctuaires et Drones protecteurs
* **Étant donné** une partie en mode `2 Teams` opposant l'équipe Bleue et l'équipe Rouge.
* **Quand** un tank de l'équipe Rouge tente de pénétrer dans le sanctuaire de la base Bleue.
* **Alors** :
  1. Les tirs de l'équipe Rouge heurtant la frontière de la base Bleue sont instantanément dissous.
  2. Une escouade de drones protecteurs triangulaires invulnérables décolle de la base Bleue à très haute vitesse.
  3. Les drones protecteurs fondent sur l'intrus Rouge et lui infligent des dégâts mortels instantanés.
  4. Les tirs entre deux joueurs de l'équipe Bleue se traversent sans aucune collision ni dégât.

### 3.3 Mode Maze : Obstacles infranchissables
* **Étant donné** une arène de type `Maze` contenant un mur rectangulaire plein.
* **Quand** un joueur ou un projectile se déplace en direction du mur.
* **Alors** :
  1. Le tank glisse le long de la normale du mur sans jamais pouvoir pénétrer à l'intérieur.
  2. Les projectiles de tir s'écrasent et explosent contre la surface du mur sans le traverser.
  3. Les drones ne peuvent pas traverser le mur et doivent contourner l'obstacle via les corridors ouverts.

---

## 4. Scénarios d'acceptation des salons privés (Parties entre amis)

### 4.1 Création et isolation d'un salon privé
* **Étant donné** un serveur `diep-fried.io` en cours d'exécution.
* **Quand** l'utilisateur A clique sur "Créer une partie privée" en sélectionnant le mode `4 Teams`.
* **Alors** :
  1. Le serveur instancie une nouvelle salle identifiée par un UUID unique (ex: `/room/a7b8-c9d0`).
  2. L'URL partageable est copiée dans le presse-papier.
  3. Lorsque l'utilisateur B ouvre cette URL dans un autre navigateur, il rejoint directement l'arène de l'utilisateur A sans passer par un lobby public.
  4. Les entités, les tirs et les scores du salon A sont rigoureusement isolés de tout autre salon tournant sur la même instance serveur.

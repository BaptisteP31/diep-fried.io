# Scénarios d'Acceptation et Critères de Test — diep-fried.io

**Date de référence** : 23 octobre 2026  
**Statut** : Document de test et d'acceptation fonctionnelle  
**Format** : Spécification par scénarios exécutables (Gherkin / Given-When-Then)  
**Lecture** : chaque scénario distingue le comportement *documenté* (existence de la classe, mécanique générale) des valeurs *proposées* par le remake (angles, durées, seuils, distances), signalées par « (proposition) » ou « tolérance ε ». Les propositions seront figées par des tests de calibration ; elles ne sont pas des faits sur le jeu d'origine. Les tolérances numériques (ε) sont à fixer au moment de l'implémentation.  

---

## 1. Scénarios par famille d'armes et de tanks

### 1.1 Famille Direct Fire & Spammers (Twin, Triplet, Penta Shot, Octo Tank)

#### Scénario 1.1.1 : Cadence déphasée et recul additif du Twin
* **Étant donné** un joueur pilotant un tank `Twin` avec 0 point en Reload et immobile à la position $(x_0, y_0)$.
* **Quand** le joueur maintient le bouton de tir vers l'angle $\theta = 0$ (vers la droite).
* **Alors** :
  1. Les deux canons font feu de manière déphasée (le canon gauche tire à $t$, le canon droit tire à $t + \frac{\text{reloadInterval}}{2}$).
  2. Chaque balle éjectée applique une impulsion de recul orientée à $\theta + \pi$ (vers la gauche).
  3. La vitesse du tank sur l'axe X devient négative (hors tolérance ε) sans aucune commande de déplacement clavier.

#### Scénario 1.1.2 : Éventail de dispersion et poussée inverse du Penta Shot
* **Étant donné** un joueur de niveau 45 ayant sélectionné la classe `Penta Shot`.
* **Quand** le joueur fait feu en continu dans une direction fixe.
* **Alors** :
  1. 5 projectiles sont émis selon un arc en éventail symétrique centré sur le curseur.
  2. Les tirs se déclenchent selon un ordre séquentiel précis (centre, puis intermédiaires, puis extérieurs) créant un flux continu.
  3. La somme vectorielle des reculs produit une accélération inverse massive, et doit être mesurable (hypothèse de conception : le tir sert de propulseur notable ; l'intensité exacte, y compris le dépassement de la vitesse de course, reste à calibrer et n'est pas un critère d'acceptation tant qu'elle n'est pas validée).

#### Scénario 1.1.3 : Annulation du recul sur classes omnidirectionnelles (Quad Tank, Octo Tank)
* **Étant donné** un joueur pilotant un `Quad Tank` (4 canons à $90^\circ$) ou un `Octo Tank` (8 canons à $45^\circ$).
* **Quand** le joueur tire en continu sans bouger au clavier.
* **Alors** :
  1. Les canons opposés font feu de manière synchronisée ou symétrique.
  2. La résultante vectorielle des impulsions de recul est nulle sur un cycle complet de tir, à une tolérance ε près ($\left\|\sum \vec{J}_{\text{recul}}\right\| \le \varepsilon$) ; si les canons ne tirent pas tous au même instant, une oscillation instantanée est admise.
  3. Le tank ne dérive pas d'une distance supérieure à une tolérance ε sur un cycle de tir.

---

### 1.2 Famille Sniper & Longue Portée (Sniper, Assassin, Ranger, Stalker, Predator)

#### Scénario 1.2.1 : Élargissement dynamique du champ de vision (FOV)
* **Étant donné** un tank `Tank` (Tier 1) observant une fenêtre d'arène de largeur $W_0$.
* **Quand** le joueur évolue successivement en `Sniper` (Niv 15), puis `Assassin` (Niv 30), puis `Ranger` (Niv 45).
* **Alors** :
  1. La caméra du client dézoome proportionnellement au multiplicateur FOV de chaque classe :
     * `Sniper` : champ de vision multiplié par $1.25\times$ (valeur du catalogue, à valider).
     * `Assassin` : champ de vision multiplié par $1.50\times$ (idem).
     * `Ranger` : champ de vision multiplié par $1.75\times$ (idem).
  2. Le serveur étend en conséquence le rayon d'intérêt (*Interest Management*) du joueur pour lui transmettre les entités distantes invisibles pour un tank de base.

#### Scénario 1.2.2 : Décalage optique de la lentille du Predator
* **Étant donné** un joueur pilotant un `Predator`.
* **Quand** le joueur maintient le clic droit de la souris ou la touche Maj.
* **Alors** :
  1. La caméra glisse de manière continue dans la direction du réticule de visée jusqu'à $1.5\times$ la distance de vue normale (proposition ; amplitude originale non vérifiée).
  2. Le corps du tank du joueur reste au point d'origine mais peut se retrouver en bordure ou hors de l'écran local.
  3. Dès le relâchement du clic droit, la caméra se recentre sur le châssis du tank (immédiatement ou par transition courte : à choisir).

#### Scénario 1.2.3 : Camouflage d'immobilité du Stalker
* **Étant donné** un joueur pilotant un `Stalker` visible sur l'écran d'un joueur adverse.
* **Quand** le joueur Stalker cesse tout déplacement et tout tir.
* **Alors** :
  1. L'opacité de son tank décroît de façon progressive sur une période de 2.0 secondes (proposition).
  2. À $t \ge 2.0\,\text{s}$, l'opacité atteint $0.0$ (invisibilité totale pour les adversaires).
  3. Si le Stalker bouge d'au moins 1 unité (proposition) ou déclenche un tir, son opacité repasse instantanément à $1.0$ (visibilité complète).

---

### 1.3 Famille Heavy Cannon & Haute Inertie (Destroyer, Annihilator, Rocketeer, Skimmer)

#### Scénario 1.3.1 : Dégâts destructeurs et recul propulseur du Destroyer / Annihilator
* **Étant donné** un joueur pilotant un `Annihilator` doté d'une vitesse de déplacement normale.
* **Quand** le joueur tire un coup unique dos à un ennemi.
* **Alors** :
  1. Un projectile de grand diamètre (proposition : supérieur à la moitié du châssis) est éjecté.
  2. Le recul impulsif propulse le tank à l'opposé du tir ; son intensité est à calibrer (hypothèse : plus forte que celle d'un tank standard ; dépasser le plafond de vitesse de course n'est pas garanti).
  3. Si le projectile percute une forme neutre ou un tank léger de niveau inférieur, la cible subit une perte massive de PV pouvant être fatale (*one-shot* selon niveau et statistiques, à calibrer).

#### Scénario 1.3.2 : Propulsion active de la roquette du Rocketeer
* **Étant donné** un joueur tirant avec un `Rocketeer`.
* **Quand** le missile quitte le canon principal.
* **Alors** :
  1. Le missile génère à son arrière une émission de micro-balles de propulsion.
  2. La vitesse du missile s'accélère pendant une phase initiale (proposition : premier tiers de la trajectoire).
  3. Les micro-balles arrière peuvent infliger des dégâts secondaires aux entités situées derrière le missile (mécanisme exact de l'original non vérifié).

---

### 1.4 Famille Shotgun & Déflagrations (Shotgun, Pellet Shot, Dual-Barrel)

#### Scénario 1.4.1 : Dispersion volumique de plombs du Shotgun
* **Étant donné** un tank `Shotgun` de niveau 30.
* **Quand** le joueur déclenche un tir.
* **Alors** :
  1. Une grappe de plombs miniatures est générée en un tir avec des vélocités et des angles distribués aléatoirement dans un cône. Le nombre de plombs (12) et l'angle du cône ($30^\circ$) sont des propositions du remake, non vérifiées dans l'original.
  2. Chaque plomb possède une durée de vie courte (proposition : $< 1.2\,\text{s}$).
  3. Si un tank ennemi au corps-à-corps encaisse l'essentiel de la grappe, il subit une impulsion de recul le repoussant en arrière (*rammer repellent*, intensité à calibrer).

#### Scénario 1.4.2 : Tir décalé à deux canons du Dual-Barrel (convention du remake)
* **Note de version** : le catalogue précédent décrivait une commande scindée clic gauche = canon gauche / clic droit = canon droit. Selon la vérification du coordinateur, le changelog du wiki (https://diepio.fandom.com/wiki/Changelog) signale un changement au 2 novembre 2025 : deux canons tirant au clic gauche, de façon décalée. Le remake **retient explicitement le comportement actuel** ; l'ancienne convention est héritée et non implémentée en v1. Le décalage exact entre canons et l'intensité du recul sont des paramètres à calibrer.
* **Étant donné** un joueur aux commandes d'un `Dual-Barrel` (Tier 4).
* **Quand** le joueur maintient le clic gauche (ou Espace).
* **Alors** :
  1. Les deux canons tirent en alternance décalée (décalage : proposition).
  2. Le clic droit ne déclenche aucun tir pour cette classe.
  3. L'impulsion de recul cumulée est supérieure à celle d'un tank à canon unique (intensité à calibrer).

---

### 1.5 Famille Drone Controllers & Minions (Overseer, Overlord, Necromancer, Factory)

#### Scénario 1.5.1 : Contrôle dynamique de l'essaim d'Overlord
* **Étant donné** un tank `Overlord` entouré de ses 8 drones triangulaires en orbite passive.
* **Quand** le joueur déplace son curseur de souris et effectue les actions suivantes :
  * Clic gauche maintenu : les 8 drones convergent vers les coordonnées exactes du curseur.
  * Clic droit maintenu : les 8 drones divergent et s'éloignent du curseur dans la direction opposée (*repel*).
* **Alors** :
  1. Les drones accélèrent de façon fluide vers la cible sans téléportation.
  2. Si 2 drones sont détruits par des tirs ennemis, les 4 spawners de l'Overlord régénèrent les drones manquants au rythme de la statistique Reload, sans jamais dépasser le plafond de 8 (plafond du catalogue, à valider).

#### Scénario 1.5.2 : Infection et conversion de formes par le Necromancer
* **Étant donné** un tank `Necromancer` sans aucun drone actif ($N = 0$).
* **Quand** un `Square` neutre (jaune) est converti par le Necromancer. **Déclencheur non résolu** : contact physique ou destruction du carré par le Necromancer ou ses drones — la règle d'origine n'a pas été vérifiée (voir `uncertainties.md`) ; le remake choisira une convention explicite avant implémentation.
* **Alors** :
  1. Le carré est converti en drone carré sous le contrôle du Necromancer.
  2. La couleur du carré adopte celle de l'équipe du joueur.
  3. Le compteur de drones s'incrémente de 1, jusqu'à une limite maximale dépendant de la statistique Reload (le catalogue mentionne jusqu'à 42, valeur non vérifiée).

#### Scénario 1.5.3 : Minions autonomes de la Factory
* **Étant donné** une `Factory` active de niveau 45.
* **Quand** la Factory produit un minion.
* **Alors** :
  1. Le minion est une petite entité autonome dotée de son propre corps circulaire et d'un canon.
  2. Le minion tire des balles dans la direction de son orientation tout en se propulsant via son propre recul.
  3. Les minions suivent les commandes de curseur du joueur pour former une ligne de front défensive.
  4. Le nombre simultané de minions ne dépasse pas le plafond de 6 (plafond du catalogue, à valider).

---

### 1.6 Famille Trapper & Barrières Cinétiques (Trapper, Tri-Trapper, Mega Trapper)

#### Scénario 1.6.1 : Déploiement et persistance des pièges
* **Étant donné** un `Trapper` tirant un piège à vitesse maximale.
* **Quand** le piège quitte le canon.
* **Alors** :
  1. Le piège décélère rapidement sous l'effet de la friction et s'immobilise (vitesse sous un seuil ε) après une courte distance (à calibrer).
  2. Le piège reste ancré dans l'arène pendant une durée de 30 secondes (proposition) avant de disparaître.
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
  2. Le Twin perd de la santé nettement plus vite que le Spike ; le nombre de ticks nécessaires à sa destruction est un résultat de calibrage (aucun nombre garanti).
  3. Le Spike subit une diminution de santé liée aux dégâts de contact du Twin ; sa survie dépend du calibrage et n'est pas garantie ici.

---

### 1.8 Famille Tourelles Autonomes (Auto 3, Auto 5, Auto Gunner, Auto Smasher)

#### Scénario 1.8.1 : Ciblage autonome et hiérarchie des menaces
* **Étant donné** un joueur pilotant un `Auto 3` se déplaçant dans l'arène sans cliquer sur la souris.
* **Quand** un carré neutre à 300 unités et un tank ennemi à 400 unités entrent dans le rayon d'acquisition (distances et rayon : propositions).
* **Alors** :
  1. Les tourelles tournent automatiquement vers leurs cibles respectives de manière indépendante.
  2. La priorité d'engagement (proposition du remake, non vérifiée dans l'original) cible le tank ennemi avant les formes passives.
  3. Les tirs sont déclenchés automatiquement dès que la tourelle est alignée sur sa cible.

---

## 2. Scénarios des mécaniques de base de simulation

### 2.1 Mouvement, inertie et limites du monde
* **Étant donné** un tank quelconque avec une vitesse nulle au centre de l'arène.
* **Quand** le joueur appuie sur la touche de déplacement vers le haut pendant 1 seconde, puis relâche toute touche.
* **Alors** :
  1. Le tank accélère avec une courbe progressive vers sa vitesse maximale (forme de la courbe à choisir).
  2. Dès le relâchement, la friction visqueuse ralentit le tank jusqu'à une vitesse sous un seuil ε. Une décroissance exponentielle n'atteint jamais zéro : l'arrêt est défini par ce seuil, et le temps d'arrêt cible (de l'ordre de 0.5 à 1 s) est à calibrer avec $\mu$ (non figé).
  3. Si le tank percute la bordure extérieure de l'arène, sa composante de vitesse normale au bord est annulée (la proposition d'un rebond amorti reste possible) et sa position est bornée à $[r, \text{tailleArène} - r]$.

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
  4. Lorsque le joueur clique sur "Respawn" ou presse Entrée, il réapparaît avec un niveau égal à $\max(1, \min(22, \lfloor L / 2 \rfloor))$ où $L$ est le niveau à la mort (proposition de conception), avec les points de compétences correspondants prêts à être alloués. Ici : $L = 45 \Rightarrow \max(1, \min(22, 22)) = 22$.
  5. Cas limites : $L = 1 \Rightarrow \lfloor 1/2 \rfloor = 0$, ramené à 1 par le minimum ; $L = 2$ ou $3 \Rightarrow 1$ ; $L = 44 \Rightarrow 22$. Le plafond 22 ne s'applique que si $L > 45$ (modes spéciaux).

---

## 3. Scénarios d'acceptation par mode de jeu

### 3.1 Mode Sandbox : Commandes de triche privées
* **Étant donné** un joueur connecté dans une instance en mode `Sandbox`.
* **Quand** le joueur appuie sur les touches dédiées du clavier :
  * Touche `K` : son niveau augmente de 1 (le saut direct au niveau 45 est une question ouverte).
  * Touche `\` : le joueur change instantanément de classe, sans restriction d'arbre ni de niveau (interface de sélection à définir ; le cycle « classe suivante du catalogue » est une option).
  * Touche `;` : son statut passe en `Godmode` (invulnérable aux collisions et aux balles ennemies).
  * Touche `O` : le tank subit un suicide forcé immédiat.
* **Alors** : chaque commande est validée et appliquée par le serveur autoritaire, et le client la reflète dans les mêmes délais que les autres entrées, sans désynchronisation persistante de l'état. Un budget de latence (en ticks ou ms) sera fixé après mesure ; aucune latence nulle n'est garantie. Ces commandes sont refusées hors du propriétaire du salon en mode Sandbox.

### 3.2 Mode 2 Teams & 4 Teams : Sanctuaires et Drones protecteurs
* **Étant donné** une partie en mode `2 Teams` opposant l'équipe Bleue et l'équipe Rouge.
* **Quand** un tank de l'équipe Rouge tente de pénétrer dans le sanctuaire de la base Bleue.
* **Alors** :
  1. Les tirs de l'équipe Rouge heurtant la frontière de la base Bleue sont dissous (règle proposée).
  2. Une escouade de drones protecteurs invulnérables (proposition) décolle de la base Bleue et se dirige vers l'intrus.
  3. Les drones protecteurs infligent à l'intrus des dégâts létaux ; le délai maximal de destruction (cible de conception : environ 1.5 s) est à calibrer.
  4. Les tirs entre deux joueurs de l'équipe Bleue se traversent sans collision ni dégât (friendly-fire nul, choix du remake).

### 3.3 Mode Maze : Obstacles infranchissables
* **Étant donné** une arène de type `Maze` contenant un mur rectangulaire plein.
* **Quand** un joueur ou un projectile se déplace en direction du mur.
* **Alors** :
  1. Le tank glisse le long de la surface du mur et n'y pénètre pas au-delà d'une tolérance numérique ε.
  2. Les projectiles sont détruits au contact du mur et ne le traversent pas.
  3. Les drones ne traversent pas le mur ; leur capacité à contourner l'obstacle via les corridors dépend de l'IA de navigation, qui reste à spécifier (ils peuvent rester bloqués contre un mur).

---

## 4. Scénarios d'acceptation des salons privés (Parties entre amis)

### 4.1 Création et isolation d'un salon privé
* **Étant donné** un serveur `diep-fried.io` en cours d'exécution.
* **Quand** l'utilisateur A clique sur "Créer une partie privée" en sélectionnant le mode `4 Teams`.
* **Alors** :
  1. Le serveur instancie une nouvelle salle identifiée par un identifiant unique non devinable (exemple de forme : `/room/a7b8-c9d0` ; format UUID ou slug à décider).
  2. L'URL partageable est copiée dans le presse-papier.
  3. Lorsque l'utilisateur B ouvre cette URL dans un autre navigateur, il rejoint directement l'arène de l'utilisateur A sans passer par un lobby public.
  4. Les entités, les tirs et les scores du salon A ne sont visibles ni modifiables depuis un autre salon de la même instance serveur (critère vérifié par tests d'isolation).

---

## 5. Modes en backlog sans scénario d'acceptation

* **Capture the Flag** et **Breakout** : règles et disponibilité non résolues ; aucun scénario n'est écrit tant que la documentation n'est pas fiable. Ils restent en backlog (voir `scope.md` §2.3), pas supprimés.
* **Domination**, **Tag**, bosses et modes historiques : scénarios à rédiger au jalon concerné.

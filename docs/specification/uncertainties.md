# Registre des Incertitudes, Sources et Choix de Conception — diep-fried.io

**Date d'établissement** : 23 octobre 2026  
**Rôle** : Cadre de transparence, intégrité technique et traçabilité  
**Objectif** : Distinguer formellement ce qui est **Vérifié**, **Documenté**, **Estimé (choix de notre jeu)** et **Non résolu**.

---

## 1. Méthodologie et Intégrité

Conformément aux directives de développement éthique et légal du projet `diep-fried.io` :
* Aucun code source privé, aucun binaire WebAssembly décompilé et aucun actif rasterisé sous droits d'auteur n'ont été introduits dans le projet.
* Aucune mesure de simulation intrusive sur les serveurs de production n'a été exécutée.
* Toutes les valeurs numériques, équations de physique et constantes de balance non attestées publiquement par des spécifications ouvertes sont assumées comme des **choix de conception originaux de diep-fried.io**.

---

## 2. Classification des connaissances

### 2.1 Catégorie VÉRIFIÉ (Observations directes d'environnement)

Éléments directement constatés lors de l'inspection de l'accueil et du runtime Web client le 23 octobre 2026 :

1. **Pipeline graphique** :
   * Rendu Canvas HTML5 (canvas principal de $1920 \times 1200$ en résolution native et canvas miniatures pour les présentations d'éléments visuels).
   * Absence de feuille de sprites bitmap complexes pour le jeu principal : les entités sont tracées dynamiquement par des tracés 2D avec contours continus.
2. **Typographie** :
   * Polices chargées via l'API `FontFaceSet` : `Ubuntu` et `Open Sans`.
3. **Modes de jeu référencés dans le DOM** :
   * Présence explicite des sélecteurs pour : `FFA`, `2 Teams`, `4 Teams`, `Maze`, `Battle Royale` et `Sandbox`.
4. **Architecture distribuée observée** :
   * Services de découverte et de lobby distincts du serveur de match (`directory.diep.io/lobbies`, `lb.diep.io`).
   * Architecture moderne avec WebAssembly (`diep.wasm`).

### 2.2 Catégorie DOCUMENTÉ (Sources publiques ouvertes et datées)

Éléments confirmés par les archives communautaires, les wikis de référence et les projets de documentation technique ouverts :

1. **Arbre des 54 classes normales** :
   * [Diep.io Wiki — Tiers (2016–2026)](https://diepio.fandom.com/wiki/Tiers) : confirmation de la répartition 1 Tier 1, 4 Tier 2, 13 Tier 3 et 36 Tier 4.
   * Résolution du delta de 51 à 54 par l'intégration de la branche Shotgun :
     * `Shotgun` : Tier 3 (Niveau 30), issu du Machine Gun.
     * `Pellet Shot` : Tier 4 (Niveau 45), spécialisation tirant 30 plombs avec vision étendue.
     * `Dual-Barrel` : Tier 4 (Niveau 45), double canon indépendant/synchronisé à recul massif.
2. **Historique des sauts de Tier (Tier-Jumping)** :
   * `Sprayer` : initialement introduit en Tier 3 au niveau 30 en juillet 2016, puis déplacé en Tier 4 au niveau 45 le 31 juillet 2016, sautant le Tier 3 depuis le Machine Gun.
   * `Smasher` : accessible au niveau 30 directement depuis le Tank de base.
   * `Auto Tank` : accessible directement au niveau 45 depuis le Tank de base.
3. **Statistiques et progression** :
   * [Diep.io Wiki — Stats & Levels](https://diepio.fandom.com/wiki/Stats) :
     * 8 statistiques d'attributs.
     * 33 points de compétence au total répartis aux niveaux 2–28 (1 pt/niveau) et 30, 33, 36, 39, 42, 45 (1 pt tous les 3 niveaux).
     * Plafond habituel de 7 points par statistique.
     * Exception de la famille Smasher : 4 statistiques corporelles plafonnées à 10 points.
     * Seuil d'expérience niveau 45 documenté à environ 23 536 points d'XP.
4. **Entités spéciales & Bosses** :
   * [Diep.io Wiki — Bosses](https://diepio.fandom.com/wiki/Bosses) : 5 boss classiques (Guardian of the Pentagons, Summoner, Defender, Fallen Overlord, Fallen Booster).
   * Structures d'objectifs : 3 variantes de Dominators (Niveau 75) en mode Domination, Mothership (Niveau 140), Arena Closers (Niveau 100+ invulnérables).
5. **Ressources techniques antérieures** :
   * Projet [DiepInDepth](https://github.com/abcxff/diepindepth) (Licence Apache-2.0) : documente les concepts d'arène en pas fixe, de décalage de repère spatial et d'application des impulsions de recul.

---

### 2.3 Catégorie ESTIMÉ (Choix de conception propres à diep-fried.io)

Les éléments suivants ne sont pas extraits d'un serveur original mais définis expressément pour notre moteur :

| Paramètre | Choix arrêté pour diep-fried.io | Justification de conception |
| :--- | :--- | :--- |
| **Cadence de tick serveur** | 60 Hz (60 ticks par seconde) | Assure une réactivité parfaite pour le tir et les collisions sans saccade, standard moderne sur Node.js / Bun. |
| **Coefficient de friction** | $\mu = 0.08$ par tick | Fournit la sensation de glisse caractéristique du jeu tout en garantissant un arrêt net après relâchement. |
| **Résolution des collisions balles** | Échange symétrique de PV | Lorsque deux balles se heurtent, chacune perd de sa santé l'équivalent des dégâts de l'autre par tick. |
| **Génération du Labyrinthe (Maze)** | Algorithme de Prim modifié | Génère des couloirs de largeur minimale de 120 unités pour éviter tout blocage d'un tank de grande taille ou d'un essaim de drones. |
| **Sanctuaire d'équipe** | Rayon 600 unités, Drones à 1.5× vitesse max | Élimine les comportements anti-jeu de "spawn kill" en assurant une destruction en moins de 1.5 s de tout intrus. |
| **Protocole réseau** | WebSocket JSON typé puis binaire Delta | Évite toute complexité de reverse-engineering d'un protocole propriétaire au profit d'un contrat OpenAPI / JSON Schema clair. |
| **Perte d'XP à la mort** | Réapparition à $\min(22, \lfloor \text{Niveau}/2 \rfloor)$ | Préserve le dynamisme des parties entre amis sans obliger un joueur vaincu à recommencer intégralement au niveau 1. |

---

### 2.4 Catégorie NON RÉSOLU (Incertitudes ouvertes et limites)

Points nécessitant des itérations d'étalonnage durant la phase de test :

1. **Formule exacte de pénétration des balles d'origine** :
   * *Incertitude* : Le jeu original utilise-t-il une simple réserve de points de vie pour chaque balle ou un système d'armure / pénétration non linéaire ?
   * *Orientation diep-fried.io* : Nous adoptons une modélisation `durabilité = f(penetration, damage)` décrémentée au contact, simple, robuste et facile à équilibrer.
2. **Rayon de collision exact des nouvelles classes (Dual-Barrel, Pellet Shot)** :
   * *Incertitude* : Les gabarits précis de collision des plombs miniatures du Pellet Shot ne sont pas publiés au millième près.
   * *Orientation diep-fried.io* : Normalisation à un rayon de 3 unités pour les plombs et 12 unités pour les balles standards.
3. **Charge réseau sur de grands salons privés (> 20 joueurs)** :
   * *Incertitude* : Volume de bande passante généré par les essaims de drones (Overlord, Necromancer) et de balles spammées.
   * *Orientation diep-fried.io* : Implémenter en phase d'optimisation un filtrage par zone d'intérêt (*Spatial Interest Management*) n'envoyant aux clients que les entités situées dans leur champ de vision élargi.

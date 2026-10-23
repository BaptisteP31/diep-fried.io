# Registre des Incertitudes, Sources et Choix de Conception — diep-fried.io

**Date d'établissement** : 23 octobre 2026  
**Rôle** : Cadre de transparence, intégrité technique et traçabilité  
**Objectif** : Distinguer formellement ce qui est **Vérifié**, **Documenté**, **Estimé (proposition)** et **Non résolu**.

---

## 1. Méthodologie et Intégrité

Conformément aux directives de développement éthique et légal du projet `diep-fried.io` :

- Aucun code source privé, aucun binaire WebAssembly décompilé et aucun actif rasterisé sous droits d'auteur n'ont été introduits dans le projet.
- Aucune mesure de simulation intrusive sur les serveurs de production n'a été exécutée.
- Toutes les valeurs numériques, équations de physique et constantes de balance non attestées publiquement par des spécifications ouvertes sont des **propositions de conception de diep-fried.io**. Ces propositions ne sont pas des décisions d'architecture contraignantes tant que le coordinateur ne les a pas ratifiées.

---

## 2. Classification des connaissances

### 2.1 Catégorie VÉRIFIÉ (Observations directes d'environnement)

Éléments directement constatés lors de l'inspection de l'accueil et du runtime Web client le 23 octobre 2026 (observations de la recherche initiale, non reproduites par cette relecture) :

1. **Pipeline graphique** :
   - Rendu Canvas HTML5 (canvas principal de $1920 \times 1200$ en résolution native et canvas miniatures pour les présentations d'éléments visuels).
   - Absence de feuille de sprites bitmap complexes pour le jeu principal : les entités sont tracées dynamiquement par des tracés 2D avec contours continus.
2. **Typographie** :
   - Polices chargées via l'API `FontFaceSet` : `Ubuntu` et `Open Sans`.
3. **Modes de jeu référencés dans le DOM** :
   - Présence de sélecteurs pour : `FFA`, `2 Teams`, `4 Teams`, `Maze`, `Battle Royale` et `Sandbox`. Cela ne prouve ni que chaque mode est jouable, ni ses règles ; le texte indexé affiche aussi Capture the Flag (voir §2.4).
4. **Architecture distribuée observée** :
   - Services de découverte et de lobby distincts du serveur de match (`directory.diep.io/lobbies`, `lb.diep.io`).
   - Chargement de `diep.wasm` (WebAssembly).

### 2.2 Catégorie DOCUMENTÉ (Sources publiques ouvertes et datées)

Éléments confirmés par les archives communautaires, les wikis de référence et les projets de documentation technique ouverts :

1. **Arbre des 54 classes normales** :
   - [Diep.io Wiki — Upgrades](https://diepio.fandom.com/wiki/Upgrades) : 54 classes confirmées par le coordinateur le 23 octobre 2026, Shotgun, Pellet Shot et Dual-Barrel inclus. Les catégories du wiki contiennent aussi d'anciens tanks : ne pas compter à partir d'elles. Répartition retenue : 1 Tier 1, 4 Tier 2, 13 Tier 3 et 36 Tier 4 (contrôlée par script sur le catalogue).
   - Les arêtes à parents multiples et les règles de saut de Tier n'ont pas été revérifiées arête par arête dans cette relecture (le wiki a répondu HTTP 402).
   - Résolution du delta de 51 à 54 par l'intégration de la branche Shotgun :
     - `Shotgun` : Tier 3 (Niveau 30), issu du Machine Gun.
     - `Pellet Shot` : Tier 4 (Niveau 45), spécialisation à volée de plombs (30 selon les sources communautaires, non vérifié).
     - `Dual-Barrel` : Tier 4 (Niveau 45), deux canons ; **version-dépendant** : le changelog (https://diepio.fandom.com/wiki/Changelog) signale, selon le coordinateur, un changement au 2 novembre 2025 (deux canons au clic gauche, décalés). Convention du remake : comportement actuel (voir `scope.md` §3.4). L'entrée du changelog n'a pas été relue par le relecteur (HTTP 402).
2. **Historique des sauts de Tier (Tier-Jumping)** :
   - `Sprayer` : rapporté comme Tier 4 niveau 45 depuis le Machine Gun, sans Tier 3. L'historique de juillet 2016 (Tier 3 puis déplacement le 31 juillet 2016) provient de la recherche initiale et n'a pas été revérifié.
   - `Smasher` : accessible au niveau 30 directement depuis le Tank de base.
   - `Auto Tank` : accessible directement au niveau 45 depuis le Tank de base.
3. **Statistiques et progression** :
   - [Diep.io Wiki — Stats & Levels](https://diepio.fandom.com/wiki/Stats) :
     - 8 statistiques d'attributs.
     - 33 points de compétence au total répartis aux niveaux 2–28 (1 pt/niveau) et 30, 33, 36, 39, 42, 45 (1 pt tous les 3 niveaux).
     - Plafond habituel de 7 points par statistique.
     - Exception de la famille Smasher : 4 statistiques corporelles plafonnées à 10 points.
     - Seuil d'expérience niveau 45 : environ 23 536 points d'XP (valeur approximative selon la source ; courbe complète non vérifiée).
   - Les valeurs d'XP et de PV des formes, les multiplicateurs de FOV, les nombres de canons et les plafonds (drones, minions) du catalogue sont des valeurs communautaires ou proposées, marquées `parameterStatus: to-validate`.
4. **Entités spéciales & Bosses** :
   - [Diep.io Wiki — Bosses](https://diepio.fandom.com/wiki/Bosses) : 5 boss classiques (Guardian of the Pentagons, Summoner, Defender, Fallen Overlord, Fallen Booster).
   - Structures d'objectifs : 3 variantes de Dominators (Niveau 75) en mode Domination, Mothership (Niveau 140), Arena Closers (Niveau 100+ invulnérables). Les valeurs numériques (niveaux, PV, plafonds) sont à valider.
5. **Ressources techniques antérieures** :
   - Projet [DiepInDepth](https://github.com/abcxff/diepindepth) (Licence Apache-2.0) : documente les concepts d'arène en pas fixe, de décalage de repère spatial et d'application des impulsions de recul.

---

### 2.3 Catégorie ESTIMÉ (propositions de diep-fried.io, à valider)

Les éléments suivants ne sont pas extraits d'un serveur original. Ce sont des **propositions du chercheur**, non des décisions d'architecture contraignantes ; chacune doit être qualifiée par mesure ou par ratification du coordinateur :

| Paramètre                            | Proposition                                                    | Justification et réserves                                                                                                                                                                                                                                                                                                                             |
| :----------------------------------- | :------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cadence de tick serveur**          | 60 Hz à qualifier (30 Hz possible)                             | Un pas fixe plus fin réduit le pas de simulation et la latence d'entrée, au prix du CPU et de la bande passante. Aucune réactivité « parfaite » n'est garantie ; à décider après mesure sur Node.js/Bun. Le tick du jeu d'origine n'a pas été mesuré.                                                                                                 |
| **Coefficient de friction**          | $\mu = 0.08$ par tick (à qualifier)                            | Valeur de départ pour la sensation de glisse. Dépend de la fréquence de tick (non transposable de 60 à 30 Hz sans conversion) ; la formule du `scope.md` doit utiliser une unité cohérente. À calibrer.                                                                                                                                               |
| **Résolution des collisions balles** | Échange symétrique de PV                                       | Lorsque deux balles se heurtent, chacune perd l'équivalent des dégâts de l'autre par tick. Modèle simple, à équilibrer.                                                                                                                                                                                                                               |
| **Génération du Labyrinthe (Maze)**  | Algorithme de Prim modifié (proposition)                       | Largeur minimale de couloir proposée de 120 unités pour réduire le risque de blocage d'un grand tank ou d'un essaim ; ne le supprime pas (les drones peuvent se coincer, un arbre couvrant crée des impasses). Un arbre couvrant n'a pas de cycles : ajouter des boucles est à étudier. Largeur à valider par rapport aux plus grands rayons de tank. |
| **Sanctuaire d'équipe**              | Rayon 600 unités ; drones à 1.5× la vitesse max (propositions) | Vise à décourager le spawn kill ; l'objectif de destruction d'un intrus en moins de 1.5 s est une cible de conception à valider, non un résultat acquis. Rayon à ajuster selon la taille d'arène.                                                                                                                                                     |
| **Protocole réseau**                 | WebSocket JSON typé, éventuellement binaire delta              | Le choix du format est ouvert : mesurer avant d'optimiser (cf. `docs/research/diep-io-inventaire.md`). Le protocole d'origine n'est pas visé. Un contrat de messages formel reste à définir ; il ne s'applique pas à `content-catalog.json`, qui est un simple fichier de données non validé par un schéma.                                           |
| **Taille d'arène**                   | 4000×4000 (FFA/équipes), 2000×2000 (Sandbox)                   | Valeurs de départ, non issues de l'original.                                                                                                                                                                                                                                                                                                          |
| **Réapparition**                     | niveau $\max(1, \min(22, \lfloor L/2 \rfloor))$                | Correction : $\lfloor 1/2 \rfloor = 0$ donnerait un niveau 0 ; le minimum de 1 est ajouté. Le plafond 22 est redondant pour $L \le 45$ ($\lfloor 45/2 \rfloor = 22$) et ne joue que pour des niveaux supérieurs à 45. La perte réelle de progression de l'original reste non résolue.                                                                 |
| **Regroupement en familles d'armes** | 11 familles du catalogue                                       | Classification de notre catalogue, pas une taxonomie officielle.                                                                                                                                                                                                                                                                                      |

---

### 2.4 Catégorie NON RÉSOLU (Incertitudes ouvertes et limites)

Points nécessitant des itérations d'étalonnage durant la phase de test :

1. **Formule exacte de pénétration des balles d'origine** :
   - _Incertitude_ : Le jeu original utilise-t-il une simple réserve de points de vie pour chaque balle ou un système d'armure / pénétration non linéaire ?
   - _Orientation diep-fried.io_ : Nous adoptons une modélisation `durabilité = f(penetration, damage)` décrémentée au contact, simple, robuste et facile à équilibrer.
2. **Rayon de collision exact des nouvelles classes (Dual-Barrel, Pellet Shot)** :
   - _Incertitude_ : Les gabarits précis de collision des plombs miniatures du Pellet Shot ne sont pas publiés au millième près.
   - _Orientation diep-fried.io_ : Normalisation à un rayon de 3 unités pour les plombs et 12 unités pour les balles standards.
3. **Charge réseau sur de grands salons privés (> 20 joueurs)** :
   - _Incertitude_ : Volume de bande passante généré par les essaims de drones (Overlord, Necromancer) et de balles spammées.
   - _Orientation diep-fried.io_ : Implémenter en phase d'optimisation un filtrage par zone d'intérêt (_Spatial Interest Management_) n'envoyant aux clients que les entités situées dans leur champ de vision élargi.
4. **Modes Capture the Flag et Breakout** :
   - _Incertitude_ : mentionnés par la documentation communautaire (CTF aussi dans le texte indexé du site) mais absents des sélecteurs DOM observés (qui exposent Battle Royale) ; règles, rotation et disponibilité inconnues.
   - _Orientation diep-fried.io_ : conservés en backlog, non spécifiés, à documenter par source datée avant tout développement.
5. **Déclencheur de conversion du Necromancer** :
   - _Incertitude_ : contact avec un carré ou carré détruit par le Necromancer/ses drones. Convention du remake à choisir.
6. **Version-dépendance générale** :
   - _Incertitude_ : le jeu évolue (Dual-Barrel modifié le 2 nov. 2025 selon le changelog, Sandbox et modes en rotation). Chaque mécanique doit rattacher sa version de référence.
7. **Arêtes d'amélioration à parents multiples et Auto Tank** : non revérifiées une à une ; à comparer à la page Upgrades avant implémentation du graphe.
8. **Touches K et `\` en Sandbox** : saut au niveau 45 et sélection/cycle de classe non définis ; raccourcis actuels du Sandbox à tester.
9. **Rattachement des modes à objectifs, IA et boss à un jalon** : `scope.md` les place en « v1.5 » alors que `docs/DEVELOPMENT.md` les situe au jalon 4 ; à arbitrer par le coordinateur.
10. **Propositions non contraignantes à ratifier** : 60 Hz, friction, algorithme de Prim, protocole binaire, rayon de base, tailles d'arène, valeurs de FOV et plafonds de drones.

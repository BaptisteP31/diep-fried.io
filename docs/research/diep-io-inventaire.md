# Diep.io — inventaire pour un remake open source

Recherche du 23 octobre 2026. Objectif : préparer un jeu autonome, auto-hébergeable et jouable entre amis. Le dépôt était vide au début de la recherche.

Ce document distingue **observé** (page et ressources chargées dans le navigateur), **documenté** (sources publiques, parfois anciennes) et **proposé** (choix pour notre jeu). Il ne constitue pas une extraction exhaustive du jeu : aucune partie complète, aucun compte connecté, aucun achat et aucune mesure de simulation n’ont été réalisés. Le serveur, son code et ses règles internes ne sont pas accessibles à partir de la page.

## 1. Ce qui compose le jeu

La boucle documentée : piloter un tank dans une arène 2D, détruire des formes et des adversaires, gagner du score et de l’expérience, améliorer ses statistiques, choisir une classe, survivre et progresser au classement. Les branches de classes permettent notamment le tir direct, les drones, les pièges et le combat par collision. [Présentation communautaire](https://diepio.fandom.com/wiki/Diep.io)

Pour le remake, les sous-systèmes à construire sont :

- Monde : arène, limites, grille, zones, obstacles et apparition des entités.
- Simulation : positions, vitesses, accélération, frottement, recul et collisions.
- Combat : tirs, cadence, durée de vie, dégâts, résistance des projectiles, santé et mort.
- Progression : expérience, niveaux, points, classes et builds.
- Intelligence artificielle : drones, tourelles, ennemis et boss.
- Partie : règles du mode, équipes, apparition, réapparition, victoire et remise à zéro.
- Client : commandes, caméra, rendu, HUD, menus et paramètres.
- Multijoueur : salons, connexions, synchronisation et départs des joueurs.
- Exploitation : configuration, hébergement, logs et sauvegarde éventuelle.

Cette décomposition est une proposition d’architecture, pas une description du code privé de Diep.io.

## 2. Client actuel : observations directes

Sur [diep.io](https://diep.io/), la page chargée expose : connexion, VIP, boutique, Custom Games, sélection du mode et de la région, pseudonyme, Play, Copy Party Link, langue, Rules et menu. Le contenu indexé du site expose aussi Settings, Keybinds, Support, Socials et Changelog.

La promotion de boutique observée présente les skins Plated, Crest et Gear, les raretés Epic/Legendary, une monnaie « Shinies », des réductions et un « Locker ». Elle indique qu’un skin s’applique aux différentes classes. Ce n’est pas un catalogue complet.

Des boutons présents dans le DOM portent les noms FFA, 2 Teams, 4 Teams, Maze, Battle Royale et Sandbox. Leur présence dans le DOM ne prouve pas que chaque mode est immédiatement jouable. Les textes indexés du site affichent à la place Capture the Flag : état variable, rotation ou différence de version à vérifier.

Le client charge du JavaScript, une feuille CSS et `diep.wasm`. Quatre éléments canvas ont été observés : un grand canvas et trois petits associés à la présentation des skins. Cela confirme l’utilisation de canvas et WebAssembly, sans établir à lui seul le moteur de rendu ou le langage source.

## 3. Assets : inventaire concret

Les URL exactes observées sont conservées dans [observed-resources.json](observed-resources.json). Il s’agit des ressources de cette visite de l’accueil, pas de tous les fichiers du site. Les noms contenant un hash changeront probablement à une prochaine livraison.

### Ressources du client

- `https://diep.io/assets/index-4248191f.js` : bundle JavaScript chargé.
- `https://diep.io/assets/index-60017d06.css` : feuille de style chargée.
- `https://diep.io/diep.wasm` : module WebAssembly chargé.

Ces fichiers sont du programme distribué au navigateur ; ils ne constituent pas une base source open source pour notre dépôt.

### Images identifiées

- `/assets/diep/logo.png` : logo de l’interface.
- `/title.png` : image chargée, fonction exacte à confirmer.
- `/assets/DiepDiscord.png` : visuel du lien communautaire.
- `/assets/diep/new-blinker.png` : image référencée par le CSS.
- `/assets/flag-square/de.svg`, `gb.svg`, `us.svg` : drapeaux chargés.
- Favicons déclarés : `/assets/favicon/favicon-16x16.png`, `favicon-32x32.png`, `favicon-96x96.png`, `favicon.png`.

### Icônes SVG chargées sous `/assets/fa/`

`crown`, `store`, `gear`, `xmark`, `gavel`, `circle-question`, `keyboard`, `users`, `game-board-simple`, `list-tree`, `arrow-up-right-from-square`, `lock`, `chevron-up`, `chevron-down`, `chevron-left`, `circle-up-regular`, `film`, `camera-movie`, `right-to-bracket`, `palette`, `clock`, `shirt`, `link-simple`.

Chaque nom correspond ici à un fichier `.svg`. Le chemin `fa` évoque une bibliothèque d’icônes, mais la provenance et la licence exactes n’ont pas été vérifiées.

### Polices

Le style calculé du body commence par Ubuntu, puis des polices de substitution CJK et sans-serif. Ubuntu et Open Sans sont indiquées comme chargées par l’API FontFaceSet pendant la visite. La page de consentement/publicité déclare beaucoup d’autres familles : leur déclaration ne permet pas de les attribuer au jeu.

### Visuels à recréer par code

Pour notre version, prévoir des primitives paramétriques : corps circulaires, canons rectangulaires ou trapézoïdaux, polygones réguliers, pointes, tourelles, projectiles et barres. Décrire chaque canon par sa position, son angle, ses dimensions et son animation de recul. Réutiliser la même description pour le monde, les vignettes de classe et l’arbre d’évolution.

Prévoir également la grille, les fonds de bases, contours, transparence, couleurs d’équipe, texte avec contour, animation de dégâts et disparition des entités. Les teintes exactes, épaisseurs et durées restent à relever ; aucune palette chiffrée n’est affirmée ici.

### Audio

Aucun fichier audio n’apparaît dans le relevé filtré des ressources propres au site. Cela ne prouve pas l’absence de son : chargement différé, génération ou encapsulation restent possibles. Rien ne justifie actuellement de prévoir un gros travail de sprites, textures ou audio pour le premier prototype.

## 4. Entités et comportements à inventorier

La documentation communautaire décrit les carrés, triangles, pentagones, Alpha Pentagons, formes vertes rares et Crashers. Elle cite cinq boss classiques : Guardian of the Pentagons, Summoner, Defender, Fallen Overlord et Fallen Booster. [Formes et présentation générale](https://io-games.fandom.com/wiki/Diep.io), [boss et variantes événementielles](https://diepio.fandom.com/wiki/Bosses)

Pour le code du remake, prévoir les catégories suivantes, sans supposer qu’elles correspondent aux classes internes du jeu original :

- Tank joueur : corps, canons, santé, classe, statistiques, score, niveau et équipe.
- Projectile : propriétaire, position, vitesse, dégâts, résistance, expiration et collisions autorisées.
- Drone : propriétaire, cible, autonomie, commande du curseur et limite de population.
- Piège : projectile à déplacement et persistance particuliers.
- Missile : projectile pouvant lui-même porter des canons.
- Minion : unité produite par certaines classes.
- Forme neutre : santé, valeur d’expérience, taille, rotation et distribution spatiale.
- Ennemi IA : acquisition de cible, poursuite et attaque.
- Structure : base, mur, objectif ou tourelle selon le mode.

Les Dominators et Arena Closers sont des entités particulières documentées ; ne pas les traiter comme de simples classes sélectionnables en partie normale. [Classes spéciales](https://diepio.fandom.com/wiki/Tiers)

## 5. Classes de tanks

Catalogue de travail communautaire, à confronter au client actuel ; les branches ne sont pas toutes des arbres exclusifs et certaines classes ont plusieurs parents. La page Tiers annonce 54 classes normales et comprend des ajouts récents comme Auto Tank et Firework. [Tiers](https://diepio.fandom.com/wiki/Tiers)

- Départ : Tank.
- Niveau 15 : Twin, Sniper, Machine Gun, Flank Guard.
- Niveau 30 : Triple Shot, Quad Tank, Twin Flank, Assassin, Overseer, Hunter, Trapper, Destroyer, Gunner, Tri-Angle, Auto 3, Smasher.
- Niveau 45, catalogue à valider : Triplet, Penta Shot, Spread Shot, Octo Tank, Triple Twin, Battleship, Ranger, Stalker, Overlord, Necromancer, Manager, Overtrapper, Factory, Predator, Streamliner, Tri-Trapper, Gunner Trapper, Mega Trapper, Auto Trapper, Hybrid, Annihilator, Skimmer, Rocketeer, Glider, Firework, Auto Gunner, Sprayer, Booster, Fighter, Auto 5, Landmine, Auto Smasher, Spike, Auto Tank.

Cette liste contient 51 noms, donc **ne résout pas le total annoncé de 54** : vérifier les ajouts, les niveaux et les éventuelles incohérences de la page avant de l’utiliser comme catalogue exhaustif. Aucun identifiant numérique historique n’est repris comme identifiant stable.

Les spécialisations changent notamment la disposition des canons, cadence, dispersion, projectile, champ de vision, recul, contrôle des drones, automatisation et parfois invisibilité. Le remake gagnera à les décrire par données et composants de comportement.

## 6. Progression et statistiques

La documentation décrit un maximum normal de niveau 45, des choix de classe aux niveaux 15, 30 et 45 et 33 points à répartir. Les huit statistiques sont : régénération, santé maximale, dégâts de contact, vitesse des projectiles, pénétration, dégâts des projectiles, rechargement et vitesse de déplacement. Le plafond habituel est de sept points ; la famille Smasher comporte des exceptions allant à dix. [Statistiques](https://diepio.fandom.com/wiki/Stats)

Le niveau modifie aussi la taille, la santé, le champ de vision et la vitesse ; la mort réduit la progression conservée. Les détails exacts de réapparition et les courbes d’expérience doivent être fixés et mesurés pour la version ciblée. [Niveaux](https://diepio.fandom.com/wiki/Levels)

Ne pas inventer les constantes originales. Il manque notamment : expérience par forme, seuils de niveaux, attribution d’un kill, santé par entité, coefficients par classe, cadence, vitesse, durée de vie, pénétration, frottement, recul et cadence des dégâts de collision. La page Stats précise elle-même que certaines valeurs sont approximatives.

## 7. Modes

La documentation communautaire décrit FFA, équipes à deux ou quatre, Maze, Sandbox et des modes à objectif tels que Domination, Tag, Breakout et Capture the Flag. Elle comporte aussi des modes historiques, dont Survival et Mothership ; disponibilité et rotation doivent être datées. [Modes](https://diepio.fandom.com/wiki/Game_Modes)

Pour une réimplémentation, chaque mode doit définir : équipes, carte, apparitions, dégâts alliés, objectifs, victoire, réapparition et réinitialisation. Notre première cible peut être **un salon privé FFA avec options Sandbox**, puis équipes et labyrinthe. C’est un choix proposé pour jouer rapidement entre amis.

## 8. Commandes et interface de jeu

Les contrôles documentés incluent WASD/flèches, visée souris, clic gauche/espace pour tirer, E pour le tir automatique, C pour la rotation automatique, chiffres 1–8 pour les statistiques et Y pour l’arbre. Clic droit/Shift a un effet dépendant de la classe, notamment sur les drones. Le wiki décrit également les combinaisons M/U pour programmer les améliorations. [Commandes](https://diepio.fandom.com/wiki/Gameplay_Strategies)

Prévoir des touches reconfigurables et une prise en charge AZERTY dès le prototype ; vérifier séparément touches physiques et caractères. Les raccourcis exacts, options mobiles et raccourcis Sandbox actuels restent à tester.

Le HUD à spécifier comprend classement, nom et score, santé, barre d’expérience, niveau/classe, statistiques, choix d’évolution, minimap, messages et écran de mort. Relever encore les règles de visibilité, les ancres à différentes résolutions et les informations de latence. Ne pas confondre le HUD classique documenté avec l’accueil actuel observé.

## 9. Services et réseau observés

Le navigateur a chargé ou appelé les URL suivantes :

- `directory.diep.io/lobbies`, `/best-region`, `/join`.
- `lb.diep.io/api/getLatestChangelogAndDowntime`.
- `api.diep.io/store/skins/art`, `/store/offers`, `/store/rotations`, `/currency-bundles`.

Cela révèle des services de découverte, de contenu et de boutique, sans documenter leurs contrats. Le protocole temps réel, les messages, le tick serveur et le transport de la session de jeu n’ont pas été capturés ici.

La page charge aussi des intégrations publicitaires/consentement Playwire/Intergient et Google, Cloudflare Turnstile et le SDK CrazyGames. Ces services sont périphériques à notre objectif entre amis. Aucun mécanisme d’authentification, secret ou protection n’a été contourné.

## 10. Ressources techniques publiques

[DiepInDepth](https://github.com/abcxff/diepindepth) réunit des notes sur protocole, WebAssembly, canvas, mémoire, entités et physique. Le dépôt affiche Apache-2.0 et avertit que son développement n’est plus actif. C’est une piste pour vérifier des hypothèses historiques, pas une spécification du client d’octobre 2026. Son README renvoie à diepcustom pour d’autres travaux ; ce projet n’a pas été audité pendant cette recherche.

Les anciens tableaux d’identifiants de protocole sont particulièrement fragiles : une [documentation historique des upgrades](https://github-wiki-see.page/m/firebolt55439/Diep.io-Protocol/wiki/Upgrade-Packets) indique explicitement que ses valeurs sont devenues incorrectes.

Pour toute réutilisation future, contrôler fichier, licence, version et provenance. Le présent dépôt ne contient ni bundle original, ni WASM, ni image propriétaire récupérée. Les liens servent à documenter l’observation. Créer nos propres visuels et identité évite de dépendre de fichiers hébergés par le jeu ; la disponibilité publique d’un fichier ne fournit pas à elle seule une licence de réutilisation.

## 11. Architecture proposée pour diep-fried.io

Un client TypeScript avec Canvas 2D et un serveur TypeScript/Node utilisant WebSocket conviennent comme point de départ. Il s’agit d’une proposition locale, pas d’une affirmation sur la stack originale.

Le serveur simule le monde à pas fixe et valide déplacements, tirs, expérience et améliorations. Le client envoie des intentions et dessine un état interpolé ; une prédiction du joueur local peut ensuite améliorer la réactivité. Ne pas choisir un tick prétendument identique à Diep.io sans mesure.

Séparer simulation partagée, définitions des entités/classes, rendu client, serveur de salons et configuration. Utiliser une partition spatiale pour les collisions et la sélection des entités visibles. Mesurer avant d’ajouter un protocole binaire ou d’autres optimisations.

Un salon privé doit permettre de créer une partie, partager une URL, rejoindre, changer quelques règles et rejouer après une mort. Une seule instance avec fichiers de configuration suffit comme première cible ; comptes, boutique et base de données ne sont pas nécessaires à cette boucle.

## 12. Ordre de réalisation proposé

1. Prototype local : caméra, grille, tank, déplacement, visée, recul, tirs et formes.
2. Combat : collisions, projectiles destructibles, santé, score et réapparition.
3. Partie privée : serveur autoritaire, plusieurs navigateurs, lien de salon et reconnexion.
4. Progression : niveaux, statistiques et quatre premières spécialisations.
5. Fidélité : mesures comparatives et réglage du mouvement, cadence, caméra et collisions.
6. Contenu : classes avancées, drones, pièges, équipes, murs et boss selon les envies.
7. Distribution : démarrage documenté, configuration et conteneur d’auto-hébergement.

Critère d’un premier résultat utile : plusieurs amis rejoignent la même URL, se déplacent sans désynchronisation majeure, combattent, progressent et réapparaissent, avec un serveur qu’ils peuvent lancer eux-mêmes.

## 13. Ce qu’il reste à vérifier

- Capturer une vraie session Sandbox et les écrans paramètres, classes et mort.
- Réconcilier le catalogue de classes et les modes actuels.
- Mesurer dimensions, couleurs, mouvements et animations à résolution connue.
- Mesurer vitesse/durée des projectiles, cadence, recul et collisions à builds identiques.
- Relever courbe d’expérience, score des formes et perte à la mort.
- Décrire contrôles/IA de chaque famille de drones, pièges et tourelles.
- Examiner le trafic d’une session autorisée pour comprendre la synchronisation, si une compatibilité avec le protocole original devient un objectif ; elle n’est pas nécessaire à un jeu autonome.
- Tester la charge et le confort avec le nombre réel d’amis visé.

Limites de collecte : le téléchargement HTTP direct depuis le terminal a reçu un 403 ; l’observation a donc utilisé le navigateur. Plusieurs pages du wiki ont refusé l’ouverture directe, bien que leur contenu soit accessible dans les résultats indexés. La recherche est un inventaire sourcé et une base de spécification, pas la promesse d’une reproduction exhaustive ou exacte.

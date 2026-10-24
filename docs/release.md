# Validation de livraison

Mise à jour locale du 24 octobre 2026 : offre de source par archive intégrée au
build, avis MIT Vite ajouté. Les mesures et l’image du 23 octobre ci-dessous
restent des résultats historiques, pas une validation du nouvel artefact.

Audit local du 23 octobre 2026. Référence des scripts et des validations :
`26486dbabcb753e941875bae068ac9881a9cd421`, basé sur le runtime
`75893866c46155c49323f1fbe8939bb8fb7ac0bf`. Aucun push, déploiement ou PR effectué ;
la présence locale d'un commit ne prouve pas que son source est disponible publiquement.

## Reproduire depuis un clone propre

Prérequis : Git, npm et Node 22 (≥22.12) ou Node 24. Les versions effectivement vérifiées
sont Node 22.23.1 / npm 10.9.8 et Node 24.22.1 / npm 11.19.1.

```sh
git clone <URL-du-depot-accessible> diep-fried.io
cd diep-fried.io
git checkout <commit-a-livrer>
npm ci
npm run check
npm run build
node scripts/smoke.mjs --no-build
node scripts/load.mjs --no-build
npm start
```

Ouvrir `http://localhost:8080` ; `GET /healthz` doit répondre `status: ok`.
Arrêter avec Ctrl-C. Pour identifier une livraison, définir `DIEP_FRIED_VERSION`
au commit exact avant le démarrage ; par défaut l'identifiant reste `dev`.
Les deux scripts sans `--no-build` exécutent eux-mêmes `npm run build` avant le test.
Ils exigent Git et les dépendances installées, sans service externe ni dépendance ajoutée.

Deux clones **locaux indépendants**, sans `node_modules` ni `dist` initiaux, ont été
créés par `git clone --no-hardlinks --local`, puis installés et vérifiés sous les
deux versions Node en conteneurs Alpine. Ce test ne vérifie ni l'accès anonyme à
un dépôt distant ni la publication du commit. Pour ces montages seulement, Git
a demandé `safe.directory=/workspace` à cause de la différence de propriétaire
hôte/conteneur ; aucune configuration Git du projet n'a été changée.

## CI

`.github/workflows/ci.yml` exécute `npm ci`, `npm run check`, `npm run build`,
le smoke puis la charge 30 s sur Ubuntu, matrice Node 22 et 24. Déclenchement
sur push, pull request et lancement manuel ; permission `contents: read`,
aucun secret, aucune publication d'image et aucun déploiement.
Le workflow n'a pas été exécuté sur GitHub dans cette intervention.

Compatibilité vérifiée dans `package-lock.json` : Vite 8.3.5 et Rolldown 1.2.15
déclarent `^20.19.0 || >=22.12.0`, Vitest 5.0.5
`^22.12.0 || ^24.0.0 || >=26.0.0`, TypeScript 7.0.2 `>=16.20.0`,
esbuild 0.28.2 `>=18`, ws 8.22.0 `>=10.0.0`. Les autres contraintes Node du
lockfile admettent aussi 22.12 et 24 ; la racine exige `>=22.12.0`.
La matrice utilise la dernière version disponible de chaque majeure, pas Node 22.0.

`npm run check` (types, 30 fichiers / 372 tests, formatage) et le build sont passés
sur les deux clones. npm 11 avertit des scripts d'installation esbuild non encore
déclarés dans `allowScripts` ; le binaire optionnel installé a permis le build,
sans approbation ni modification du lockfile.
Les scénarios et mesures sont décrits dans [performance.md](performance.md).

## Image Docker

Dockerfile : Node 22 Alpine, GNU tar installé uniquement dans l’étage de build, utilisateur `node` (uid 1000), serveur et
client construits, dépendance de production `ws`, port interne 8080.

```sh
docker build -t diep-fried:local .
docker run --rm --name diep-fried -p 8080:8080 diep-fried:local
```

Sur cette machine, le build normal et le lancement bridge ont échoué avant
l'exécution applicative : `failed to add the host (...) <=> sandbox (...) pair
interfaces: operation not supported`. La solution de vérification locale a été :

```sh
docker build --network=host -t diep-fried-ci:local .
docker run -d --network=host --name diep-fried-ci-host diep-fried-ci:local
docker stop --timeout 5 diep-fried-ci-host
docker rm diep-fried-ci-host
```

Image vérifiée `sha256:585b05fc977955ee71270812667e341bddb94b301a20114cce16e53bb966e122`,
Node 22.23.1. Avec **CMD et variables par défaut**, `/`, `/healthz`, les licences
et le handshake WS `/ws` ont répondu ; le HEALTHCHECK est devenu `healthy` et
SIGTERM a terminé avec le code 0. La publication de port et l'isolation réseau
bridge restent non vérifiées ici. Le réseau host partage les ports de l'hôte.
Cette image a été construite sur le runtime `7589386`, avant le commit des scripts ;
les scripts ne sont pas copiés dans l'étage runtime.

## Contenu réellement distribué et licences

Le build Vite produit **un seul HTML : `index.html`**, les assets, quatre avis de
licence et les trois fichiers de l’offre de source sous `source/`.
`qa-showcase.html`, captures QA, scripts showroom et ressources `reference-only`
ne sont pas distribués, y compris dans l’archive source. Les URL de fichiers QA et de référence
testées rendent 404 ; les routes sans extension peuvent recevoir le fallback
SPA et ne constituent donc pas une preuve d'exposition d'un fichier.

- Code du projet : `AGPL-3.0-or-later` dans les manifestes ; texte intégral dans
  `LICENSE`, `/licenses/AGPL-3.0.txt` et `/app/LICENSE` dans l'image.
- Polices réellement embarquées : Ubuntu Regular et Bold sous UFL 1.0.
  Les fichiers HTTP correspondent octet pour octet aux TTF du dépôt ; le texte
  `/licenses/Ubuntu-Font-UFL.txt` correspond à `assets/fonts/UFL.txt`.
  `/licenses/THIRD_PARTY_NOTICES.txt` donne le copyright Canonical et la licence.
- `ws` 8.22.0 : MIT ; licence et copyrights conservés dans
  `/app/node_modules/ws/LICENSE` de l'image.
- Les drapeaux et icônes collectés dans `docs/research/asset-collection` ne sont
  pas incorporés au client construit ; leurs avis de recherche restent distincts.
- Le helper `modulepreload` de Vite conserve son avis MIT :
  `/licenses/Vite-MIT.txt` est extrait de la section « Vite core license » de
  `LICENSE.md` de Vite installé par le lockfile, copyright et texte MIT complets.
  Le même avis est dans l’archive sous `licenses/Vite-MIT.txt` ; une structure
  de licence Vite inconnue fait échouer le build pour permettre sa revue.
- L'image contient aussi Node et Alpine 3.24.1 : leurs licences propres restent
  applicables. Les avis Node sont présents dans `/usr/local/LICENSE`, ceux de npm
  et Corepack dans leurs répertoires `/usr/local/lib/node_modules/`.
  Les avis des composants de l'image de base ne sont pas couverts
  par la seule licence du projet ; cet audit n'est pas un inventaire juridique
  exhaustif des paquets de l'OS ni de tous les outils de développement.

## Source correspondant et préparation AGPL

La section 13 de [LICENSE](../LICENSE) traite de l'offre du source correspondant
aux utilisateurs réseau ; les sections 1 et 6 précisent le source et la
distribution des formes exécutables. Les sourcemaps HTTP ne remplacent pas le
source complet avec les fichiers nécessaires à la reconstruction.

Le lien « Code source » du menu vise maintenant **`/source/source.tar.gz`**,
servi par le serveur statique existant depuis le même déploiement que le client.
Il ne dépend plus d’un dépôt GitHub ni de sa visibilité. Le plugin Vite prépare
une copie des sources avant le build, puis revérifie la liste, les modes
exécutables et chaque empreinte avant de copier l’offre dans `apps/client/dist`.
Une modification des fichiers inclus pendant le build le fait échouer.
Cette protection exige un checkout stable ; elle ne rend pas le build atomique
face à un processus qui modifierait puis restaurerait les fichiers entre lectures.

Les trois téléchargements sont :

- `/source/source.tar.gz` : source complet du projet et scripts de reconstruction ;
- `/source/source-manifest.json` : version, révision informative et, par fichier,
  chemin, taille, mode et SHA-256 ; le manifeste identique est dans l’archive ;
- `/source/SHA256SUMS` : SHA-256 de l’archive et du manifeste téléchargés.

Les empreintes identifient les octets livrés, y compris les modifications locales
et fichiers non suivis admissibles ; le SHA Git seul ne les décrit pas. Il ne
constitue pas une signature d’authenticité. Le manifeste ne se hache pas lui-même.
L’archive est déterministe à sources, modes, métadonnées et version de GNU tar
identiques (dates et propriétaires normalisés).

### Reconstruction sans `.git`

Prérequis de l’exporteur : Node ≥22.12, npm, GNU tar et chemins de descripteurs
Unix (`/proc/self/fd` sur Linux, `/dev/fd` sur les autres Unix ; seule la voie
Linux est vérifiée ici). GNU tar doit être installé séparément sur les systèmes
qui fournissent BSD tar. Aucun paquet npm supplémentaire n’a été ajouté.

```sh
# Depuis une version déjà construite : vérifie HTTP, health, empreintes et avis.
npm run smoke:source
# En plus : extraction sans .git, npm ci, build direct workspace client,
# build serveur et comparaison de l’archive reconstruite octet pour octet.
npm run smoke:source -- --rebuild
# Sur un service existant, dont health doit annoncer la version du manifeste :
npm run smoke:source -- --base=http://127.0.0.1:8080
```

Pour reconstruire une archive reçue, télécharger les trois fichiers dans un
répertoire vide, puis :

```sh
sha256sum -c SHA256SUMS
mkdir source
# Archive produite par ce projet, contenant uniquement fichiers et dossiers.
tar -xzf source.tar.gz -C source
cd source
npm ci --ignore-scripts
# Reprendre version/révision du manifeste pour reproduire ses métadonnées.
export DIEP_FRIED_VERSION="$(node -p "require('./source-manifest.json').version")"
export DIEP_FRIED_REVISION="$(node -p "require('./source-manifest.json').revision ?? ''")"
npm run check
npm run build
npm run smoke:source
```

Le build racine et `npm run build -w @diep-fried/client` exécutent tous deux
l’export. Ni Git ni `.git` ne sont requis : sans `.git` ni révision explicite,
`revision` vaut `null`. `DIEP_FRIED_REVISION` permet une référence informative ;
`DIEP_FRIED_VERSION` identifie la livraison (par défaut `dev`). Pour un processus
Node hors Docker, conserver la même `DIEP_FRIED_VERSION` au build et au démarrage
pour que `/healthz` et `welcome` concordent. L’image Docker conserve la version
de build comme valeur par défaut du runtime :

```sh
docker build --build-arg DIEP_FRIED_VERSION=<version> \
  --build-arg DIEP_FRIED_REVISION=<sha-informatif> -t diep-fried:local .
```

Le conteneur final embarque l’archive dans le client construit, sans Git ni GNU
tar nécessaires à l’exécution. Les routes du serveur et le protocole restent
inchangés ; le téléchargement `.gz` est servi en `application/octet-stream`
avec `no-cache`. Le mode Vite de développement ne prépare pas cette offre :
valider le lien source avec un build de production et le serveur du projet.
L’offre source pour un accès WS direct est à indiquer dans les instructions
d’accès au service : `welcome` ne contient pas d’URL source.

### Périmètre, bornes et exclusions

L’export lit seulement les fichiers racine explicitement autorisés (manifestes,
lockfile, configurations, README, LICENSE, Dockerfile), puis `apps/`, `packages/`,
`scripts/`, `assets/`, `docs/` et `.github/`. Il ajoute l’avis Vite depuis les
dépendances installées **dans ce checkout**, sans rechercher une installation
npm globale ou parente. Il conserve le code, les tests automatisés, scripts CI,
smoke et charge, polices et avis des ressources libres. Les tests réseau sous
`scripts/qa/` sont du code de validation conservé ; les pages et captures QA
locales du client sont exclues.

Sont exclus à toute profondeur : Git, dépendances, builds, caches, fichiers
`.env` (même les exemples), noms usuels de secrets/credentials/clés, journaux,
archives imbriquées, captures/screenshots et `reference-only`. Le contexte
Docker applique également les exclusions env et ressources locales. Les liens
symboliques sur un chemin admissible et fichiers spéciaux font échouer l’export ;
chaque ouverture de composant refuse les symlinks, sans suivre leur cible.
Aucun parcours du parent du dépôt ou du répertoire utilisateur n’est effectué.
Une liste de noms ne détecte pas un secret placé arbitrairement dans du code :
l’exploitant doit examiner les fichiers admissibles avant toute distribution.

Les limites sont fixes : 20 000 entrées visitées, 32 niveaux, chemins de 2 048
octets, 32 Mio par fichier et 128 Mio au total. Taille vérifiée à l’inventaire
et pendant la copie ; dépassement = échec, sans archive partielle publiée.
La copie, le hachage et la compression sont en flux avec contre-pression ;
le disque temporaire contient une copie bornée et l’archive, supprimées à la
fin du build. Les gros fichiers ne sont pas chargés en mémoire en entier.

Aucun push ni déploiement n’est effectué ici. L’offre est vérifiée localement ;
son accessibilité depuis un utilisateur externe dépend encore du déploiement
qui servira ce build et de la conservation de ces trois fichiers ensemble.

### Vérification locale de ce lot (24 octobre 2026)

- Hôte Linux, Node 26.12.1 / npm 12.2.1 : `npm run check` (421 tests Vitest,
  6 tests d’archive, types et formatage), build et smoke réseau à deux joueurs.
- `npm run smoke:source -- --rebuild` : téléchargement anonyme local, 172 fichiers
  manifestés, empreintes et modes vérifiés, avis AGPL/Ubuntu/Vite identiques,
  `/healthz` cohérent ; extraction sans `.git`, installation indépendante et
  builds client workspace/serveur, puis archive reconstruite identique.
- Image `diep-fried-source:local` construite avec `--network=host` depuis le
  contexte sans `.git`, version de test `source-archive-local`, révision
  informative `2a7989a`. Serveur lancé en réseau host sur un port éphémère,
  smoke source HTTP et concordance health/manifeste réussis, puis arrêté.
  La voie bridge reste soumise à la limite réseau hôte décrite plus haut.
- Les fixtures des tests contiennent des fichiers `.env` sentinelles, clés,
  dépendances, sorties QA et références interdites : aucun n’est manifesté.
  Symlinks internes/externes/intermédiaires, FIFO et dépassements de taille,
  volume total et profondeur provoquent un échec explicite.

Ces contrôles portent sur le checkout local de ce lot ; après intégration des
branches voisines, reconstruire et revérifier l’archive finale. Aucun source
n’a été publié sur un dépôt distant et aucune image n’a été poussée.

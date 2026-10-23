# Validation de livraison

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

Dockerfile inchangé : Node 22 Alpine, utilisateur `node` (uid 1000), serveur et
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

Le build Vite produit neuf fichiers, dont **un seul HTML : `index.html`**.
`qa-showcase.html`, captures QA, scripts showroom et ressources `reference-only`
ne sont pas dans `apps/client/dist`. Les URL de fichiers QA et de référence
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
- **À corriger côté client avant distribution :** le JS commence par le polyfill
  `modulepreload` de Vite ; les avis émis n'incluent pas son avis MIT
  (texte disponible dans `node_modules/vite/LICENSE.md`). Ajouter l'attribution
  pertinente aux avis distribués, ou revoir l'inclusion de ce helper.
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

**Point bloquant avant une mise en service publique :** le lien « Code source »
du menu pointe vers `https://github.com/diep-fried/diep-fried.io`, tandis que le
remote de ce checkout est `https://github.com/BaptisteP31/diep-fried.io.git`.
Le lien n'est pas associé au commit exécuté, `/healthz` et `welcome` annoncent
`dev` sans configuration, et aucun endpoint HTTP d'archive source n'est défini.
L'accessibilité publique du source de cette version n'est pas établie.

Avant livraison, l'exploitant doit rendre disponible sans frais le source exact
de la version en service, y compris modifications locales, manifestes/lockfile,
scripts de build/installation, Dockerfile et ressources/avis nécessaires.
Un dépôt ou une archive durable associé au SHA convient comme support à vérifier ;
le lien visible doit mener à cette version et rester accessible aux utilisateurs.
Configurer le même SHA dans `DIEP_FRIED_VERSION`, conserver le digest de l'image
et vérifier le téléchargement depuis un utilisateur sans accès au dépôt privé.
Pour une interaction WS directe, documenter cette offre dans les instructions
d'accès au service : `welcome` ne contient actuellement qu'un identifiant de build,
pas d'URL source. Aucun changement du protocole n'est effectué ici.

Ces constats sont transmis au propriétaire client/serveur, sans modifier son
runtime. Aucun crash, blocage de snapshots ou état numérique invalide n'a été
observé dans les scénarios exécutés. Les objectifs et boss non encore intégrés
doivent faire l'objet d'une nouvelle exécution et de validations dédiées.

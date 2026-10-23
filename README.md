# diep-fried.io

Jeu de tanks multijoueur autonome et auto-hébergeable, inspiré du gameplay classique de Diep.io. Développement en cours : FFA/Sandbox, cinq premières classes et salons privés sont implémentés ; les classes avancées et les autres modes sont en construction.

## Démarrage

Node ≥ 22.12 et npm :

```sh
npm ci
npm run dev
```

Client sur `http://localhost:5173`. Pour construire et servir sur un seul port : `npm run build`, puis `npm start` (port 8080). Voir [l’auto-hébergement](docs/self-hosting.md).

## Licence

Le code original de ce projet est sous **AGPL-3.0-or-later** : GNU Affero General Public License version 3, ou toute version ultérieure. Texte intégral : [LICENSE](LICENSE).

Les ressources tierces conservent leurs licences et avis : Ubuntu sous UFL-1.0 ; drapeaux flag-icons sous MIT ; icône Font Awesome Free sous CC BY 4.0. Les références propriétaires de recherche ne font pas partie de la distribution.

Pour une instance modifiée accessible en réseau, proposer aux utilisateurs l’accès au code source correspondant conformément à la licence. La publication du code et le lien vers la révision déployée font partie de la préparation d’une diffusion publique.

## Développement

[Architecture](docs/architecture.md), [jalons](docs/DEVELOPMENT.md), [spécification](docs/specification/scope.md), [vérification initiale](docs/qa-first-playable.md).

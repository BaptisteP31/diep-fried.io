# Manifeste des Assets de Référence Diep.io

Date de collecte : 2026-10-23T14:53:37.100Z
Total testé : 37 | Réussis : 34 | Rejetés/Échoués : 3

> [!IMPORTANT]
> **Distinction légale essentielle** :
> - Les fichiers sous `reference-only/` (logo, favicons, icônes Font Awesome Pro commerciales) sont collectés exclusivement à des fins d'analyse, d'étalonnage et d'étude de compatibilité. **Ils ne sont pas open source et ne peuvent pas être redistribués** dans le jeu final.
> - Les fichiers sous `distributable/` disposent d'une licence libre vérifiée (MIT pour les drapeaux `flag-icons`, CC BY 4.0 pour l'icône `Font Awesome Free`).
> - Les entités de gameplay (tanks, canons, barils, drones, formes géométriques, balles, barres de vie) **n'ont besoin d'aucun asset graphique** : elles sont rendues par code vectoriel (primitives Canvas 2D / WebGL).

## 1. Synthèse par Catégorie et Licence

| Catégorie | Répertoire relatif | Licence | Statut de redistribution | Fichiers collectés |
| :--- | :--- | :--- | :--- | :---: |
| Images Diep.io | `reference-only/images/` | Propriétaire / Inconnue (Diep.io) | **Usage de référence uniquement** | 4 |
| Favicons Diep.io | `reference-only/favicons/` | Propriétaire / Inconnue (Diep.io) | **Usage de référence uniquement** | 4 |
| Icônes UI Font Awesome Pro | `reference-only/icons-fa-pro/` | Commerciale (Fonticons, Inc.) | **Usage de référence uniquement** | 22 |
| Icône Font Awesome Free | `distributable/icons-fa-free/` | CC BY 4.0 (Fonticons, Inc.) | Redistribuable (attribution requise) | 1 |
| Drapeaux région | `distributable/flags/` | MIT (Lipis / flag-icons) | Redistribuable | 3 |
| Sondes de test / rejets | *N/A (rejetés)* | N/A | Non applicable (rejetés) | 0 (3 rejetés) |

## 2. Inventaire Détaillé des Fichiers

| Nom du fichier | Type MIME | Taille (octets) | SHA-256 (premiers 12 car.) | Licence | Statut | Emplacement relatif |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| `logo.png` | `image/png` | 48378 | `bc7773494d0e…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/images/logo.png` |
| `title.png` | `image/png` | 305041 | `e05ad04b472e…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/images/title.png` |
| `DiepDiscord.png` | `image/png` | 156535 | `b76c02b56686…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/images/DiepDiscord.png` |
| `new-blinker.png` | `image/png` | 7037 | `828ebdf7b026…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/images/new-blinker.png` |
| `favicon-16x16.png` | `image/png` | 741 | `061ddcbc8b18…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/favicons/favicon-16x16.png` |
| `favicon-32x32.png` | `image/png` | 1353 | `f81b820898bc…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/favicons/favicon-32x32.png` |
| `favicon-96x96.png` | `image/png` | 2560 | `4a7147eb85a7…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/favicons/favicon-96x96.png` |
| `favicon.png` | `image/png` | 25689 | `85321dd9776c…` | Propriétaire / Inconnue (Diep.io) | ✅ Succès | `docs/research/asset-collection/reference-only/favicons/favicon.png` |
| `arrow-up-right-from-square.svg` | `image/svg+xml` | 892 | `cd233f81df33…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/arrow-up-right-from-square.svg` |
| `camera-movie.svg` | `image/svg+xml` | 835 | `6a512a092cb5…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/camera-movie.svg` |
| `chevron-down.svg` | `image/svg+xml` | 457 | `aa49dd7fb92d…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/chevron-down.svg` |
| `chevron-left.svg` | `image/svg+xml` | 466 | `38f6402d76bc…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/chevron-left.svg` |
| `chevron-up.svg` | `image/svg+xml` | 467 | `e18e02ec2d10…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/chevron-up.svg` |
| `circle-question.svg` | `image/svg+xml` | 681 | `202e77841bb9…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/circle-question.svg` |
| `clock.svg` | `image/svg+xml` | 559 | `7f5c376c9713…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/clock.svg` |
| `crown.svg` | `image/svg+xml` | 823 | `118a981afac3…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/crown.svg` |
| `film.svg` | `image/svg+xml` | 1311 | `db5ca111b42b…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/film.svg` |
| `game-board-simple.svg` | `image/svg+xml` | 406 | `7e262528d5b4…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/game-board-simple.svg` |
| `gavel.svg` | `image/svg+xml` | 1208 | `fe960b77e91b…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/gavel.svg` |
| `gear.svg` | `image/svg+xml` | 1687 | `0b7ee7a3e44e…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/gear.svg` |
| `keyboard.svg` | `image/svg+xml` | 2115 | `a59a27ce54ca…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/keyboard.svg` |
| `link-simple.svg` | `image/svg+xml` | 850 | `b30547b93361…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/link-simple.svg` |
| `list-tree.svg` | `image/svg+xml` | 1069 | `a1b72e2969f0…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/list-tree.svg` |
| `lock.svg` | `image/svg+xml` | 510 | `454fa28a88ee…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/lock.svg` |
| `palette.svg` | `image/svg+xml` | 1146 | `902e936a1980…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/palette.svg` |
| `right-to-bracket.svg` | `image/svg+xml` | 726 | `7e70de6f4f8b…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/right-to-bracket.svg` |
| `shirt.svg` | `image/svg+xml` | 780 | `3ec197f9d8e4…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/shirt.svg` |
| `store.svg` | `image/svg+xml` | 995 | `b6e91113cbbf…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/store.svg` |
| `users.svg` | `image/svg+xml` | 1051 | `6b484b4a71dd…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/users.svg` |
| `xmark.svg` | `image/svg+xml` | 618 | `d007a16fea41…` | Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.) | ✅ Succès | `docs/research/asset-collection/reference-only/icons-fa-pro/xmark.svg` |
| `circle-up-regular.svg` | `image/svg+xml` | 570 | `5d890adfd47a…` | CC BY 4.0 (Font Awesome Free 6.7.2) | ✅ Succès | `docs/research/asset-collection/distributable/icons-fa-free/circle-up-regular.svg` |
| `de.svg` | `image/svg+xml` | 230 | `3642228e33ab…` | MIT (flag-icons / Lipis) | ✅ Succès | `docs/research/asset-collection/distributable/flags/de.svg` |
| `gb.svg` | `image/svg+xml` | 538 | `4b739ae884c7…` | MIT (flag-icons / Lipis) | ✅ Succès | `docs/research/asset-collection/distributable/flags/gb.svg` |
| `us.svg` | `image/svg+xml` | 3918 | `59accbacfb36…` | MIT (flag-icons / Lipis) | ✅ Succès | `docs/research/asset-collection/distributable/flags/us.svg` |
| `favicon.ico` | `-` | 16242 | `-` | N/A | ❌ rejected_invalid_format | *(non sauvegardé)* |
| `apple-touch-icon.png` | `-` | 16242 | `-` | N/A | ❌ rejected_invalid_format | *(non sauvegardé)* |
| `shoot.mp3` | `-` | 16242 | `-` | N/A | ❌ rejected_invalid_format | *(non sauvegardé)* |

## 3. Analyse des Erreurs et Rejets Volontaires

Les sondes suivantes ont été exécutées pour tester et prouver la détection stricte des faux positifs :

- **https://diep.io/favicon.ico** : Rejeté (`rejected_invalid_format`). Raison : *Réponse HTML de type SPA catch-all reçue au lieu du format attendu*.
- **https://diep.io/apple-touch-icon.png** : Rejeté (`rejected_invalid_format`). Raison : *Réponse HTML de type SPA catch-all reçue au lieu du format attendu*.
- **https://diep.io/assets/audio/shoot.mp3** : Rejeté (`rejected_invalid_format`). Raison : *Réponse HTML de type SPA catch-all reçue au lieu du format attendu*.

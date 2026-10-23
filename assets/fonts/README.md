# Polices typographiques pour diep-fried.io

Ce répertoire contient les fichiers de polices nécessaires au rendu du jeu et de son interface (HUD, leaderboard, noms des joueurs, statistiques).

## 1. Famille de polices : Ubuntu

- **Famille** : Ubuntu (Bold & Regular)
- **Créateur / Fonderie** : Dalton Maag pour Canonical Ltd.
- **Copyright** : Copyright 2011 Canonical Ltd.
- **Licence** : **Ubuntu Font Licence v1.0 (UFL-1.0)** — voir [UFL.txt](UFL.txt)
- **Droit de redistribution** : **Autorisé et vérifié**. La licence UFL-1.0 permet l'utilisation, l'étude, la modification, l'incorporation (embedding) et la redistribution gratuite (groupée ou autonome) à condition de conserver la mention de copyright et la licence, et de ne pas vendre les fichiers de police seuls.
- **Provenance officielle** : Dépôt officiel Google Fonts upstream (`google/fonts/ufl/ubuntu`) et Canonical Launchpad (`ubuntu-font-family`).

## 2. Rôle dans diep.io et diep-fried.io

Sur `diep.io`, l'intégralité du rendu textuel (noms de joueurs, scores, notifications, statistiques d'amélioration, arbre d'évolution et classement) utilise la police `Ubuntu` avec une graisse grasse (`weight: 700`, soit **Ubuntu Bold**).
Un contour sombre caractéristique (`--diep-text-stroke: 0.18em`, couleur `#393939` / `rgb(57, 57, 57)`) est appliqué sur tous les textes de jeu pour garantir leur lisibilité sur les fonds colorés de l'arène.

## 3. Fichiers et empreintes cryptographiques (SHA-256)

| Fichier | Format | Taille | Empreinte SHA-256 | Source officielle |
| :--- | :--- | :--- | :--- | :--- |
| `Ubuntu-Bold.ttf` | TrueType | 331 612 octets | `679b5c1e09cab3156bb8ef529735f9382bf31ca7ac737382ab959297f8d82ad4` | [Google Fonts upstream](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Bold.ttf) |
| `Ubuntu-Regular.ttf` | TrueType | 351 884 octets | `3128df86a31805618436d0ae5651ba4285d0c9de0a39057d025f64ee33bceb64` | [Google Fonts upstream](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Regular.ttf) |
| `UFL.txt` | Texte brut | 4 673 octets | `2f0015108d68627bd788d313f529c21ff4da2c2c42a5e1f3883acc83480f9002` | [Google Fonts upstream](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/UFL.txt) |

## 4. Intégration web recommandée

```css
@font-face {
  font-family: 'Ubuntu';
  font-style: normal;
  font-weight: 700;
  src: url('/assets/fonts/Ubuntu-Bold.ttf') format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'Ubuntu';
  font-style: normal;
  font-weight: 400;
  src: url('/assets/fonts/Ubuntu-Regular.ttf') format('truetype');
  font-display: swap;
}
```

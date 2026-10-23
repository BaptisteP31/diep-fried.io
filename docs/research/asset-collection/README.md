# Collecte et Analyse des Assets de Référence Diep.io

Ce dossier regroupe la collecte reproductible, l'inventaire légal et l'analyse technique des assets issus de [diep.io](https://diep.io/) pour le projet **diep-fried.io** (remake open source et auto-hébergeable entre amis).

> [!IMPORTANT]
> **Règle légale fondamentale — Référence vs Redistribution :**
> - Les fichiers stockés sous [`reference-only/`](file:///home/baptiste/Documents/GitHub/diep-fried.io/docs/research/asset-collection/reference-only/) sont réservés **strictement à l'étude comparative locale et au calibrage**. Ils ne sont **pas open source** et ne doivent **en aucun cas être redistribués ni commités comme ressources de production** dans le jeu final.
> - Les fichiers sous [`distributable/`](file:///home/baptiste/Documents/GitHub/diep-fried.io/docs/research/asset-collection/distributable/) bénéficient d'une licence libre vérifiée dans leur code source (MIT ou CC BY 4.0).
> - Les bundles JavaScript (`index-*.js`) et WebAssembly (`diep.wasm`) de Diep.io **ne sont ni copiés ni utilisés comme code source** du futur jeu.

---

## 1. Pourquoi aucun asset original de gameplay n'est nécessaire

Pour recréer le gameplay classique, les éléments suivants peuvent être dessinés par code. Cela ne démontre pas que tous les visuels du client actuel, notamment les skins, sont procéduraux :
- **Tanks & Canons** : corps circulaires (`arc`), barils rectangulaires ou trapézoïdaux (`rect` / polygones), animations de recul par décalage d'offset.
- **Formes neutres (polygones)** : carrés (jaunes), triangles (rouges), pentagones et Alpha Pentagons (bleus), Crashers (roses) dessinés via des polygones réguliers à contours foncés (`#555555`).
- **Projectiles & Drones** : cercles pleins ou triangles guidés.
- **Pièges (Traps)** : polygones à pointes.
- **Barres de vie & HUD** : rectangles arrondis superposés (vert/rouge ou cyan/gris).
- **Arène** : grille répétitive (`strokeRect`) et fonds de bases colorés semi-transparents.

> [!TIP]
> **Conclusion technique :** Le remake diep-fried.io n'a besoin d'**aucune texture raster ni sprite sheet** pour le moteur de jeu. L'ensemble doit être implémenté via des fonctions de dessin procédurales Canvas 2D / WebGL paramétrées par code.

---

## 2. Structure des Répertoires

```
docs/research/asset-collection/
├── README.md                     # Ce document de cadrage
├── manifest.json                 # Manifeste machine complet (URL, date, sha256, taille, licence)
├── manifest.md                   # Tableau récapitulatif lisible
├── reference-only/               # STRICTEMENT RÉSERVÉ À LA CONSULTATION INTERNE
│   ├── images/                   # Logos et visuels propriétaires Diep.io (4 fichiers PNG)
│   ├── favicons/                 # Favicons officiels Diep.io (4 fichiers PNG)
│   └── icons-fa-pro/             # 22 icônes SVG Font Awesome Pro 6.1.1 (Licence Commerciale payante)
└── distributable/                # LICENCES LIBRES VÉRIFIÉES
    ├── flags/                    # 3 drapeaux SVG issus de flag-icons (Licence MIT)
    └── icons-fa-free/            # 1 icône SVG issue de Font Awesome Free (Licence CC BY 4.0)
```

---

## 3. Analyse de Provenance et Licences

### 3.1. Visuels Diep.io (`reference-only/images/` et `reference-only/favicons/`)
- **Fichiers** : `logo.png`, `title.png`, `DiepDiscord.png`, `new-blinker.png`, `favicon-16x16.png`, `favicon-32x32.png`, `favicon-96x96.png`, `favicon.png`.
- **Origine** : Propriété exclusive des éditeurs de Diep.io (Addicting Games / Rivet).
- **Licence** : Inconnue / Propriétaire.
- **Statut** : **Reference only**. Remplacement impératif par un logo et une identité graphique originaux pour *diep-fried.io*.

### 3.2. Icônes d'interface `/assets/fa/*.svg`
L'inspection du code source des fichiers SVG révèle explicitement deux catégories :
1. **22 icônes Font Awesome Pro 6.1.1** (`reference-only/icons-fa-pro/`) :
   - Mention d'en-tête : `<!--! Font Awesome Pro 6.1.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. -->`
   - **Statut** : Licence commerciale propriétaire acquise par Diep.io. **Non redistribuable**.
2. **1 icône Font Awesome Free 6.7.2** (`distributable/icons-fa-free/circle-up-regular.svg`) :
   - Mention d'en-tête : `<!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. -->`
   - **Statut** : Licence libre CC BY 4.0 (redistribuable avec attribution).

### 3.3. Drapeaux de sélection de région (`distributable/flags/`)
- **Fichiers** : `de.svg`, `gb.svg`, `us.svg`.
- **Origine** : Bibliothèque open source [`flag-icons`](https://github.com/lipis/flag-icons) (identifiants d'éléments `id="flag-icons-de"`, etc.).
- **Licence** : **MIT License**.
- **Statut** : Libre de redistribution.

---

## 4. Rejet des Faux Positifs (Comportement SPA Catch-all)

Le serveur de Diep.io est configuré comme une Single Page Application (SPA) avec Cloudflare :
- Toute requête vers un fichier inexistant (comme `/favicon.ico`, `/apple-touch-icon.png` ou des fichiers audio `/assets/audio/shoot.mp3`) renvoie un code HTTP **200 OK** contenant le document HTML de l'application (`<!doctype html>...`).
- Le collecteur [`scripts/collect-reference-assets.mjs`](file:///home/baptiste/Documents/GitHub/diep-fried.io/scripts/collect-reference-assets.mjs) intègre un validateur de format strict :
  - Rejet immédiat de tout contenu débutant par `<!doctype html` ou `<html`.
  - Contrôle des 8 octets magiques PNG (`89 50 4E 47 0D 0A 1A 0A`).
  - Contrôle de la présence des balises vectorielles `<svg` et `</svg>`.
- Les 3 sondes de test exécutées ont été correctement identifiées et rejetées sans polluer les dossiers d'assets.

---

## 5. Synthèse des Résultats de Collecte

| Statut | Quantité | Description |
| :--- | :---: | :--- |
| **Total testé** | **37** | Ensemble des candidats de l'allowlist et des sondes de contrôle |
| **Succès validés** | **34** | Assets réels téléchargés, vérifiés et hachés |
| ↳ *Reference-only* | 30 | 8 images/favicons Diep.io + 22 icônes Font Awesome Pro |
| ↳ *Distributable* | 4 | 3 drapeaux MIT + 1 icône CC BY 4.0 |
| **Rejetés / Échecs** | **3** | Faux positifs SPA HTML éliminés (`favicon.ico`, `apple-touch-icon.png`, `shoot.mp3`) |

Consulter le fichier [`manifest.md`](file:///home/baptiste/Documents/GitHub/diep-fried.io/docs/research/asset-collection/manifest.md) pour les hash SHA-256 et tailles individuels.

---

## 6. Utilisation du Collecteur

Le script est autonome et reproductible en Node.js (sans dépendance externe) :

```bash
# Exécution complète de la collecte et génération des manifestes
rtk node scripts/collect-reference-assets.mjs

# Mode simulation sans écriture sur le disque
rtk node scripts/collect-reference-assets.mjs --dry-run
```

---

## 7. Recommandations et Prochaines Étapes pour le Remake

1. **Rendu de jeu 100% procédural** :
   Développer le module de dessin 2D Canvas basé sur des fonctions géométriques (`drawTank(x, y, angle, barrels, color)`, `drawShape(sides, radius, color)`).
2. **Pack d'icônes UI libres** :
   Pour remplacer les icônes commerciales Font Awesome Pro de l'interface, adopter une bibliothèque intégralement libre et moderne :
   - [Lucide Icons](https://lucide.dev/) (Licence ISC / MIT).
   - [Tabler Icons](https://tabler-icons.io/) (Licence MIT).
   - [Font Awesome Free](https://fontawesome.com/) (Licence CC BY 4.0).
3. **Identité et Logo** :
   Créer une identité visuelle propre pour **diep-fried.io** (logo humoristique / friteuse / arcade) pour ne pas utiliser la marque Diep.io.
4. **Effets sonores (Audio)** :
   Aucun son n'étant présent dans les assets web de Diep.io, concevoir des effets sonores synthétiques rétro (par exemple via jsfxr ou audio Web Audio API) pour le tir, l'impact et la destruction.

## Vérification par l’agent principal

Les 34 fichiers annoncés ont été retrouvés sur disque ; leurs tailles et empreintes SHA-256 correspondent au manifeste. La syntaxe du collecteur a été vérifiée avec `node --check`. Les textes de licence des projets amont ont été ajoutés sous `distributable/licenses/` ; voir [les attributions](distributable/ATTRIBUTION.md).

Les statuts de licence décrivent la provenance identifiée ; l’en-tête Pro ne prouve pas les droits détenus par l’exploitant du site. Les fichiers propriétaires ou de licence inconnue restent des références locales, sans autorisation de redistribution établie. Le rejet de trois URL candidates ne prouve ni l’absence générale d’audio, ni un comportement identique pour toutes les URL inexistantes. La valeur de contour `#555555` ci-dessus reste à mesurer dans une session de gameplay.

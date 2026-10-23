# Spécification Technique du Rendu Graphique — diep-fried.io

*Date de recherche : 23 octobre 2026*  
*Auteur : Sous-agent de recherche technique — Rendu & Assets*  
*Périmètre : Rendu procédural 2D, typographie, tokens visuels, audio et conformité des licences.*

---

## 1. Synthèse exécutive et principes d'architecture

Le jeu **Diep.io** repose sur une esthétique minimaliste vectorielle « flat design » caractérisée par des formes géométriques nettes, des couleurs franches et des contours sombres marqués. Contrairement à de nombreux jeux 2D reposant sur des planches de sprites (sprite sheets) ou des textures matricielles, **Diep.io ne charge aucun sprite PNG/JPEG pour le gameplay**.

### Constats majeurs issus de l'analyse client :
1. **Rendu 100 % procédural** : Tous les éléments du jeu (tanks, canons, balles, drones, pièges, formes polygonales de nourriture, barres de statut) sont dessinés par le moteur via des primitives géométriques vectorielles sur un élément HTML5 `<canvas id="canvas">` configuré en contexte **2D** (`CanvasRenderingContext2D`).
2. **Audio non identifié** : aucune ressource audio n’a été identifiée pendant la collecte. Cela ne démontre pas une absence dans tous les modes ou versions.
3. **Typographie unifiée** : Toute l'interface et les indications en jeu (pseudos, scores, améliorations, classement) emploient la police **Ubuntu** en graisse grasse (**Bold 700**), rehaussée d'un contour sombre distinctif (`#393939`).
4. **Skins de boutique propriétaires** : La boutique du jeu sert des motifs vectoriels SVG via son API privée (`api.diep.io/store/skins/art`). Ces motifs sont la propriété exclusive de l'éditeur de Diep.io et ne disposent d'aucune licence ouverte : **ils ne doivent en aucun cas être redistribués ni copiés dans le code source de diep-fried.io**.
5. **Autonomie totale du remake** : Pour `diep-fried.io`, il n'est nécessaire d'embarquer comme fichier statique distribuable que la police libre **Ubuntu** sous licence **UFL-1.0**. Tous les graphismes du jeu sont générés par code TypeScript pur via l'API Canvas 2D.

---

## 2. Tokens visuels et palette de couleurs mesurés

L'inspection de la feuille de style officielle du client (`https://diep.io/assets/index-60017d06.css`) et de ses propriétés calculées sur le document a permis d'extraire la palette authentique exacte des variables CSS `--theme-color-*` et `--netcolor*`.

### 2.1 Distinction méthodologique
- **Valeurs mesurées** : Couleurs hexadécimales / RGB, opacités et formules de contour extraites directement du client officiel Diep.io.
- **Hypothèses documentées** : Épaisseurs relatives de traits, dimensions en unités d'arène et formules d'amortissement de recul, issues de l'ingénierie inverse visuelle et de la documentation communautaire.

### 2.2 Table complète des couleurs mesurées

| Rôle visuel | Variable CSS officielle | Valeur RGB mesurée | Valeur Hex | Statut |
| :--- | :--- | :--- | :--- | :--- |
| **Arène — Fond** | `--theme-color-backgroundColor` | `rgb(204, 204, 204)` | `#cccccc` | Mesuré |
| **Arène — Grille** | `--theme-color-gridColor` | `rgb(0, 0, 0)` (opacité 0.1) | `#000000` | Mesuré |
| **Arène — Bordure** | `--theme-color-worldBorderColor` | `rgb(0, 0, 0)` (opacité 0.1) | `#000000` | Mesuré |
| **Arène — Murs Maze** | `--theme-color-mazeWallColor` | `rgb(187, 187, 187)` | `#bbbbbb` | Mesuré |
| **Contours standards** | `--border-color` | `rgba(0, 0, 0, 0.25)` | `#00000040`| Mesuré |
| **Contours anciens / HUD** | `--theme-color-oldOutlineColor` | `rgb(85, 85, 85)` | `#555555` | Mesuré |
| **Équipe Bleue / Joueur FFA** | `--theme-color-blueTeamColor` | `rgb(0, 178, 225)` | `#00b2e1` | Mesuré |
| **Équipe Rouge / Ennemi FFA** | `--theme-color-redTeamColor` | `rgb(241, 78, 84)` | `#f14e54` | Mesuré |
| **Équipe Violette** | `--theme-color-purpleTeamColor` | `rgb(191, 127, 245)` | `#bf7ff5` | Mesuré |
| **Équipe Verte** | `--theme-color-greenTeamColor` | `rgb(0, 225, 110)` | `#00e16e` | Mesuré |
| **Canons / Barils** | `--theme-color-cannonColor` | `rgb(153, 153, 153)` | `#999999` | Mesuré |
| **Contour des canons** | `--net-border` | `rgb(85, 85, 85)` | `#555555` | Mesuré |
| **Forme — Carré** | `--theme-color-squareColor` | `rgb(255, 232, 105)` | `#ffe869` | Mesuré |
| **Forme — Triangle** | `--theme-color-triangleColor` | `rgb(252, 118, 119)` | `#fc7677` | Mesuré |
| **Forme — Pentagone** | `--theme-color-pentagonColor` | `rgb(118, 141, 252)` | `#768dfc` | Mesuré |
| **Forme — Crasher rose** | `--theme-color-crasherColor` | `rgb(241, 119, 221)` | `#f177dd` | Mesuré |
| **Forme — Shiny verte** | `--theme-color-shinyShapeColor` | `rgb(138, 255, 105)` | `#8aff69` | Mesuré |
| **Drone Necromancer** | `--theme-color-necroDroneColor` | `rgb(252, 195, 118)` | `#fcc376` | Mesuré |
| **Boss déchu (Fallen)** | `--theme-color-fallenBossColor` | `rgb(192, 192, 192)` | `#c0c0c0` | Mesuré |
| **Arena Closer** | `--theme-color-arenaCloserColor` | `rgb(255, 232, 105)` | `#ffe869` | Mesuré |
| **Corps Smasher** | `--theme-color-smasherColor` | `rgb(85, 85, 85)` | `#555555` | Mesuré |
| **Vie — Fond de barre** | `--theme-color-healthBarBackground` | `rgb(85, 85, 85)` | `#555555` | Mesuré |
| **Vie — Remplissage** | `--theme-color-healthBarFill` | `rgb(133, 227, 125)` | `#85e37d` | Mesuré |
| **Score — Remplissage** | `--theme-color-scoreBarFillColor` | `rgb(67, 255, 145)` | `#43ff91` | Mesuré |
| **XP — Remplissage** | `--theme-color-xpBarFillColor` | `rgb(255, 222, 67)` | `#ffde43` | Mesuré |
| **Minimap — Fond** | `--theme-color-minimapBackgroundColor` | `rgb(205, 205, 205)` | `#cdcdcd` | Mesuré |
| **Minimap — Bordure** | `--theme-color-minimapBorderColor` | `rgb(121, 121, 121)` | `#797979` | Mesuré |
| **Minimap — Flèche joueur**| `--theme-color-minimapArrowColor` | `rgb(0, 0, 0)` | `#000000` | Mesuré |
| **Texte — Contour** | `--diep-text-stroke-color` | `rgb(57, 57, 57)` | `#393939` | Mesuré |

---

## 3. Modélisation mathématique des primitives procédurales

Toutes les entités du jeu se construisent à partir de primitives Canvas 2D élémentaires. Voici les règles de dessin standardisées pour le moteur client de `diep-fried.io`.

### 3.1 Propriétés de tracé communes
```typescript
ctx.lineJoin = 'round';
ctx.lineCap = 'round';
```
La jointure arrondie (`round`) est cruciale : elle confère aux polygones et aux canons l'arrondi subtil caractéristique de Diep.io aux coins, évitant les pointes acérées des jointures en biseau (`miter`).

### 3.2 Corps de tank (Circle Primitive)
Le corps principal du tank est un disque plein entouré d'un contour sombre :
```typescript
function drawTankBody(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fillColor: string, strokeColor = 'rgba(0,0,0,0.25)', lineWidth = 4) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();
}
```

### 3.3 Canons et barils (Barrels)
Les canons sont orientés à un angle $\theta$ par rapport à l'axe de visée et dessinés **sous** le corps du tank.
- **Canons rectangulaires standards** (Tank, Twin, Sniper, Flank Guard) :
  Un rectangle tracé depuis l'origine locale `(0, offset_y)` vers `(length, offset_y)`.
- **Canons trapézoïdaux évasés** (Machine Gun, Destroyer, Annihilator) :
  Largeur à la base $W_{base} < W_{tip}$ en bout de bouche.
- **Canons trapézoïdaux rétrécis** (Hunter, Predator) :
  $W_{base} > W_{tip}$.
- **Recul élastique** :
  Lors d'un tir au temps $t_0$, le canon se rétracte instantanément d'une distance $\Delta L$ (généralement 15 % à 25 % de sa longueur), puis reprend sa longueur nominale selon une courbe d'amortissement :
  $$L(t) = L_{nominal} - \Delta L \cdot e^{-\lambda (t - t_0)}$$

### 3.4 Formes polygonales régulières (Shapes)
Pour tout polygone régulier à $N$ sommets (carré $N=4$, triangle $N=3$, pentagone $N=5$), les coordonnées polaires des sommets sont données par :
$$x_k = x_c + R \cdot \cos\left(\alpha + \frac{2\pi k}{N}\right)$$
$$y_k = y_c + R \cdot \sin\left(\alpha + \frac{2\pi k}{N}\right)$$
avec :
- $R$ : rayon du cercle circonscrit (estimé : Carré $R \approx 18\text{ px}$, Triangle $R \approx 20\text{ px}$, Pentagone $R \approx 32\text{ px}$, Alpha Pentagone $R \approx 105\text{ px}$).
- $\alpha(t) = \alpha_0 + \omega \cdot t$ : angle de rotation lente et continue dans l'arène.
- Contour tracé avec `ctx.lineWidth = R * 0.1` et `strokeStyle = 'rgba(0,0,0,0.25)'` ou `#555555`.

### 3.5 Balles et projectiles (Bullets)
Les balles classiques sont des disques de couleur identique au tank émetteur, avec un contour sombre `rgba(0,0,0,0.25)`.
Les pièges (Trappers) sont des triangles ou pointes barbelées procédurales.
Les drones (Overseer, Overlord) sont des triangles orientés vers leur cible avec un ratio hauteur/largeur spécifique.

---

## 4. Typographie et rendu des textes

### 4.1 Police officielle : Ubuntu Bold
- La police exclusive du jeu est **Ubuntu** en graisse 700 (**Bold**).
- Fichier source récupéré et vérifié : `assets/fonts/Ubuntu-Bold.ttf`.
- Licence officielle : **Ubuntu Font Licence v1.0 (UFL-1.0)**.
- **Conditions de redistribution** : La licence UFL autorise explicitement l'incorporation, la distribution et l'utilisation libre dans un logiciel open source (voir [assets/fonts/README.md](file:///home/baptiste/Documents/GitHub/diep-fried.io/assets/fonts/README.md)).

### 4.2 Algorithme de contour de texte Diep.io
Dans Diep.io, le texte n'a pas un contour flou mais un contour franc et épais :
- Épaisseur : `0.18em` (token CSS `--diep-text-stroke: .18em`).
- Couleur : `#393939` (token CSS `--diep-text-stroke-color: #393939`).

Sur Canvas 2D, deux méthodes permettent une restitution fidèle :
1. **Méthode native Canvas 2D** (`ctx.strokeText` puis `ctx.fillText`) :
   ```typescript
   ctx.font = 'bold 18px Ubuntu, sans-serif';
   ctx.textAlign = 'center';
   ctx.textBaseline = 'middle';
   ctx.lineJoin = 'round';
   ctx.lineWidth = 18 * 0.36; // 0.18em de chaque côté -> 2 * 0.18 = 0.36
   ctx.strokeStyle = '#393939';
   ctx.strokeText(text, x, y);
   ctx.fillStyle = '#ffffff';
   ctx.fillText(text, x, y);
   ```
2. **Méthode CSS pour l'UI DOM** :
   Le CSS de Diep.io utilise une formule `text-shadow` multi-échantillons (16 angles à `cos(θ)` et `sin(θ)`) pour simuler un stroke parfait sur tous les moteurs de rendu :
   ```css
   text-shadow: 
     calc(0.18em * 1) 0 0 #393939,
     calc(0.18em * 0.9239) calc(0.18em * 0.3827) 0 #393939,
     calc(0.18em * 0.7071) calc(0.18em * 0.7071) 0 #393939,
     /* ... 16 directions circulaires complètes ... */
   ```

---

## 5. Audit audio : vérification factuelle

### 5.1 Observations et limites
Aucun fichier audio n’a été identifié dans les ressources observées. Cette inspection limitée ne prouve pas l’absence de chargement différé ou de génération audio et ne constitue pas un audit exhaustif du client compilé.

### 5.2 Décision pour le remake diep-fried.io
- **Mode par défaut** : Jeu silencieux, fidèle à l'expérience originale.
- **Extension facultative** : Si les joueurs désirent des retours sonores (impacts, tirs, montées de niveau), ceux-ci devront être générés par synthèse sonore procédurale temps réel (`AudioContext` avec oscillateurs synthétiques `sawtooth` / `sine` et enveloppes de gain ADSR) sans recourir à des fichiers audio externes propriétaires.

---

## 6. Audit des skins et propriété intellectuelle

### 6.1 Observation des skins du store
L'appel au point d'entrée `https://api.diep.io/store/skins/art` renvoie un catalogue JSON de skins propriétaires (ex: `skin_arrows`, `skin_bee`, `skin_plated`, `skin_crest`). Ces skins sont définis par des balises vectorielles SVG contenant des chemins pour le corps (`<g id="body">`) et les canons (`<g id="barrel">`).

### 6.2 Traitement juridique et limites strictes
- **Absence de licence ouverte** : Ces créations artistiques sont la propriété intellectuelle exclusive de l'opérateur du jeu officiel. Elles ne sont assorties d'aucune licence open source ou de libre réutilisation.
- **Interdiction de redistribution** : **Ces assets ne doivent pas être copiés, stockés ou distribués dans le dépôt de diep-fried.io**.
- **Alternative propre pour diep-fried.io** : L'architecture de `diep-fried.io` supportera une API de skins ouverte permettant aux utilisateurs de charger des motifs SVG libres de droits ou générés par code (motifs géométriques abstraits, camouflage procédural, etc.).

---

## 7. Pipeline de rendu Canvas 2D & Z-Ordering

Pour éviter les chevauchements anormaux (par exemple des canons passant au-dessus du corps de tank ou des barres de vie masquées par les balles), le moteur Canvas 2D doit respecter rigoureusement l'ordre d'affichage suivant :

```
[Arrière-plan Z:0]    Fond d'arène uniforme (#cccccc)
[Grille Z:10]         Lignes de grille (espacement 25px, noir 10% opacité)
[Zones Z:20]          Zones de spawn d'équipe (bleu/rouge/violet/vert avec opacité 0.1)
[Bordures Z:30]       Bords de l'arène (lignes noires 10% opacité)
[Murs Z:40]           Murs du labyrinthe Maze (#bbbbbb avec contours 25% noir)
[Formes Z:50]         Carrés, triangles, pentagones, crashers
[Pièges Z:60]         Pièges au sol et mines
[Drones Z:65]         Drones (Overseer, Battleship, Necromancer)
[Projectiles Z:70]    Balles des tanks
[Canons Z:80]         Barils des tanks (dessinés sous le corps circulaire)
[Tanks Z:90]          Corps circulaires des tanks et tourelles supérieures
[Vie Z:100]           Barres de points de vie au-dessus des entités blessées
[Labels Z:110]        Pseudos et scores avec contour Ubuntu Bold
[HUD Z:200]           Interface fixe (Barre d'XP, Minimap, Leaderboard, Arbre d'évolution)
```

---

## 8. Fichiers produits et livrables associés

1. [`docs/research/rendering-assets/procedural-primitives.json`](file:///home/baptiste/Documents/GitHub/diep-fried.io/docs/research/rendering-assets/procedural-primitives.json) : Spécification JSON consommable par le moteur TypeScript.
2. [`assets/fonts/Ubuntu-Bold.ttf`](file:///home/baptiste/Documents/GitHub/diep-fried.io/assets/fonts/Ubuntu-Bold.ttf) : Police vectorielle officielle (Licence UFL-1.0 vérifiée).
3. [`assets/fonts/Ubuntu-Regular.ttf`](file:///home/baptiste/Documents/GitHub/diep-fried.io/assets/fonts/Ubuntu-Regular.ttf) : Police complémentaire pour l'interface (Licence UFL-1.0 vérifiée).
4. [`assets/fonts/UFL.txt`](file:///home/baptiste/Documents/GitHub/diep-fried.io/assets/fonts/UFL.txt) : Licence textuelle officielle Ubuntu Font Licence v1.0.
5. [`assets/fonts/README.md`](file:///home/baptiste/Documents/GitHub/diep-fried.io/assets/fonts/README.md) : Documentation de provenance et d'intégration CSS.
6. [`docs/research/rendering-assets/manifest.json`](file:///home/baptiste/Documents/GitHub/diep-fried.io/docs/research/rendering-assets/manifest.json) : Manifeste d'audit et de traçabilité complet.
7. [`docs/research/rendering-assets/manifest.md`](file:///home/baptiste/Documents/GitHub/diep-fried.io/docs/research/rendering-assets/manifest.md) : Version Markdown du manifeste.

## Vérification de livraison

L’agent principal a vérifié la présence, les tailles et SHA-256 des six livrables initiaux. Il a relevé indépendamment les variables CSS dans `verified-css-tokens.json` : ce relevé confirme les couleurs et opacités, pas les dimensions géométriques ni les paramètres du moteur. Les dimensions des classes, rayons, règles de recul et ordre des calques du JSON sont des propositions de prototype à calibrer. Les conclusions globales sur l’absence de sprites ou d’audio ne sont pas établies pour tous les modes et skins.

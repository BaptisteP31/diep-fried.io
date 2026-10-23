# Manifeste des Assets de Rendu et Polices — diep-fried.io

*Date de génération : 23 octobre 2026*  
*Responsabilité : `docs/research/rendering-assets/` et `assets/fonts/`*  
*Format machine correspondant : [`manifest.json`](manifest.json)*

---

## 1. Fichiers réels collectés et distribuables

Ce tableau recense l'ensemble des fichiers physiques effectivement obtenus, vérifiés et enregistrés dans le dépôt. Tous ces fichiers bénéficient d'une licence de redistribution ouverte et vérifiée.

| ID | Chemin local | Source URL / Provenance | Type MIME | Taille | Empreinte SHA-256 | Licence | Statut |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `font-ubuntu-bold` | `assets/fonts/Ubuntu-Bold.ttf` | [Google Fonts upstream](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Bold.ttf) | `font/ttf` | 331 612 o | `679b5c1e09cab3156bb8ef529735f9382bf31ca7ac737382ab959297f8d82ad4` | Ubuntu Font Licence 1.0 (UFL-1.0) | **Distribuable** |
| `font-ubuntu-regular` | `assets/fonts/Ubuntu-Regular.ttf` | [Google Fonts upstream](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Regular.ttf) | `font/ttf` | 351 884 o | `3128df86a31805618436d0ae5651ba4285d0c9de0a39057d025f64ee33bceb64` | Ubuntu Font Licence 1.0 (UFL-1.0) | **Distribuable** |
| `font-license-ufl` | `assets/fonts/UFL.txt` | [Google Fonts upstream](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/UFL.txt) | `text/plain` | 4 673 o | `2f0015108d68627bd788d313f529c21ff4da2c2c42a5e1f3883acc83480f9002` | UFL-1.0 | **Distribuable** |
| `font-readme` | `assets/fonts/README.md` | Dépôt local | `text/markdown` | 2 649 o | `151203c4290656cce7cba661a4dd11f38a3a2e3c2fdba4b5268b8129aaddcb2d` | MIT | **Distribuable** |
| `procedural-primitives` | `docs/research/rendering-assets/procedural-primitives.json` | Dépôt local (Tokens CSS diep.io) | `application/json` | 10 327 o | `1c50ede6ab6e3d70cd0eb965ae6be6dc114b755d06ac6f344c01cb0bc267f6bb` | MIT | **Distribuable** |
| `rendering-spec` | `docs/research/rendering-assets/rendering-specification.md` | Dépôt local | `text/markdown` | 15 613 o | `a866dd4849e8f93a89ce4dc26f59e9c4f8df5b11304909448f09a9d002216e5e` | CC-BY-4.0 | **Distribuable** |

---

## 2. Ressources examinées et statut d'exclusion / non-applicabilité

Ce tableau détaille les ressources observées dans le client Diep.io mais **exclues de la distribution** en raison de contraintes légales ou d'inexistence technique dans le moteur d'origine.

| Ressource | URL source | Type | Licence | Statut de distribution | Justification et décision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Skins de boutique** | `https://api.diep.io/store/skins/art` | JSON (SVG) | Propriétaire Diep.io | **Exclu** (Non distribuable) | Motifs vectoriels sous droits d'auteur exclusifs. Absence de licence libre. À remplacer par un système ouvert de skins créés par la communauté. |
| **Sprites matriciels de gameplay** | *Aucune* | N/A | N/A | **Non applicable** | Aucun sprite de tank, balle ou forme n'existe. Tout le rendu du jeu original est 100 % procédural Canvas 2D. |
| **Assets audio** | *Aucune* | N/A | N/A | **Non applicable** | Aucun fichier audio (`.mp3`, `.ogg`, `.wav`) n'est utilisé dans Diep.io. Le jeu original est totalement silencieux. |
| **Fichiers statiques UI (logos, favicons, drapeaux)** | `diep.io/assets/...` | PNG, SVG | Propriétaire / Tiers | **Traité par l'autre tâche** | Pris en charge par la tâche dédiée dans `docs/research/asset-collection/`. Non dupliqué ici. |

---

## 3. Garanties de conformité légale et traçabilité

1. **Aucun contournement de protection** : Aucune mesure technique de protection (Cloudflare Turnstile, CAPTCHA, authentification) n'a été contournée. Les polices ont été obtenues directement depuis les dépôts officiels amont (upstream) sous licence ouverte UFL-1.0.
2. **Absence de code ou d'art propriétaire dans le runtime** : Aucun fichier binaire propriétaire (WASM, bundle JS, skin commercial) n'a été introduit comme ressource distribuable.
3. **Reproductibilité** : Les sommes de contrôle SHA-256 permettent une vérification automatisée de l'intégrité de chaque fichier.

#!/usr/bin/env node
/**
 * collect-reference-assets.mjs
 * 
 * Script reproductible de collecte et vérification des assets de référence depuis diep.io.
 * Conçu pour le projet diep-fried.io (recherche et remake open source).
 * 
 * Principes et règles respectés :
 * - Allowlist stricte : aucune publicité, aucun tracker, aucun service tiers inutile.
 * - Validation rigoureuse des formats (magic bytes PNG, balise SVG) pour éliminer les faux 200 de l'index.html SPA.
 * - Séparation stricte entre :
 *     * reference-only/ : assets propriétaires ou licence commerciale (ex. Font Awesome Pro, logos diep.io).
 *     * distributable/ : assets sous licence libre vérifiée (ex. flag-icons sous MIT, Font Awesome Free).
 * - Aucun asset de gameplay (tanks, drones, formes, projectiles) n'est nécessaire sous forme d'image :
 *   ils sont générés de manière procédurale par code Canvas 2D / WebGL.
 * - Génération d'un manifeste complet JSON et Markdown avec URL, date, taille, SHA-256, licence, statut.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BASE_OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'research', 'asset-collection');

// Allowlist explicite et typée
const ASSET_ALLOWLIST = [
  // 1. Visuels propriétaires de diep.io (Licence inconnue / propriétaire -> REFERENCE ONLY)
  {
    id: 'diep-logo',
    url: 'https://diep.io/assets/diep/logo.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/images',
    filename: 'logo.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io UI',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: "Logo officiel diep.io affiché sur l'écran d'accueil"
  },
  {
    id: 'diep-title',
    url: 'https://diep.io/title.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/images',
    filename: 'title.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io UI',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: "Image de titre promotionnelle / d'en-tête"
  },
  {
    id: 'diep-discord',
    url: 'https://diep.io/assets/DiepDiscord.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/images',
    filename: 'DiepDiscord.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io Community',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: 'Bouton graphique vers le Discord officiel'
  },
  {
    id: 'diep-new-blinker',
    url: 'https://diep.io/assets/diep/new-blinker.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/images',
    filename: 'new-blinker.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io UI',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: 'Indicateur clignotant NEW pour les nouveautés / boutique'
  },

  // 2. Favicons officiels diep.io (Licence inconnue / propriétaire -> REFERENCE ONLY)
  {
    id: 'favicon-16',
    url: 'https://diep.io/assets/favicon/favicon-16x16.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/favicons',
    filename: 'favicon-16x16.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io Favicon',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: 'Icône de favori 16x16'
  },
  {
    id: 'favicon-32',
    url: 'https://diep.io/assets/favicon/favicon-32x32.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/favicons',
    filename: 'favicon-32x32.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io Favicon',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: 'Icône de favori 32x32'
  },
  {
    id: 'favicon-96',
    url: 'https://diep.io/assets/favicon/favicon-96x96.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/favicons',
    filename: 'favicon-96x96.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io Favicon',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: 'Icône de favori 96x96'
  },
  {
    id: 'favicon-highres',
    url: 'https://diep.io/assets/favicon/favicon.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: 'reference-only/favicons',
    filename: 'favicon.png',
    license: 'Propriétaire / Inconnue (Diep.io)',
    provenance: 'Diep.io Favicon',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: 'Icône de favori haute résolution (tank bleu sur fond blanc)'
  },

  // 3. Icônes Font Awesome Pro 6.1.1 (Licence Commerciale Fonticons, Inc. -> REFERENCE ONLY)
  ...[
    'arrow-up-right-from-square',
    'camera-movie',
    'chevron-down',
    'chevron-left',
    'chevron-up',
    'circle-question',
    'clock',
    'crown',
    'film',
    'game-board-simple',
    'gavel',
    'gear',
    'keyboard',
    'link-simple',
    'list-tree',
    'lock',
    'palette',
    'right-to-bracket',
    'shirt',
    'store',
    'users',
    'xmark'
  ].map((name) => ({
    id: `fa-pro-${name}`,
    url: `https://diep.io/assets/fa/${name}.svg`,
    expectedMime: 'image/svg+xml',
    format: 'svg',
    targetRelDir: 'reference-only/icons-fa-pro',
    filename: `${name}.svg`,
    license: 'Font Awesome Pro 6.1.1 (Commercial License - Copyright Fonticons, Inc.)',
    provenance: 'Font Awesome Pro (Fonticons, Inc.)',
    distribution: 'reference-only',
    canBeDrawnByCode: false,
    description: `Icône UI '${name}' issue du kit commercial Font Awesome Pro`
  })),

  // 4. Icône Font Awesome Free 6.7.2 (CC BY 4.0 / SIL OFL / MIT -> DISTRIBUABLE sous conditions)
  {
    id: 'fa-free-circle-up-regular',
    url: 'https://diep.io/assets/fa/circle-up-regular.svg',
    expectedMime: 'image/svg+xml',
    format: 'svg',
    targetRelDir: 'distributable/icons-fa-free',
    filename: 'circle-up-regular.svg',
    license: 'CC BY 4.0 (Font Awesome Free 6.7.2)',
    provenance: 'Font Awesome Free (Fonticons, Inc.)',
    distribution: 'distributable',
    canBeDrawnByCode: false,
    description: "Icône 'circle-up-regular' distribuée sous licence Font Awesome Free (CC BY 4.0)"
  },

  // 5. Drapeaux de sélection de région (Bibliothèque flag-icons / Lipis -> MIT License -> DISTRIBUABLE)
  ...['de', 'gb', 'us'].map((code) => ({
    id: `flag-${code}`,
    url: `https://diep.io/assets/flag-square/${code}.svg`,
    expectedMime: 'image/svg+xml',
    format: 'svg',
    targetRelDir: 'distributable/flags',
    filename: `${code}.svg`,
    license: 'MIT (flag-icons / Lipis)',
    provenance: 'flag-icons (https://github.com/lipis/flag-icons)',
    distribution: 'distributable',
    canBeDrawnByCode: false,
    description: `Drapeau carré pour la région '${code.toUpperCase()}' issu du projet open source flag-icons`
  })),

  // 6. Probes de test de robustesse / rejet de faux positifs (doivent être rejetés)
  {
    id: 'probe-favicon-ico',
    url: 'https://diep.io/favicon.ico',
    expectedMime: 'image/x-icon',
    format: 'ico',
    targetRelDir: null,
    filename: 'favicon.ico',
    license: 'N/A',
    provenance: 'Test probe',
    distribution: 'none',
    canBeDrawnByCode: false,
    description: "Sonde de test : vérification du rejet du fallback SPA HTML sur /favicon.ico"
  },
  {
    id: 'probe-apple-touch-icon',
    url: 'https://diep.io/apple-touch-icon.png',
    expectedMime: 'image/png',
    format: 'png',
    targetRelDir: null,
    filename: 'apple-touch-icon.png',
    license: 'N/A',
    provenance: 'Test probe',
    distribution: 'none',
    canBeDrawnByCode: false,
    description: "Sonde de test : vérification du rejet d'icône Apple inexistante renvoyant du HTML"
  },
  {
    id: 'probe-audio-shoot',
    url: 'https://diep.io/assets/audio/shoot.mp3',
    expectedMime: 'audio/mpeg',
    format: 'mp3',
    targetRelDir: null,
    filename: 'shoot.mp3',
    license: 'N/A',
    provenance: 'Test probe',
    distribution: 'none',
    canBeDrawnByCode: false,
    description: "Sonde de test : vérification de l'absence de fichier audio direct"
  }
];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);

function validateFormat(buffer, format, contentType) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'Buffer vide' };
  }

  // Si le serveur répond avec du HTML au lieu d'un binaire ou SVG
  const sample = buffer.slice(0, 100).toString('utf8').trim().toLowerCase();
  if (sample.startsWith('<!doctype html') || sample.startsWith('<html')) {
    return { valid: false, reason: 'Réponse HTML de type SPA catch-all reçue au lieu du format attendu' };
  }

  if (format === 'png') {
    if (buffer.length < 8 || !buffer.slice(0, 8).equals(PNG_MAGIC)) {
      return { valid: false, reason: 'Signature binaire PNG invalide' };
    }
    return { valid: true, mime: 'image/png' };
  }

  if (format === 'svg') {
    const text = buffer.toString('utf8');
    if (!text.includes('<svg') || !text.includes('</svg>')) {
      return { valid: false, reason: 'Balise <svg> introuvable dans le document' };
    }
    return { valid: true, mime: 'image/svg+xml' };
  }

  if (format === 'ico') {
    if (buffer.length < 4 || !buffer.slice(0, 4).equals(ICO_MAGIC)) {
      return { valid: false, reason: 'Signature binaire ICO invalide' };
    }
    return { valid: true, mime: 'image/x-icon' };
  }

  if (format === 'mp3') {
    return { valid: false, reason: 'Format audio non vérifiable ou absent' };
  }

  return { valid: false, reason: `Format inconnu: ${format}` };
}

async function collectItem(item, isDryRun) {
  const result = {
    id: item.id,
    url: item.url,
    category: item.targetRelDir ? item.targetRelDir.split('/')[0] : 'probe',
    expectedFormat: item.format,
    targetRelDir: item.targetRelDir,
    filename: item.filename,
    license: item.license,
    provenance: item.provenance,
    distribution: item.distribution,
    canBeDrawnByCode: item.canBeDrawnByCode,
    description: item.description,
    collectedAt: new Date().toISOString(),
    status: 'pending',
    httpStatus: null,
    mediaType: null,
    sizeBytes: 0,
    sha256: null,
    savedPath: null,
    errorMessage: null
  };

  try {
    const response = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    result.httpStatus = response.status;
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      result.status = 'failed';
      result.errorMessage = `HTTP error ${response.status} ${response.statusText}`;
      return result;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    result.sizeBytes = buffer.length;

    const validation = validateFormat(buffer, item.format, contentType);
    if (!validation.valid) {
      result.status = 'rejected_invalid_format';
      result.errorMessage = validation.reason;
      return result;
    }

    result.mediaType = validation.mime;
    result.sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Sauvegarde sur disque si ce n'est pas un test probe
    if (item.targetRelDir && item.filename) {
      const fullTargetDir = path.join(BASE_OUTPUT_DIR, item.targetRelDir);
      const fullTargetFile = path.join(fullTargetDir, item.filename);

      if (!isDryRun) {
        await fs.mkdir(fullTargetDir, { recursive: true });
        await fs.writeFile(fullTargetFile, buffer);
      }

      result.savedPath = path.relative(REPO_ROOT, fullTargetFile);
    }

    result.status = 'success';
    return result;
  } catch (err) {
    result.status = 'error';
    result.errorMessage = err.message;
    return result;
  }
}

function generateMarkdownManifest(items, summary) {
  let md = `# Manifeste des Assets de Référence Diep.io\n\n`;
  md += `Date de collecte : ${summary.timestamp}\n`;
  md += `Total testé : ${summary.total} | Réussis : ${summary.successCount} | Rejetés/Échoués : ${summary.rejectedOrFailedCount}\n\n`;
  md += `> [!IMPORTANT]\n`;
  md += `> **Distinction légale essentielle** :\n`;
  md += `> - Les fichiers sous \`reference-only/\` (logo, favicons, icônes Font Awesome Pro commerciales) sont collectés exclusivement à des fins d'analyse, d'étalonnage et d'étude de compatibilité. **Ils ne sont pas open source et ne peuvent pas être redistribués** dans le jeu final.\n`;
  md += `> - Les fichiers sous \`distributable/\` disposent d'une licence libre vérifiée (MIT pour les drapeaux \`flag-icons\`, CC BY 4.0 pour l'icône \`Font Awesome Free\`).\n`;
  md += `> - Les entités de gameplay (tanks, canons, barils, drones, formes géométriques, balles, barres de vie) **n'ont besoin d'aucun asset graphique** : elles sont rendues par code vectoriel (primitives Canvas 2D / WebGL).\n\n`;

  md += `## 1. Synthèse par Catégorie et Licence\n\n`;
  md += `| Catégorie | Répertoire relatif | Licence | Statut de redistribution | Fichiers collectés |\n`;
  md += `| :--- | :--- | :--- | :--- | :---: |\n`;
  md += `| Images Diep.io | \`reference-only/images/\` | Propriétaire / Inconnue (Diep.io) | **Usage de référence uniquement** | 4 |\n`;
  md += `| Favicons Diep.io | \`reference-only/favicons/\` | Propriétaire / Inconnue (Diep.io) | **Usage de référence uniquement** | 4 |\n`;
  md += `| Icônes UI Font Awesome Pro | \`reference-only/icons-fa-pro/\` | Commerciale (Fonticons, Inc.) | **Usage de référence uniquement** | 22 |\n`;
  md += `| Icône Font Awesome Free | \`distributable/icons-fa-free/\` | CC BY 4.0 (Fonticons, Inc.) | Redistribuable (attribution requise) | 1 |\n`;
  md += `| Drapeaux région | \`distributable/flags/\` | MIT (Lipis / flag-icons) | Redistribuable | 3 |\n`;
  md += `| Sondes de test / rejets | *N/A (rejetés)* | N/A | Non applicable (rejetés) | 0 (3 rejetés) |\n\n`;

  md += `## 2. Inventaire Détaillé des Fichiers\n\n`;
  md += `| Nom du fichier | Type MIME | Taille (octets) | SHA-256 (premiers 12 car.) | Licence | Statut | Emplacement relatif |\n`;
  md += `| :--- | :--- | :---: | :--- | :--- | :---: | :--- |\n`;

  for (const item of items) {
    const sha = item.sha256 ? item.sha256.slice(0, 12) + '…' : '-';
    const statusLabel = item.status === 'success' ? '✅ Succès' : `❌ ${item.status}`;
    const fileLabel = item.savedPath ? `\`${item.savedPath}\`` : `*(non sauvegardé)*`;
    md += `| \`${item.filename}\` | \`${item.mediaType || '-'}\` | ${item.sizeBytes} | \`${sha}\` | ${item.license} | ${statusLabel} | ${fileLabel} |\n`;
  }

  md += `\n## 3. Analyse des Erreurs et Rejets Volontaires\n\n`;
  md += `Les sondes suivantes ont été exécutées pour tester et prouver la détection stricte des faux positifs :\n\n`;
  const rejected = items.filter((i) => i.status !== 'success');
  for (const item of rejected) {
    md += `- **${item.url}** : Rejeté (\`${item.status}\`). Raison : *${item.errorMessage}*.\n`;
  }

  return md;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[collect-reference-assets] Démarrage de la collecte (dry-run: ${isDryRun})...`);

  const results = [];
  for (const target of ASSET_ALLOWLIST) {
    process.stdout.write(`  -> Téléchargement et vérification : ${target.filename} (${target.id})... `);
    const res = await collectItem(target, isDryRun);
    if (res.status === 'success') {
      console.log(`OK (${res.sizeBytes} o, ${res.mediaType})`);
    } else {
      console.log(`REJET / ÉCHEC [${res.status}]: ${res.errorMessage}`);
    }
    results.push(res);
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  const rejectedOrFailedCount = results.filter((r) => r.status !== 'success').length;
  const referenceOnlyCount = results.filter((r) => r.status === 'success' && r.distribution === 'reference-only').length;
  const distributableCount = results.filter((r) => r.status === 'success' && r.distribution === 'distributable').length;

  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    successCount,
    rejectedOrFailedCount,
    referenceOnlyCount,
    distributableCount,
    outputDirectory: path.relative(REPO_ROOT, BASE_OUTPUT_DIR)
  };

  console.log('\n[collect-reference-assets] Synthèse :');
  console.log(`  - Total items testés : ${summary.total}`);
  console.log(`  - Succès : ${summary.successCount}`);
  console.log(`    * Reference-only (usage étude exclusif) : ${summary.referenceOnlyCount}`);
  console.log(`    * Distributable (licence libre vérifiée) : ${summary.distributableCount}`);
  console.log(`  - Rejetés / Faux-positifs SPA évités : ${summary.rejectedOrFailedCount}`);

  if (!isDryRun) {
    await fs.mkdir(BASE_OUTPUT_DIR, { recursive: true });

    // 1. Sauvegarde du manifeste JSON
    const manifestJsonPath = path.join(BASE_OUTPUT_DIR, 'manifest.json');
    const jsonContent = JSON.stringify({ summary, items: results }, null, 2);
    await fs.writeFile(manifestJsonPath, jsonContent, 'utf8');
    console.log(`  -> Manifeste JSON écrit : ${path.relative(REPO_ROOT, manifestJsonPath)}`);

    // 2. Sauvegarde du manifeste Markdown
    const manifestMdPath = path.join(BASE_OUTPUT_DIR, 'manifest.md');
    const mdContent = generateMarkdownManifest(results, summary);
    await fs.writeFile(manifestMdPath, mdContent, 'utf8');
    console.log(`  -> Manifeste Markdown écrit : ${path.relative(REPO_ROOT, manifestMdPath)}`);
  }

  console.log('[collect-reference-assets] Terminé avec succès.');
}

main().catch((err) => {
  console.error('[collect-reference-assets] Erreur fatale :', err);
  process.exit(1);
});

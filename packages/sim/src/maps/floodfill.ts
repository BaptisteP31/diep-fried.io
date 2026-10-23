import type { Rect, Vec2 } from '@diep-fried/shared';
import { circleVsWall } from './collision';
import { MAZE_LIMITS } from './types';

export interface ConnectivityVerificationOptions {
  width: number;
  height: number;
  walls: readonly Rect[];
  tankRadius?: number;
  sampleStep?: number;
  checkPoints?: readonly Vec2[];
}

export interface ConnectivityVerificationResult {
  /** Vrai si tous les points de contrôle et l'espace navigable forment un composant connexe unique. */
  connected: boolean;
  /** Nombre total de cellules d'échantillonnage navigables trouvées. */
  totalPassableCount: number;
  /** Nombre de cellules d'échantillonnage navigables atteintes depuis le germe. */
  reachableCount: number;
  /** Fraction de l'espace navigable couvert par la composante principale (0..1). */
  coverageFraction: number;
  /** Points de contrôle non atteignables depuis le germe (doit être vide si connexe). */
  unreachablePoints: Vec2[];
}

/** Treillis d'échantillonnage des centres de tank (espace des configurations). */
export interface ConnectivitySamplingPlan {
  step: number;
  cols: number;
  rows: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Pas d'échantillonnage par défaut : au plus le rayon du tank, borné à [10, 35]. */
export function defaultConnectivityStep(tankRadius: number): number {
  return Math.max(10, Math.min(tankRadius, 35));
}

/**
 * Nombre de cellules du treillis d'échantillonnage (0 si l'espace des centres est vide).
 * Pur calcul flottant, sans allocation : sert à refuser les configurations trop coûteuses.
 */
export function countConnectivityCells(
  width: number,
  height: number,
  tankRadius: number,
  step: number,
): number {
  const spanX = width - 2 * tankRadius;
  const spanY = height - 2 * tankRadius;
  if (!(spanX > 0) || !(spanY > 0)) return 0;
  return (Math.floor(spanX / step) + 1) * (Math.floor(spanY / step) + 1);
}

/**
 * Valide les paramètres et calcule le treillis d'échantillonnage.
 * Lève une RangeError si une valeur est invalide ou si le treillis dépasserait
 * `MAZE_LIMITS.maxFloodfillCells` (aucune allocation n'est faite avant ce contrôle).
 */
export function planConnectivitySampling(options: {
  width: number;
  height: number;
  tankRadius?: number;
  sampleStep?: number;
}): ConnectivitySamplingPlan {
  const { width, height } = options;
  const tankRadius = options.tankRadius ?? MAZE_LIMITS.defaultTankRadius;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(
      `Dimensions invalides pour la connexité: ${width}x${height}. Attendu: nombres finis > 0.`,
    );
  }
  if (!Number.isFinite(tankRadius) || tankRadius <= 0) {
    throw new RangeError(`tankRadius invalide: ${tankRadius}. Doit être un nombre fini > 0.`);
  }
  const step = options.sampleStep ?? defaultConnectivityStep(tankRadius);
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError(`sampleStep invalide: ${step}. Doit être un nombre fini > 0.`);
  }

  const minX = tankRadius;
  const maxX = width - tankRadius;
  const minY = tankRadius;
  const maxY = height - tankRadius;

  const cells = countConnectivityCells(width, height, tankRadius, step);
  if (cells > MAZE_LIMITS.maxFloodfillCells) {
    throw new RangeError(
      `Échantillonnage trop coûteux: ${cells} cellules (arène ${width}x${height}, rayon ${tankRadius}, pas ${step}) > limite ${MAZE_LIMITS.maxFloodfillCells}. Augmenter sampleStep ou réduire l'arène.`,
    );
  }

  if (cells === 0) {
    return { step, cols: 0, rows: 0, minX, maxX, minY, maxY };
  }
  return {
    step,
    cols: Math.floor((maxX - minX) / step) + 1,
    rows: Math.floor((maxY - minY) / step) + 1,
    minX,
    maxX,
    minY,
    maxY,
  };
}

/**
 * Index spatial uniforme des murs (format CSR) : chaque mur est référencé dans tous les seaux
 * touchés par sa boîte englobante dilatée du rayon. Un test de cercle ne consulte alors que
 * le seau de son centre, au lieu de tous les murs, avec un résultat identique.
 */
class WallIndex {
  private readonly bucketSize: number;
  private readonly bucketCols: number;
  private readonly bucketRows: number;
  private readonly offsets: Int32Array;
  private readonly entries: Int32Array;

  constructor(
    private readonly walls: readonly Rect[],
    width: number,
    height: number,
    private readonly radius: number,
  ) {
    const maxDim = Math.max(width, height);
    // Au plus 512 seaux par axe, quelle que soit la taille de l'arène.
    this.bucketSize = Math.max(128, 4 * radius, maxDim / 512);
    this.bucketCols = Math.max(1, Math.ceil(width / this.bucketSize));
    this.bucketRows = Math.max(1, Math.ceil(height / this.bucketSize));

    const bucketCount = this.bucketCols * this.bucketRows;
    const counts = new Int32Array(bucketCount + 1);
    const ranges = new Int32Array(walls.length * 4).fill(-1);
    let total = 0;

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      if (!wall) continue;
      const loX = Math.min(wall.x, wall.x + wall.width) - radius;
      const hiX = Math.max(wall.x, wall.x + wall.width) + radius;
      const loY = Math.min(wall.y, wall.y + wall.height) - radius;
      const hiY = Math.max(wall.y, wall.y + wall.height) + radius;
      const c0 = this.bucketX(loX);
      const c1 = this.bucketX(hiX);
      const r0 = this.bucketY(loY);
      const r1 = this.bucketY(hiY);
      if (c0 < 0 || c1 < 0 || r0 < 0 || r1 < 0) {
        throw new RangeError(
          `Mur ${i} invalide (coordonnées non finies) : ${JSON.stringify(wall)}.`,
        );
      }
      total += (c1 - c0 + 1) * (r1 - r0 + 1);
      if (total > MAZE_LIMITS.maxFloodfillIndexEntries) {
        throw new RangeError(
          `Index spatial des murs trop coûteux (> ${MAZE_LIMITS.maxFloodfillIndexEntries} entrées) : trop de murs très étendus.`,
        );
      }
      ranges[i * 4] = c0;
      ranges[i * 4 + 1] = c1;
      ranges[i * 4 + 2] = r0;
      ranges[i * 4 + 3] = r1;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const slot = r * this.bucketCols + c + 1;
          counts[slot] = (counts[slot] ?? 0) + 1;
        }
      }
    }

    for (let b = 0; b < bucketCount; b++) counts[b + 1] = (counts[b + 1] ?? 0) + (counts[b] ?? 0);
    this.offsets = counts;
    this.entries = new Int32Array(total);
    const cursor = counts.slice(0, bucketCount);

    for (let i = 0; i < walls.length; i++) {
      const c0 = ranges[i * 4] ?? -1;
      if (c0 < 0) continue;
      const c1 = ranges[i * 4 + 1] ?? 0;
      const r0 = ranges[i * 4 + 2] ?? 0;
      const r1 = ranges[i * 4 + 3] ?? 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const b = r * this.bucketCols + c;
          this.entries[cursor[b] ?? 0] = i;
          cursor[b] = (cursor[b] ?? 0) + 1;
        }
      }
    }
  }

  /** Indice de seau en x, borné ; -1 si la valeur n'est pas un nombre fini. */
  private bucketX(x: number): number {
    if (!Number.isFinite(x)) return -1;
    return Math.max(0, Math.min(this.bucketCols - 1, Math.floor(x / this.bucketSize)));
  }

  private bucketY(y: number): number {
    if (!Number.isFinite(y)) return -1;
    return Math.max(0, Math.min(this.bucketRows - 1, Math.floor(y / this.bucketSize)));
  }

  /** Équivalent de `circleVsWalls(x, y, radius, walls)` pour le rayon de l'index. */
  blocked(x: number, y: number): boolean {
    const c = this.bucketX(x);
    const r = this.bucketY(y);
    if (c < 0 || r < 0) return false;
    const b = r * this.bucketCols + c;
    const end = this.offsets[b + 1] ?? 0;
    for (let k = this.offsets[b] ?? 0; k < end; k++) {
      const wall = this.walls[this.entries[k] ?? 0];
      if (wall && circleVsWall(x, y, this.radius, wall)) return true;
    }
    return false;
  }
}

/**
 * Vérifie la connexité de l'espace navigable dilaté par le rayon du tank via floodfill.
 *
 * Dans l'espace des configurations (C-space), un tank de rayon R est modélisé par son centre
 * naviguant dans l'arène [R, W - R] x [R, H - R] en évitant les murs dilatés de Minkowski.
 */
export function verifyMazeConnectivity(
  options: ConnectivityVerificationOptions,
): ConnectivityVerificationResult {
  const { width, height, walls, checkPoints = [] } = options;
  const tankRadius = options.tankRadius ?? MAZE_LIMITS.defaultTankRadius;

  // Validation et budget AVANT toute allocation proportionnelle à l'arène.
  const plan = planConnectivitySampling(options);
  if (walls.length > MAZE_LIMITS.maxFloodfillWalls) {
    throw new RangeError(
      `Trop de murs pour la vérification de connexité: ${walls.length} > ${MAZE_LIMITS.maxFloodfillWalls}.`,
    );
  }
  if (checkPoints.length > MAZE_LIMITS.maxFloodfillCheckPoints) {
    throw new RangeError(
      `Trop de points de contrôle: ${checkPoints.length} > ${MAZE_LIMITS.maxFloodfillCheckPoints}.`,
    );
  }

  const { step, cols, rows, minX, maxX, minY, maxY } = plan;
  const totalCells = cols * rows;

  if (totalCells === 0) {
    return {
      connected: false,
      totalPassableCount: 0,
      reachableCount: 0,
      coverageFraction: 0,
      unreachablePoints: [...checkPoints],
    };
  }

  const index = new WallIndex(walls, width, height, tankRadius);

  const isPassable = new Uint8Array(totalCells);
  let totalPassableCount = 0;

  for (let r = 0; r < rows; r++) {
    const y = Math.min(maxY, minY + r * step);
    const rowOffset = r * cols;
    for (let c = 0; c < cols; c++) {
      const x = Math.min(maxX, minX + c * step);
      if (!index.blocked(x, y)) {
        isPassable[rowOffset + c] = 1;
        totalPassableCount++;
      }
    }
  }

  if (totalPassableCount === 0) {
    return {
      connected: false,
      totalPassableCount: 0,
      reachableCount: 0,
      coverageFraction: 0,
      unreachablePoints: [...checkPoints],
    };
  }

  // Trouver un germe pour le floodfill (idéalement le premier point de contrôle navigable)
  let seedC = -1;
  let seedR = -1;

  if (checkPoints.length > 0) {
    for (const pt of checkPoints) {
      if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
        if (!index.blocked(pt.x, pt.y)) {
          const c = Math.max(0, Math.min(cols - 1, Math.round((pt.x - minX) / step)));
          const r = Math.max(0, Math.min(rows - 1, Math.round((pt.y - minY) / step)));
          if (isPassable[r * cols + c] === 1) {
            seedC = c;
            seedR = r;
            break;
          }
        }
      }
    }
  }

  // Si aucun point de contrôle n'a servi de germe, prendre la première cellule navigable
  if (seedC === -1) {
    for (let r = 0; r < rows; r++) {
      const rowOffset = r * cols;
      for (let c = 0; c < cols; c++) {
        if (isPassable[rowOffset + c] === 1) {
          seedC = c;
          seedR = r;
          break;
        }
      }
      if (seedC !== -1) break;
    }
  }

  if (seedC === -1) {
    return {
      connected: false,
      totalPassableCount,
      reachableCount: 0,
      coverageFraction: 0,
      unreachablePoints: [...checkPoints],
    };
  }

  // Parcours en largeur (BFS)
  const visited = new Uint8Array(totalCells);
  const queue = new Int32Array(totalCells);
  let head = 0;
  let tail = 0;

  const startIdx = seedR * cols + seedC;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  let reachableCount = 0;

  while (head < tail) {
    const idx = queue[head++];
    if (idx === undefined) break;
    reachableCount++;

    const c = idx % cols;
    const r = Math.floor(idx / cols);

    // 4 directions cardinales
    // Gauche
    if (c > 0) {
      const nIdx = idx - 1;
      if (isPassable[nIdx] === 1 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
    // Droite
    if (c < cols - 1) {
      const nIdx = idx + 1;
      if (isPassable[nIdx] === 1 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
    // Haut
    if (r > 0) {
      const nIdx = idx - cols;
      if (isPassable[nIdx] === 1 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
    // Bas
    if (r < rows - 1) {
      const nIdx = idx + cols;
      if (isPassable[nIdx] === 1 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  // Vérifier chaque point de contrôle
  const unreachablePoints: Vec2[] = [];
  for (const pt of checkPoints) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || index.blocked(pt.x, pt.y)) {
      unreachablePoints.push(pt);
      continue;
    }
    const c = Math.max(0, Math.min(cols - 1, Math.round((pt.x - minX) / step)));
    const r = Math.max(0, Math.min(rows - 1, Math.round((pt.y - minY) / step)));

    // Si la cellule la plus proche n'est pas marquée, tester les cellules voisines immédiates
    let reached = false;
    for (let dr = -1; dr <= 1 && !reached; dr++) {
      const nr = r + dr;
      if (nr < 0 || nr >= rows) continue;
      for (let dc = -1; dc <= 1; dc++) {
        const nc = c + dc;
        if (nc < 0 || nc >= cols) continue;
        if (visited[nr * cols + nc] === 1) {
          reached = true;
          break;
        }
      }
    }

    if (!reached) {
      unreachablePoints.push(pt);
    }
  }

  const coverageFraction = totalPassableCount > 0 ? reachableCount / totalPassableCount : 0;
  // Le labyrinthe est connexe si tous les points de contrôle sont atteints
  // et qu'aucune composante résiduelle significative n'est isolée.
  const connected = unreachablePoints.length === 0 && coverageFraction >= 0.95;

  return {
    connected,
    totalPassableCount,
    reachableCount,
    coverageFraction,
    unreachablePoints,
  };
}

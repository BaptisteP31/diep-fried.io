import type { Rect, Vec2 } from '@diep-fried/shared';
import { circleVsWalls } from './collision';
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

/**
 * Vérifie la connexité de l'espace navigable dilaté par le rayon du tank via floodfill.
 *
 * Dans l'espace des configurations (C-space), un tank de rayon R est modélisé par son centre
 * naviguant dans l'arène [R, W - R] x [R, H - R] en évitant les murs dilatés de Minkowski.
 */
export function verifyMazeConnectivity(
  options: ConnectivityVerificationOptions,
): ConnectivityVerificationResult {
  const {
    width,
    height,
    walls,
    tankRadius = MAZE_LIMITS.defaultTankRadius,
    checkPoints = [],
  } = options;

  const minX = tankRadius;
  const maxX = width - tankRadius;
  const minY = tankRadius;
  const maxY = height - tankRadius;

  if (maxX <= minX || maxY <= minY) {
    return {
      connected: false,
      totalPassableCount: 0,
      reachableCount: 0,
      coverageFraction: 0,
      unreachablePoints: [...checkPoints],
    };
  }

  // Échantillonnage fin (au maximum égal au rayon du tank pour garantir le recouvrement continu)
  const defaultStep = Math.max(10, Math.min(tankRadius, 35));
  const step = options.sampleStep ?? defaultStep;

  const cols = Math.floor((maxX - minX) / step) + 1;
  const rows = Math.floor((maxY - minY) / step) + 1;
  const totalCells = cols * rows;

  const isPassable = new Uint8Array(totalCells);
  let totalPassableCount = 0;

  for (let r = 0; r < rows; r++) {
    const y = Math.min(maxY, minY + r * step);
    const rowOffset = r * cols;
    for (let c = 0; c < cols; c++) {
      const x = Math.min(maxX, minX + c * step);
      if (!circleVsWalls(x, y, tankRadius, walls)) {
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
        if (!circleVsWalls(pt.x, pt.y, tankRadius, walls)) {
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
    if (circleVsWalls(pt.x, pt.y, tankRadius, walls)) {
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

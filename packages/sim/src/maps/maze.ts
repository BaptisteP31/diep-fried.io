import type { Rect, Vec2 } from '@diep-fried/shared';
import { BALANCE } from '../balance';
import { Rng } from '../rng';
import { verifyMazeConnectivity } from './floodfill';
import { MAZE_LIMITS, type MazeLayoutResult, type MazeOptions } from './types';

/**
 * Structure Disjoint-Set / Union-Find pour l'algorithme de Kruskal.
 */
class DisjointSet {
  private readonly parent: Int32Array;
  private readonly rank: Uint8Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    this.rank = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
    }
  }

  find(i: number): number {
    let root = i;
    while (root !== (this.parent[root] ?? root)) {
      root = this.parent[root] ?? root;
    }
    // Compression de chemin
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr] ?? root;
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }

  union(i: number, j: number): boolean {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI === rootJ) return false;

    const rankI = this.rank[rootI] ?? 0;
    const rankJ = this.rank[rootJ] ?? 0;

    if (rankI < rankJ) {
      this.parent[rootI] = rootJ;
    } else if (rankI > rankJ) {
      this.parent[rootJ] = rootI;
    } else {
      this.parent[rootJ] = rootI;
      this.rank[rootI] = (this.rank[rootI] ?? 0) + 1;
    }
    return true;
  }
}

interface GridEdge {
  u: number;
  v: number;
  isVertical: boolean;
  col: number;
  row: number;
}

/**
 * Valide strictement les options de génération du labyrinthe.
 * Rejette proprement les configurations impossibles ou hors bornes.
 */
function validateMazeOptions(options: MazeOptions): {
  tankRadius: number;
  wallThickness: number;
  cellSize: number;
  loopFactor: number;
} {
  const { width, height, seed } = options;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError(
      `Dimensions d'arène invalides: width=${width}, height=${height}. Attendu: nombres finis > 0.`,
    );
  }

  if (!Number.isFinite(seed)) {
    throw new TypeError(`Seed invalide: ${seed}. Attendu: nombre fini.`);
  }

  if (
    width < MAZE_LIMITS.minArenaDimension ||
    height < MAZE_LIMITS.minArenaDimension ||
    width > MAZE_LIMITS.maxArenaDimension ||
    height > MAZE_LIMITS.maxArenaDimension
  ) {
    throw new RangeError(
      `Dimensions d'arène ${width}x${height} hors bornes acceptées [${MAZE_LIMITS.minArenaDimension}, ${MAZE_LIMITS.maxArenaDimension}].`,
    );
  }

  const tankRadius = options.tankRadius ?? BALANCE.tankRadius ?? MAZE_LIMITS.defaultTankRadius;
  if (!Number.isFinite(tankRadius) || tankRadius <= 0) {
    throw new RangeError(`tankRadius invalide: ${tankRadius}. Doit être > 0.`);
  }

  const wallThickness = options.wallThickness ?? MAZE_LIMITS.defaultWallThickness;
  if (!Number.isFinite(wallThickness) || wallThickness <= 0) {
    throw new RangeError(`wallThickness invalide: ${wallThickness}. Doit être > 0.`);
  }

  const loopFactor = options.loopFactor ?? MAZE_LIMITS.defaultLoopFactor;
  if (!Number.isFinite(loopFactor) || loopFactor < 0 || loopFactor > 1) {
    throw new RangeError(`loopFactor invalide: ${loopFactor}. Doit être compris dans [0, 1].`);
  }

  // Dégagement minimal nécessaire pour laisser passer le diamètre du tank
  const minCorridorWidth = 2 * tankRadius + MAZE_LIMITS.minClearance;
  const minCellSize = minCorridorWidth + wallThickness;

  const cellSize = options.cellSize ?? Math.max(MAZE_LIMITS.defaultCellSize, minCellSize);
  if (!Number.isFinite(cellSize) || cellSize < minCellSize) {
    throw new RangeError(
      `cellSize=${cellSize} trop petite. Pour un tank de rayon ${tankRadius} et des murs d'épaisseur ${wallThickness}, cellSize doit être >= ${minCellSize}.`,
    );
  }

  return { tankRadius, wallThickness, cellSize, loopFactor };
}

/**
 * Détermine si un rectangle intersecte une boîte AABB.
 */
function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Génère un agencement complet et déterministe de labyrinthe (Maze)
 * avec informations détaillées de grille et vérification de connexité.
 */
export function generateMazeLayout(options: MazeOptions): MazeLayoutResult {
  const { tankRadius, wallThickness, cellSize, loopFactor } = validateMazeOptions(options);
  const { width, height, seed, reservedZones = [] } = options;

  // Calcul du nombre de cellules de la grille
  const rawCols = Math.round(width / cellSize);
  const rawRows = Math.round(height / cellSize);

  const cols = Math.max(MAZE_LIMITS.minGridCells, Math.min(MAZE_LIMITS.maxGridCells, rawCols));
  const rows = Math.max(MAZE_LIMITS.minGridCells, Math.min(MAZE_LIMITS.maxGridCells, rawRows));

  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const minPassageX = cellWidth - wallThickness;
  const minPassageY = cellHeight - wallThickness;
  const requiredPassage = 2 * tankRadius + MAZE_LIMITS.minClearance;

  if (minPassageX < requiredPassage || minPassageY < requiredPassage) {
    throw new Error(
      `Impossible de garantir des corridors praticables avec la configuration demandée: passages ${minPassageX.toFixed(1)}x${minPassageY.toFixed(1)}, minimum requis: ${requiredPassage}.`,
    );
  }

  const totalCells = cols * rows;
  const dsu = new DisjointSet(totalCells);
  const rng = new Rng(seed);

  // Repérage des cellules réservées (ex: bases d'équipes)
  const cellInReserved = new Int8Array(totalCells);
  cellInReserved.fill(-1);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cellRect: Rect = {
        x: c * cellWidth,
        y: r * cellHeight,
        width: cellWidth,
        height: cellHeight,
      };
      for (let z = 0; z < reservedZones.length; z++) {
        const zone = reservedZones[z];
        if (zone && rectsIntersect(cellRect, zone)) {
          cellInReserved[idx] = z;
          break;
        }
      }
    }
  }

  // Fusionner les cellules appartenant à la même zone réservée
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = r * cols + c;
      const zoneU = cellInReserved[u];
      if (zoneU === -1) continue;

      // Voisin droit
      if (c < cols - 1) {
        const v = u + 1;
        if (cellInReserved[v] === zoneU) {
          dsu.union(u, v);
        }
      }
      // Voisin bas
      if (r < rows - 1) {
        const v = u + cols;
        if (cellInReserved[v] === zoneU) {
          dsu.union(u, v);
        }
      }
    }
  }

  // Liste de toutes les arêtes candidates de murs internes
  const edges: GridEdge[] = [];

  // Murs verticaux (séparent (c, r) et (c + 1, r))
  for (let c = 0; c < cols - 1; c++) {
    for (let r = 0; r < rows; r++) {
      const u = r * cols + c;
      const v = r * cols + (c + 1);
      edges.push({ u, v, isVertical: true, col: c, row: r });
    }
  }

  // Murs horizontaux (séparent (c, r) et (c, r + 1))
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const u = r * cols + c;
      const v = (r + 1) * cols + c;
      edges.push({ u, v, isVertical: false, col: c, row: r });
    }
  }

  // Mélange pseudo-aléatoire déterministe de Fisher-Yates avec Mulberry32
  for (let i = edges.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const edgeI = edges[i];
    const edgeJ = edges[j];
    if (edgeI && edgeJ) {
      edges[i] = edgeJ;
      edges[j] = edgeI;
    }
  }

  // Grilles d'état des murs
  // verticalWalls[c][r] = vrai si mur présent entre (c, r) et (c + 1, r)
  const verticalWalls: boolean[][] = Array.from({ length: cols - 1 }, () =>
    new Array(rows).fill(true),
  );
  // horizontalWalls[r][c] = vrai si mur présent entre (c, r) et (c, r + 1)
  const horizontalWalls: boolean[][] = Array.from({ length: rows - 1 }, () =>
    new Array(cols).fill(true),
  );

  // Algorithme de Kruskal avec facteur de boucles (braid)
  for (const edge of edges) {
    const { u, v, isVertical, col, row } = edge;
    const zoneU = cellInReserved[u];
    const zoneV = cellInReserved[v];

    const vCol = verticalWalls[col];
    const hRow = horizontalWalls[row];

    // Deux cellules dans la même zone réservée : aucun mur entre elles
    if (zoneU !== -1 && zoneU === zoneV) {
      if (isVertical && vCol) {
        vCol[row] = false;
      } else if (!isVertical && hRow) {
        hRow[col] = false;
      }
      continue;
    }

    if (dsu.find(u) !== dsu.find(v)) {
      // Arête essentielle de l'arbre couvrant : passage ouvert
      dsu.union(u, v);
      if (isVertical && vCol) {
        vCol[row] = false;
      } else if (!isVertical && hRow) {
        hRow[col] = false;
      }
    } else {
      // Cycle potentiel : ouvert avec probabilité loopFactor pour créer des boucles tactiques
      if (loopFactor > 0 && rng.next() < loopFactor) {
        if (isVertical && vCol) {
          vCol[row] = false;
        } else if (!isVertical && hRow) {
          hRow[col] = false;
        }
      }
    }
  }

  // S'assurer que toutes les zones réservées ont des entrées praticables
  for (let z = 0; z < reservedZones.length; z++) {
    // Si une cellule de zone réservée est encore disjointe d'un voisin externe, ouvrir un passage
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = r * cols + c;
        if (cellInReserved[u] !== z) continue;

        if (c < cols - 1 && cellInReserved[u + 1] !== z && dsu.find(u) !== dsu.find(u + 1)) {
          dsu.union(u, u + 1);
          const vCol = verticalWalls[c];
          if (vCol) vCol[r] = false;
        }
        if (r < rows - 1 && cellInReserved[u + cols] !== z && dsu.find(u) !== dsu.find(u + cols)) {
          dsu.union(u, u + cols);
          const hRow = horizontalWalls[r];
          if (hRow) hRow[c] = false;
        }
      }
    }
  }

  // Construction des rectangles de murs finaux avec fusion des segments colinéaires
  const walls: Rect[] = [];
  const halfThick = wallThickness / 2;

  // 1. Fusion des murs verticaux le long de chaque ligne de colonne
  for (let c = 0; c < cols - 1; c++) {
    const xCenter = (c + 1) * cellWidth;
    const wallX = Math.max(0, xCenter - halfThick);
    const wallW = Math.min(width - wallX, wallThickness);
    const vCol = verticalWalls[c];

    let startR = -1;
    for (let r = 0; r <= rows; r++) {
      const hasWall = r < rows && vCol ? (vCol[r] ?? false) : false;
      if (hasWall) {
        if (startR === -1) startR = r;
      } else if (startR !== -1) {
        const endR = r - 1;
        // Étendre légèrement les extrémités aux carrefours pour éviter les fuites géométriques
        const yTop = Math.max(0, startR * cellHeight - (startR > 0 ? halfThick : 0));
        const yBottom = Math.min(
          height,
          (endR + 1) * cellHeight + (endR < rows - 1 ? halfThick : 0),
        );
        const wallH = yBottom - yTop;

        if (wallW > 0 && wallH > 0) {
          walls.push({
            x: wallX,
            y: yTop,
            width: wallW,
            height: wallH,
          });
        }
        startR = -1;
      }
    }
  }

  // 2. Fusion des murs horizontaux le long de chaque ligne de rangée
  for (let r = 0; r < rows - 1; r++) {
    const yCenter = (r + 1) * cellHeight;
    const wallY = Math.max(0, yCenter - halfThick);
    const wallH = Math.min(height - wallY, wallThickness);
    const hRow = horizontalWalls[r];

    let startC = -1;
    for (let c = 0; c <= cols; c++) {
      const hasWall = c < cols && hRow ? (hRow[c] ?? false) : false;
      if (hasWall) {
        if (startC === -1) startC = c;
      } else if (startC !== -1) {
        const endC = c - 1;
        const xLeft = Math.max(0, startC * cellWidth - (startC > 0 ? halfThick : 0));
        const xRight = Math.min(width, (endC + 1) * cellWidth + (endC < cols - 1 ? halfThick : 0));
        const wallW = xRight - xLeft;

        if (wallW > 0 && wallH > 0) {
          walls.push({
            x: xLeft,
            y: wallY,
            width: wallW,
            height: wallH,
          });
        }
        startC = -1;
      }
    }
  }

  // Points de contrôle pour le test de connexité : centres de toutes les cellules
  const checkPoints: Vec2[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      checkPoints.push({
        x: (c + 0.5) * cellWidth,
        y: (r + 0.5) * cellHeight,
      });
    }
  }

  // Vérification de la connexité de l'espace navigable dilaté par floodfill
  const verification = verifyMazeConnectivity({
    width,
    height,
    walls,
    tankRadius,
    checkPoints,
  });

  if (!verification.connected) {
    throw new Error(
      `Échec de connexité du labyrinthe généré (seed=${seed}, taille=${width}x${height}): ${verification.unreachablePoints.length} points de contrôle inatteignables.`,
    );
  }

  return {
    walls,
    grid: {
      cols,
      rows,
      cellWidth,
      cellHeight,
    },
    resolvedOptions: {
      width,
      height,
      seed,
      tankRadius,
      cellSize,
      wallThickness,
      loopFactor,
    },
  };
}

/**
 * Point d'entrée principal pour la génération de murs de labyrinthe (Maze).
 * Retourne directement la liste des rectangles partagés `Rect[]`,
 * prête à être assignée à `ModeConfig.map.walls`.
 */
export function generateMaze(options: MazeOptions): Rect[] {
  return generateMazeLayout(options).walls;
}

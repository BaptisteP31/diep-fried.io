import type { ModeConfig, Rect, TeamId, Vec2 } from '@diep-fried/shared';
import { circleVsWalls, sweepCircleVsWalls } from '../maps/collision';

const CELL_SIZE = 160;
const TANK_RADIUS = 25;
const SAFETY_MARGIN = 8;
const PROBE_RADIUS = TANK_RADIUS + SAFETY_MARGIN;

export function getObstaclesForTeam(config: ModeConfig, team: TeamId): Rect[] {
  const obstacles: Rect[] = [...config.map.walls];
  for (const zone of config.map.zones) {
    if (zone.kind === 'base' && zone.team !== 0 && zone.team !== team) {
      obstacles.push(zone.area);
    }
  }
  return obstacles;
}

export function isPathClear(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  obstacles: readonly Rect[],
): boolean {
  if (obstacles.length === 0) return true;
  const hit = sweepCircleVsWalls(fromX, fromY, toX, toY, radius, obstacles);
  return !hit.hit;
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number = CELL_SIZE;
  private readonly walkable: Uint8Array;

  constructor(
    private readonly arena: { width: number; height: number },
    private readonly obstacles: readonly Rect[],
  ) {
    this.cols = Math.max(1, Math.ceil(arena.width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(arena.height / this.cellSize));
    this.walkable = new Uint8Array(this.cols * this.rows);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cx = (c + 0.5) * this.cellSize;
        const cy = (r + 0.5) * this.cellSize;
        if (
          cx - PROBE_RADIUS < 0 ||
          cx + PROBE_RADIUS > arena.width ||
          cy - PROBE_RADIUS < 0 ||
          cy + PROBE_RADIUS > arena.height
        ) {
          this.walkable[r * this.cols + c] = 0;
        } else if (circleVsWalls(cx, cy, PROBE_RADIUS, obstacles)) {
          this.walkable[r * this.cols + c] = 0;
        } else {
          this.walkable[r * this.cols + c] = 1;
        }
      }
    }
  }

  isCellWalkable(c: number, r: number): boolean {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    return (this.walkable[r * this.cols + c] ?? 0) === 1;
  }

  findWaypoints(from: Vec2, to: Vec2, maxExpansions = 200): Vec2[] {
    if (this.obstacles.length === 0) return [to];
    if (isPathClear(from.x, from.y, to.x, to.y, PROBE_RADIUS, this.obstacles)) {
      return [to];
    }

    const startC = Math.max(0, Math.min(this.cols - 1, Math.floor(from.x / this.cellSize)));
    const startR = Math.max(0, Math.min(this.rows - 1, Math.floor(from.y / this.cellSize)));
    const goalC = Math.max(0, Math.min(this.cols - 1, Math.floor(to.x / this.cellSize)));
    const goalR = Math.max(0, Math.min(this.rows - 1, Math.floor(to.y / this.cellSize)));

    const startIndex = startR * this.cols + startC;
    const goalIndex = goalR * this.cols + goalC;

    if (startIndex === goalIndex) return [to];

    const openSet: number[] = [startIndex];
    const cameFrom = new Int32Array(this.cols * this.rows).fill(-1);
    const gScore = new Float32Array(this.cols * this.rows).fill(Infinity);
    const fScore = new Float32Array(this.cols * this.rows).fill(Infinity);

    gScore[startIndex] = 0;
    fScore[startIndex] = Math.hypot(goalC - startC, goalR - startR);

    const closedSet = new Uint8Array(this.cols * this.rows);

    let expansions = 0;
    let closestIndex = startIndex;
    let closestDist = fScore[startIndex] ?? Infinity;

    while (openSet.length > 0 && expansions++ < maxExpansions) {
      let lowestF = Infinity;
      let lowestIdx = -1;
      let lowestOpenIdx = -1;

      for (let i = 0; i < openSet.length; i++) {
        const idx = openSet[i]!;
        const f = fScore[idx] ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          lowestIdx = idx;
          lowestOpenIdx = i;
        }
      }

      const current = lowestIdx;
      if (current === goalIndex) {
        closestIndex = current;
        break;
      }

      openSet.splice(lowestOpenIdx, 1);
      closedSet[current] = 1;

      const cR = Math.floor(current / this.cols);
      const cC = current % this.cols;

      const h = Math.hypot(goalC - cC, goalR - cR);
      if (h < closestDist) {
        closestDist = h;
        closestIndex = current;
      }

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cR + dr;
          const nc = cC + dc;
          if (!this.isCellWalkable(nc, nr)) continue;

          const neighborIndex = nr * this.cols + nc;
          if (closedSet[neighborIndex] === 1) continue;

          // Corner cutting prevention for diagonals
          if (dr !== 0 && dc !== 0) {
            if (!this.isCellWalkable(cC + dc, cR) || !this.isCellWalkable(cC, cR + dr)) {
              continue;
            }
          }

          const moveCost = dr === 0 || dc === 0 ? 1 : 1.414;
          const tentativeG = (gScore[current] ?? 0) + moveCost;

          if (tentativeG < (gScore[neighborIndex] ?? Infinity)) {
            cameFrom[neighborIndex] = current;
            gScore[neighborIndex] = tentativeG;
            const neighborH = Math.hypot(goalC - nc, goalR - nr);
            fScore[neighborIndex] = tentativeG + neighborH;

            if (!openSet.includes(neighborIndex)) {
              openSet.push(neighborIndex);
            }
          }
        }
      }
    }

    const path: Vec2[] = [];
    let curr = closestIndex;
    while (curr !== startIndex && curr !== -1) {
      const r = Math.floor(curr / this.cols);
      const c = curr % this.cols;
      path.push({ x: (c + 0.5) * this.cellSize, y: (r + 0.5) * this.cellSize });
      curr = cameFrom[curr] ?? -1;
    }
    path.reverse();
    path.push(to);

    return path;
  }
}

const ANGULAR_OFFSETS = [
  0,
  Math.PI / 12,
  -Math.PI / 12,
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 3,
  -Math.PI / 3,
  (5 * Math.PI) / 12,
  -(5 * Math.PI) / 12,
  Math.PI / 2,
  -Math.PI / 2,
  (2 * Math.PI) / 3,
  -(2 * Math.PI) / 3,
  (3 * Math.PI) / 4,
  -(3 * Math.PI) / 4,
  (5 * Math.PI) / 6,
  -(5 * Math.PI) / 6,
  Math.PI,
];

export function steerAroundObstacles(
  current: { x: number; y: number; radius: number },
  destination: Vec2,
  obstacles: readonly Rect[],
  arena: { width: number; height: number },
): Vec2 {
  const dx = destination.x - current.x;
  const dy = destination.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return { x: 0, y: 0 };

  const baseAngle = Math.atan2(dy, dx);
  const lookahead = Math.min(dist, 160);
  const radius = current.radius + SAFETY_MARGIN;

  for (const offset of ANGULAR_OFFSETS) {
    const angle = baseAngle + offset;
    const probeX = current.x + Math.cos(angle) * lookahead;
    const probeY = current.y + Math.sin(angle) * lookahead;

    if (
      probeX - radius < 0 ||
      probeX + radius > arena.width ||
      probeY - radius < 0 ||
      probeY + radius > arena.height
    ) {
      continue;
    }

    if (isPathClear(current.x, current.y, probeX, probeY, radius, obstacles)) {
      return {
        x: Math.cos(angle),
        y: Math.sin(angle),
      };
    }
  }

  // Fallback: move along baseAngle anyway if completely enclosed
  return { x: Math.cos(baseAngle), y: Math.sin(baseAngle) };
}

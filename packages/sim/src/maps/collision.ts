import type { Rect } from '@diep-fried/shared';
import type { Circle, CircleWallResolution, SweptCircleHit } from './types';

/**
 * Teste si un cercle intersecte un rectangle de mur (AABB).
 * Compatible avec les coordonnées scalaires ou un objet Circle.
 */
export function circleVsWall(
  circleOrX: Circle | number,
  wallOrY: Rect | number,
  radiusOrWall?: number | Rect,
  maybeWall?: Rect,
): boolean {
  let cx: number;
  let cy: number;
  let cr: number;
  let wall: Rect;

  if (typeof circleOrX === 'object' && circleOrX !== null) {
    cx = circleOrX.x;
    cy = circleOrX.y;
    cr = circleOrX.radius;
    wall = wallOrY as Rect;
  } else {
    cx = circleOrX as number;
    cy = wallOrY as number;
    cr = radiusOrWall as number;
    wall = maybeWall as Rect;
  }

  // Point le plus proche sur le rectangle AABB
  const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.width));
  const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.height));

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  return distSq < cr * cr;
}

/**
 * Teste si un cercle intersecte au moins un mur parmi une collection.
 */
export function circleVsWalls(
  cx: number,
  cy: number,
  radius: number,
  walls: readonly Rect[],
): boolean {
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    if (wall && circleVsWall(cx, cy, radius, wall)) {
      return true;
    }
  }
  return false;
}

/**
 * Résout la collision entre un cercle et un mur en repoussant le cercle
 * le long du vecteur de pénétration minimal (faces ou coins arrondis).
 */
export function resolveCircleVsWall(
  cx: number,
  cy: number,
  radius: number,
  wall: Rect,
): CircleWallResolution {
  const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.width));
  const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.height));

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  // Cas 1 : Pas de collision
  if (
    distSq >= radius * radius &&
    (cx < wall.x || cx > wall.x + wall.width || cy < wall.y || cy > wall.y + wall.height)
  ) {
    return {
      x: cx,
      y: cy,
      collided: false,
      normalX: 0,
      normalY: 0,
      depth: 0,
    };
  }

  // Cas 2 : Le centre du cercle est strictement à l'intérieur du rectangle
  if (cx >= wall.x && cx <= wall.x + wall.width && cy >= wall.y && cy <= wall.y + wall.height) {
    const leftDist = cx - wall.x;
    const rightDist = wall.x + wall.width - cx;
    const topDist = cy - wall.y;
    const bottomDist = wall.y + wall.height - cy;

    const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

    if (minDist === leftDist) {
      const depth = radius + leftDist;
      return {
        x: wall.x - radius,
        y: cy,
        collided: true,
        normalX: -1,
        normalY: 0,
        depth,
      };
    } else if (minDist === rightDist) {
      const depth = radius + rightDist;
      return {
        x: wall.x + wall.width + radius,
        y: cy,
        collided: true,
        normalX: 1,
        normalY: 0,
        depth,
      };
    } else if (minDist === topDist) {
      const depth = radius + topDist;
      return {
        x: cx,
        y: wall.y - radius,
        collided: true,
        normalX: 0,
        normalY: -1,
        depth,
      };
    } else {
      const depth = radius + bottomDist;
      return {
        x: cx,
        y: wall.y + wall.height + radius,
        collided: true,
        normalX: 0,
        normalY: 1,
        depth,
      };
    }
  }

  // Cas 3 : Le centre est à l'extérieur mais à une distance < radius (face ou coin)
  const dist = Math.sqrt(distSq);
  if (dist === 0) {
    // Cas dégénéré (sur un bord exact)
    return {
      x: cx,
      y: cy - radius,
      collided: true,
      normalX: 0,
      normalY: -1,
      depth: radius,
    };
  }

  const normalX = dx / dist;
  const normalY = dy / dist;
  const depth = radius - dist;

  return {
    x: closestX + normalX * radius,
    y: closestY + normalY * radius,
    collided: true,
    normalX,
    normalY,
    depth,
  };
}

/**
 * Résout itérativement la position d'un cercle contre plusieurs murs
 * pour gérer naturellement les jonctions de murs et les angles rentrants.
 */
export function resolveCircleVsWalls(
  cx: number,
  cy: number,
  radius: number,
  walls: readonly Rect[],
  iterations = 3,
): { x: number; y: number; collided: boolean } {
  let currX = cx;
  let currY = cy;
  let anyCollision = false;

  for (let iter = 0; iter < iterations; iter++) {
    let resolvedInThisIter = false;
    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      if (!wall) continue;
      if (circleVsWall(currX, currY, radius, wall)) {
        const res = resolveCircleVsWall(currX, currY, radius, wall);
        if (res.collided) {
          currX = res.x;
          currY = res.y;
          anyCollision = true;
          resolvedInThisIter = true;
        }
      }
    }
    if (!resolvedInThisIter) break;
  }

  return { x: currX, y: currY, collided: anyCollision };
}

/**
 * Détection de collision continue (swept circle vs wall) pour prévenir
 * l'effet de traversée (tunneling) à haute vitesse.
 *
 * Équivalent géométrique : intersection d'un rayon P0 -> P1 avec la somme
 * de Minkowski du rectangle et d'un disque de rayon R (rectangle arrondi).
 */
export function sweepCircleVsWall(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
  wall: Rect,
): SweptCircleHit {
  // 1. Si le cercle est déjà en pénétration au départ (t = 0)
  if (circleVsWall(startX, startY, radius, wall)) {
    const res = resolveCircleVsWall(startX, startY, radius, wall);
    return {
      hit: true,
      time: 0,
      normalX: res.normalX,
      normalY: res.normalY,
      contactX: startX,
      contactY: startY,
    };
  }

  const vx = endX - startX;
  const vy = endY - startY;

  let earliestTime = 2; // Strictement > 1 pour marquer l'absence de hit
  let hitNormalX = 0;
  let hitNormalY = 0;

  // A. Intersection avec les 4 segments plats étendus par radius

  // Bord gauche (x = wall.x - radius, y dans [wall.y, wall.y + wall.height])
  if (vx > 0) {
    const targetX = wall.x - radius;
    const t = (targetX - startX) / vx;
    if (t >= 0 && t <= 1 && t < earliestTime) {
      const yAtT = startY + t * vy;
      if (yAtT >= wall.y && yAtT <= wall.y + wall.height) {
        earliestTime = t;
        hitNormalX = -1;
        hitNormalY = 0;
      }
    }
  }

  // Bord droit (x = wall.x + wall.width + radius)
  if (vx < 0) {
    const targetX = wall.x + wall.width + radius;
    const t = (targetX - startX) / vx;
    if (t >= 0 && t <= 1 && t < earliestTime) {
      const yAtT = startY + t * vy;
      if (yAtT >= wall.y && yAtT <= wall.y + wall.height) {
        earliestTime = t;
        hitNormalX = 1;
        hitNormalY = 0;
      }
    }
  }

  // Bord haut (y = wall.y - radius)
  if (vy > 0) {
    const targetY = wall.y - radius;
    const t = (targetY - startY) / vy;
    if (t >= 0 && t <= 1 && t < earliestTime) {
      const xAtT = startX + t * vx;
      if (xAtT >= wall.x && xAtT <= wall.x + wall.width) {
        earliestTime = t;
        hitNormalX = 0;
        hitNormalY = -1;
      }
    }
  }

  // Bord bas (y = wall.y + wall.height + radius)
  if (vy < 0) {
    const targetY = wall.y + wall.height + radius;
    const t = (targetY - startY) / vy;
    if (t >= 0 && t <= 1 && t < earliestTime) {
      const xAtT = startX + t * vx;
      if (xAtT >= wall.x && xAtT <= wall.x + wall.width) {
        earliestTime = t;
        hitNormalX = 0;
        hitNormalY = 1;
      }
    }
  }

  // B. Intersection avec les 4 coins arrondis (disques de rayon radius aux sommets)
  const corners: readonly (readonly [number, number])[] = [
    [wall.x, wall.y],
    [wall.x + wall.width, wall.y],
    [wall.x, wall.y + wall.height],
    [wall.x + wall.width, wall.y + wall.height],
  ];

  const vSq = vx * vx + vy * vy;
  if (vSq > 1e-12) {
    for (let i = 0; i < 4; i++) {
      const corner = corners[i];
      if (!corner) continue;
      const [cx, cy] = corner;
      const dx = startX - cx;
      const dy = startY - cy;

      const a = vSq;
      const b = 2 * (dx * vx + dy * vy);
      const c = dx * dx + dy * dy - radius * radius;

      const discr = b * b - 4 * a * c;
      if (discr >= 0) {
        const sqrtDiscr = Math.sqrt(discr);
        const t1 = (-b - sqrtDiscr) / (2 * a);
        if (t1 >= 0 && t1 <= 1 && t1 < earliestTime) {
          earliestTime = t1;
          const hitX = startX + t1 * vx;
          const hitY = startY + t1 * vy;
          const dist = Math.hypot(hitX - cx, hitY - cy);
          hitNormalX = dist > 1e-6 ? (hitX - cx) / dist : 0;
          hitNormalY = dist > 1e-6 ? (hitY - cy) / dist : -1;
        }
      }
    }
  }

  if (earliestTime <= 1) {
    return {
      hit: true,
      time: earliestTime,
      normalX: hitNormalX,
      normalY: hitNormalY,
      contactX: startX + earliestTime * vx,
      contactY: startY + earliestTime * vy,
    };
  }

  return {
    hit: false,
    time: 1,
    normalX: 0,
    normalY: 0,
    contactX: endX,
    contactY: endY,
  };
}

/**
 * Balayage continu d'un cercle contre une liste de murs, retournant le premier impact.
 */
export function sweepCircleVsWalls(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
  walls: readonly Rect[],
): SweptCircleHit & { wallIndex: number } {
  let earliestHit: SweptCircleHit = {
    hit: false,
    time: 1,
    normalX: 0,
    normalY: 0,
    contactX: endX,
    contactY: endY,
  };
  let bestWallIndex = -1;

  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    if (!wall) continue;
    const hit = sweepCircleVsWall(startX, startY, endX, endY, radius, wall);
    if (hit.hit && hit.time < earliestHit.time) {
      earliestHit = hit;
      bestWallIndex = i;
      if (hit.time === 0) break; // Impossible de frapper plus tôt
    }
  }

  return {
    ...earliestHit,
    wallIndex: bestWallIndex,
  };
}

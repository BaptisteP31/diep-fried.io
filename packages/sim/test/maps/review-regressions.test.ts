import type { Rect, Vec2 } from '@diep-fried/shared';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/rng';
import {
  circleVsWall,
  circleVsWalls,
  generateMazeLayout,
  generateTeamLayoutResult,
  MAZE_LIMITS,
  resolveCircleVsWalls,
  sweepCircleVsWall,
  sweepCircleVsWalls,
  verifyMazeConnectivity,
} from '../../src/maps';

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('Revue maps : collision', () => {
  const wall: Rect = { x: 100, y: 0, width: 30, height: 100 };

  it('sweepCircleVsWalls rapporte le même contact tangent à l’arrivée que sweepCircleVsWall', () => {
    // Le centre arrive à x = 75 : le cercle (r = 25) touche exactement la face gauche (x = 100).
    const single = sweepCircleVsWall(0, 50, 75, 50, 25, wall);
    const multi = sweepCircleVsWalls(0, 50, 75, 50, 25, [wall]);

    expect(single.hit).toBe(true);
    expect(single.time).toBe(1);
    expect(multi.hit).toBe(single.hit);
    expect(multi.time).toBe(single.time);
    expect(multi.wallIndex).toBe(0);
    expect(multi.normalX).toBe(-1);
  });

  it('sweepCircleVsWalls garde le premier mur en cas de contact simultané à l’arrivée', () => {
    const twin: Rect = { ...wall, y: 20 };
    const multi = sweepCircleVsWalls(0, 50, 75, 50, 25, [wall, twin]);
    expect(multi.hit).toBe(true);
    expect(multi.wallIndex).toBe(0);
  });

  it('un cercle qui s’arrête juste avant le mur ne touche pas, un cercle tangent au départ qui s’éloigne non plus', () => {
    expect(sweepCircleVsWalls(0, 50, 74.999, 50, 25, [wall]).hit).toBe(false);
    expect(sweepCircleVsWalls(75, 50, 0, 50, 25, [wall]).hit).toBe(false);
    // Glissement tangent le long de la face sans pénétration
    expect(sweepCircleVsWalls(75, -50, 75, 150, 25, [wall]).hit).toBe(true);
    expect(circleVsWall(75, 50, 25, wall)).toBe(false);
  });

  it('résolution itérative : nombre d’itérations invalide rejeté au lieu de boucler ou d’être ignoré', () => {
    const pinch: Rect[] = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 130, y: 0, width: 100, height: 100 },
    ];
    // Cercle plus large que l’espace entre deux murs : jamais résolu, Infinity bouclerait sans fin.
    expect(() => resolveCircleVsWalls(115, 50, 30, pinch, Infinity)).toThrow(RangeError);
    expect(() => resolveCircleVsWalls(115, 50, 30, pinch, NaN)).toThrow(RangeError);
    expect(() => resolveCircleVsWalls(115, 50, 30, pinch, 0)).toThrow(RangeError);
    expect(() => resolveCircleVsWalls(115, 50, 30, pinch, 1.5)).toThrow(RangeError);
    expect(() =>
      resolveCircleVsWalls(115, 50, 30, pinch, MAZE_LIMITS.maxResolveIterations + 1),
    ).toThrow(RangeError);
    expect(() =>
      resolveCircleVsWalls(115, 50, 30, pinch, MAZE_LIMITS.maxResolveIterations),
    ).not.toThrow();
  });
});

describe('Revue maps : floodfill borné', () => {
  it('rejette proprement les pas d’échantillonnage et dimensions invalides', () => {
    for (const sampleStep of [0, -5, NaN, Infinity]) {
      expect(() =>
        verifyMazeConnectivity({ width: 1000, height: 1000, walls: [], sampleStep }),
      ).toThrow(RangeError);
    }
    expect(() => verifyMazeConnectivity({ width: NaN, height: 1000, walls: [] })).toThrow(
      RangeError,
    );
    expect(() => verifyMazeConnectivity({ width: 1000, height: -1, walls: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      verifyMazeConnectivity({ width: 1000, height: 1000, walls: [], tankRadius: NaN }),
    ).toThrow(RangeError);
    expect(() =>
      verifyMazeConnectivity({ width: 1000, height: 1000, walls: [], tankRadius: 0 }),
    ).toThrow(RangeError);
  });

  it('rejette vite un échantillonnage qui dépasserait le budget de cellules (petit rayon, immense arène)', () => {
    const started = Date.now();
    expect(() =>
      verifyMazeConnectivity({ width: 50_000, height: 50_000, walls: [], tankRadius: 0.001 }),
    ).toThrow(RangeError);
    expect(() =>
      verifyMazeConnectivity({ width: 50_000, height: 50_000, walls: [], sampleStep: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      verifyMazeConnectivity({ width: 1e9, height: 1e9, walls: [], sampleStep: 1 }),
    ).toThrow(RangeError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rejette un nombre de murs ou de points de contrôle au-delà des limites', () => {
    const wallsTooMany: Rect[] = new Array(MAZE_LIMITS.maxFloodfillWalls + 1).fill({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(() =>
      verifyMazeConnectivity({ width: 1000, height: 1000, walls: wallsTooMany }),
    ).toThrow(RangeError);
    const pointsTooMany: Vec2[] = new Array(MAZE_LIMITS.maxFloodfillCheckPoints + 1).fill({
      x: 500,
      y: 500,
    });
    expect(() =>
      verifyMazeConnectivity({ width: 1000, height: 1000, walls: [], checkPoints: pointsTooMany }),
    ).toThrow(RangeError);
  });

  it('accepte la limite exacte de cellules documentée sans allocation démesurée', () => {
    // ~ 2000 x 2000 cellules : à la limite du budget, sans murs
    const report = verifyMazeConnectivity({
      width: 50_000,
      height: 50_000,
      walls: [],
      tankRadius: 25,
    });
    expect(report.connected).toBe(true);
    expect(report.totalPassableCount).toBeLessThanOrEqual(MAZE_LIMITS.maxFloodfillCells);
  });

  it('classe les cellules comme une recherche exhaustive sur tous les murs (index spatial équivalent)', () => {
    const rng = new Rng(2024);
    for (let trial = 0; trial < 6; trial++) {
      const width = 1500;
      const height = 1100;
      const tankRadius = rng.range(5, 40);
      const walls: Rect[] = [];
      const count = rng.int(5, 120);
      for (let i = 0; i < count; i++) {
        // Murs fins/longs, y compris débordant de l’arène
        const horizontal = rng.next() < 0.5;
        walls.push({
          x: rng.range(-100, width),
          y: rng.range(-100, height),
          width: horizontal ? rng.range(50, 900) : rng.range(5, 40),
          height: horizontal ? rng.range(5, 40) : rng.range(50, 900),
        });
      }
      const sampleStep = 20;
      const report = verifyMazeConnectivity({ width, height, walls, tankRadius, sampleStep });

      const minX = tankRadius;
      const minY = tankRadius;
      const cols = Math.floor((width - 2 * tankRadius) / sampleStep) + 1;
      const rows = Math.floor((height - 2 * tankRadius) / sampleStep) + 1;
      let expected = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!circleVsWalls(minX + c * sampleStep, minY + r * sampleStep, tankRadius, walls))
            expected++;
        }
      }
      expect(report.totalPassableCount).toBe(expected);
    }
  });

  it('points de contrôle non finis ou hors arène : inatteignables, sans exception ni faux positif', () => {
    const report = verifyMazeConnectivity({
      width: 1000,
      height: 1000,
      walls: [],
      checkPoints: [
        { x: 500, y: 500 },
        { x: NaN, y: 500 },
        { x: 500, y: Infinity },
      ],
    });
    expect(report.unreachablePoints).toEqual([
      { x: NaN, y: 500 },
      { x: 500, y: Infinity },
    ]);
    expect(report.connected).toBe(false);
  });
});

describe('Revue maps : génération de labyrinthe', () => {
  it('génère une grille 200x200 (arène max) en temps borné', { timeout: 60_000 }, () => {
    const layout = generateMazeLayout({ width: 50_000, height: 50_000, seed: 5 });
    expect(layout.grid.cols).toBe(200);
    expect(layout.walls.length).toBeGreaterThan(0);
  });

  it('rejette tôt une configuration dont la vérification dépasserait le budget', () => {
    const started = Date.now();
    expect(() =>
      generateMazeLayout({
        width: 50_000,
        height: 50_000,
        seed: 1,
        tankRadius: 2,
        cellSize: 250,
        // passage = 15, bande libre du centre = 11 : pas <= 5.5 requis, donc > 80 M cellules
        wallThickness: 235,
      }),
    ).toThrow(RangeError);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('corridors minimaux (cellule = diamètre + dégagement + mur) : générés et connexes sur de nombreuses graines', () => {
    // free band = 90 - 30 - 50 = 10 < pas d’échantillonnage par défaut (25)
    for (let seed = 0; seed < 40; seed++) {
      const layout = generateMazeLayout({
        width: 900,
        height: 900,
        seed,
        tankRadius: 25,
        cellSize: 90,
        wallThickness: 30,
        loopFactor: seed % 3 === 0 ? 0 : 0.2,
      });
      expect(layout.grid.cols).toBe(10);
    }
  });

  it('connexité sur de nombreuses graines et combinaisons d’options autorisées', () => {
    const loops = [0, 0.2, 1];
    const sizes = [
      { width: 1200, height: 1200, cellSize: 200 },
      { width: 3000, height: 2000, cellSize: 250 },
      { width: 800, height: 2400, cellSize: 130, tankRadius: 20, wallThickness: 24 },
    ];
    for (const size of sizes) {
      for (const loopFactor of loops) {
        for (let seed = 1; seed <= 15; seed++) {
          const layout = generateMazeLayout({ ...size, seed: seed * 7919, loopFactor });
          const cp: Vec2[] = [];
          for (let r = 0; r < layout.grid.rows; r++) {
            for (let c = 0; c < layout.grid.cols; c++) {
              cp.push({
                x: (c + 0.5) * layout.grid.cellWidth,
                y: (r + 0.5) * layout.grid.cellHeight,
              });
            }
          }
          const check = verifyMazeConnectivity({
            width: size.width,
            height: size.height,
            walls: layout.walls,
            tankRadius: layout.resolvedOptions.tankRadius,
            sampleStep: 8,
            checkPoints: cp,
          });
          expect(check.unreachablePoints).toHaveLength(0);
          expect(check.coverageFraction).toBeGreaterThanOrEqual(0.95);
        }
      }
    }
  });

  it('connexité avec bases d’équipes (2 et 4) réservées, y compris spawn = base (spawnMargin 0)', () => {
    for (const teamCount of [2, 4] as const) {
      for (const spawnMargin of [0, 40]) {
        for (let seed = 1; seed <= 10; seed++) {
          const width = 3000;
          const height = 3000;
          const teams = generateTeamLayoutResult(width, height, teamCount, { spawnMargin });
          const reservedZones = teams.teams.map((t) => t.baseArea);
          const layout = generateMazeLayout({ width, height, seed, reservedZones });

          for (const t of teams.teams) {
            for (const w of layout.walls) {
              expect(overlaps(w, t.spawnArea)).toBe(false);
              expect(overlaps(w, t.baseArea)).toBe(false);
            }
          }

          const spawnCenters: Vec2[] = teams.teams.map((t) => ({
            x: t.spawnArea.x + t.spawnArea.width / 2,
            y: t.spawnArea.y + t.spawnArea.height / 2,
          }));
          const check = verifyMazeConnectivity({
            width,
            height,
            walls: layout.walls,
            tankRadius: layout.resolvedOptions.tankRadius,
            sampleStep: 25,
            checkPoints: spawnCenters,
          });
          expect(check.unreachablePoints).toHaveLength(0);
        }
      }
    }
  });

  it('Rng.int est inclusif aux deux bornes (contrat utilisé par le mélange de Fisher-Yates)', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(0, 5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('Revue maps : zones réservées', () => {
  it('aucun mur ne chevauche une zone, même quand elle s’arrête à moins d’une demi-épaisseur de la frontière de cellule', () => {
    // cellules de 250 : la zone s’arrête à 495, le mur à x = 500 couvre [485, 515]
    const zone: Rect = { x: 0, y: 0, width: 495, height: 3000 };
    for (let seed = 1; seed <= 20; seed++) {
      const { walls } = generateMazeLayout({
        width: 3000,
        height: 3000,
        seed,
        reservedZones: [zone],
      });
      expect(walls.filter((w) => overlaps(w, zone))).toEqual([]);
    }
  });

  it('aucun mur n’empiète sur deux zones adjacentes de cellules différentes', () => {
    const a: Rect = { x: 250, y: 250, width: 250, height: 250 };
    const b: Rect = { x: 500, y: 250, width: 250, height: 250 };
    for (let seed = 1; seed <= 10; seed++) {
      const { walls } = generateMazeLayout({
        width: 3000,
        height: 3000,
        seed,
        reservedZones: [a, b],
      });
      expect(walls.filter((w) => overlaps(w, a) || overlaps(w, b))).toEqual([]);
    }
  });

  it('indices de zones > 127 : la zone n°255 reste une zone réservée (pas de repli Int8 vers le sentinelle)', () => {
    const filler: Rect[] = Array.from({ length: 255 }, (_, i) => ({
      x: -5000 - i * 10,
      y: -5000,
      width: 5,
      height: 5,
    }));
    const big: Rect = { x: 500, y: 500, width: 1000, height: 1000 };
    const reservedZones = [...filler, big];
    expect(reservedZones).toHaveLength(MAZE_LIMITS.maxReservedZones);

    const { walls } = generateMazeLayout({ width: 3000, height: 3000, seed: 77, reservedZones });
    expect(walls.filter((w) => overlaps(w, big))).toEqual([]);
  });

  it('rejette un trop grand nombre de zones et les zones mal formées', () => {
    const base = { width: 3000, height: 3000, seed: 1 };
    const tooMany: Rect[] = Array.from({ length: MAZE_LIMITS.maxReservedZones + 1 }, (_, i) => ({
      x: i,
      y: 0,
      width: 1,
      height: 1,
    }));
    expect(() => generateMazeLayout({ ...base, reservedZones: tooMany })).toThrow(RangeError);

    const bad: Rect[] = [
      { x: NaN, y: 0, width: 10, height: 10 },
      { x: 0, y: Infinity, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 0, y: 0, width: 10, height: -5 },
    ];
    for (const zone of bad) {
      expect(() => generateMazeLayout({ ...base, reservedZones: [zone] })).toThrow(RangeError);
    }
    expect(() =>
      generateMazeLayout({ ...base, reservedZones: 'nope' as unknown as readonly Rect[] }),
    ).toThrow(TypeError);
  });
});

describe('Revue maps : bases d’équipes et spawnMargin', () => {
  it('2 équipes : rejette un spawnMargin qui annule ou inverse la hauteur de la zone de spawn', () => {
    // baseWidth = 450 > 2 * 210, mais height = 400 < 2 * 210 → hauteur de spawn négative
    expect(() => generateTeamLayoutResult(3000, 400, 2, { spawnMargin: 210 })).toThrow();
    // hauteur exactement nulle
    expect(() => generateTeamLayoutResult(3000, 400, 2, { spawnMargin: 200 })).toThrow();
  });

  it('toutes les zones de spawn valides ont des dimensions strictement positives et incluses dans leur base', () => {
    const rng = new Rng(99);
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const width = rng.int(400, 6000);
      const height = rng.int(400, 6000);
      const teamCount = rng.next() < 0.5 ? 2 : 4;
      const baseSizeRatio = rng.range(0.02, 0.49);
      const spawnMargin = rng.range(0, 400);
      let layout;
      try {
        layout = generateTeamLayoutResult(width, height, teamCount, { baseSizeRatio, spawnMargin });
      } catch {
        continue;
      }
      accepted++;
      for (const t of layout.teams) {
        expect(t.spawnArea.width).toBeGreaterThan(0);
        expect(t.spawnArea.height).toBeGreaterThan(0);
        expect(t.spawnArea.x).toBeGreaterThanOrEqual(t.baseArea.x);
        expect(t.spawnArea.y).toBeGreaterThanOrEqual(t.baseArea.y);
        expect(t.spawnArea.x + t.spawnArea.width).toBeLessThanOrEqual(
          t.baseArea.x + t.baseArea.width,
        );
        expect(t.spawnArea.y + t.spawnArea.height).toBeLessThanOrEqual(
          t.baseArea.y + t.baseArea.height,
        );
      }
    }
    expect(accepted).toBeGreaterThan(20);
  });

  it('spawnMargin 0 : la zone de spawn coïncide avec la base', () => {
    const layout = generateTeamLayoutResult(3000, 3000, 4, { spawnMargin: 0 });
    for (const t of layout.teams) expect(t.spawnArea).toEqual(t.baseArea);
  });
});

import { describe, expect, it } from 'vitest';
import { generateMaze, generateMazeLayout, MAZE_LIMITS, type MazeOptions } from '../../src/maps';

describe('Maze generator (generateMaze & generateMazeLayout)', () => {
  const standardOptions: MazeOptions = {
    width: 3000,
    height: 3000,
    seed: 1337,
    tankRadius: 25,
    cellSize: 250,
  };

  it('génère des murs de manière 100% déterministe pour une même graine', () => {
    const walls1 = generateMaze(standardOptions);
    const walls2 = generateMaze(standardOptions);

    expect(walls1.length).toBeGreaterThan(0);
    expect(walls1).toEqual(walls2);

    // Une graine différente doit produire un agencement différent
    const wallsDiffSeed = generateMaze({
      ...standardOptions,
      seed: 9999,
    });
    expect(wallsDiffSeed).not.toEqual(walls1);
  });

  it('place tous les murs strictement à l’intérieur des limites de l’arène', () => {
    const layout = generateMazeLayout(standardOptions);
    const { walls, resolvedOptions } = layout;
    const { width, height } = resolvedOptions;

    expect(walls.length).toBeGreaterThan(0);

    for (const wall of walls) {
      expect(wall.x).toBeGreaterThanOrEqual(0);
      expect(wall.y).toBeGreaterThanOrEqual(0);
      expect(wall.x + wall.width).toBeLessThanOrEqual(width + 1e-6);
      expect(wall.y + wall.height).toBeLessThanOrEqual(height + 1e-6);
      expect(wall.width).toBeGreaterThan(0);
      expect(wall.height).toBeGreaterThan(0);
    }
  });

  it('garantit des corridors praticables strictement supérieurs au diamètre du tank', () => {
    const tankRadius = 35;
    const wallThickness = 40;
    const cellSize = 300;

    const layout = generateMazeLayout({
      width: 3000,
      height: 3000,
      seed: 42,
      tankRadius,
      wallThickness,
      cellSize,
    });

    const passageX = layout.grid.cellWidth - wallThickness;
    const passageY = layout.grid.cellHeight - wallThickness;
    const tankDiameter = tankRadius * 2;

    expect(passageX).toBeGreaterThanOrEqual(tankDiameter + MAZE_LIMITS.minClearance);
    expect(passageY).toBeGreaterThanOrEqual(tankDiameter + MAZE_LIMITS.minClearance);
  });

  it('fusionne les segments de murs colinéaires consécutifs pour optimiser la géométrie', () => {
    // Avec loopFactor = 0 (arbre strict), de nombreuses parois s'étendent sur plusieurs cellules
    const layout = generateMazeLayout({
      width: 2000,
      height: 2000,
      seed: 777,
      cellSize: 200,
      loopFactor: 0,
    });

    // S'il n'y avait pas de fusion, chaque mur aurait pour dimension maximale cellSize
    const hasMergedWall = layout.walls.some(
      (w) => w.width > layout.grid.cellWidth + 1 || w.height > layout.grid.cellHeight + 1,
    );
    expect(hasMergedWall).toBe(true);
  });

  it('intègre un loopFactor créant des boucles supplémentaires par rapport à un arbre pur', () => {
    const pureTree = generateMaze({
      width: 2500,
      height: 2500,
      seed: 12345,
      cellSize: 250,
      loopFactor: 0,
    });

    const braidedMaze = generateMaze({
      width: 2500,
      height: 2500,
      seed: 12345,
      cellSize: 250,
      loopFactor: 0.4,
    });

    // Un labyrinthe avec boucles a retiré davantage de murs qu'un arbre couvrant strict
    expect(braidedMaze.length).toBeLessThan(pureTree.length);
  });

  it('respecte les zones réservées sans placer de murs à l’intérieur', () => {
    const reservedZone = { x: 500, y: 500, width: 600, height: 600 };

    const walls = generateMaze({
      width: 3000,
      height: 3000,
      seed: 888,
      reservedZones: [reservedZone],
    });

    // Aucun mur ne doit être entièrement contenu dans la zone réservée
    const insideWalls = walls.filter(
      (w) =>
        w.x >= reservedZone.x &&
        w.x + w.width <= reservedZone.x + reservedZone.width &&
        w.y >= reservedZone.y &&
        w.y + w.height <= reservedZone.y + reservedZone.height,
    );

    expect(insideWalls.length).toBe(0);
  });

  describe('Rejet propre des configurations invalides ou impossibles', () => {
    it('rejette les dimensions négatives, nulles ou non finies', () => {
      expect(() => generateMaze({ width: -100, height: 3000, seed: 1 })).toThrow(TypeError);
      expect(() => generateMaze({ width: 3000, height: 0, seed: 1 })).toThrow(TypeError);
      expect(() => generateMaze({ width: NaN, height: 3000, seed: 1 })).toThrow(TypeError);
      expect(() => generateMaze({ width: Infinity, height: 3000, seed: 1 })).toThrow(TypeError);
    });

    it('rejette les graines non finies', () => {
      expect(() => generateMaze({ width: 3000, height: 3000, seed: NaN })).toThrow(TypeError);
      expect(() => generateMaze({ width: 3000, height: 3000, seed: Infinity })).toThrow(TypeError);
    });

    it('rejette les dimensions d’arène sous le seuil minimal praticable', () => {
      expect(() =>
        generateMaze({
          width: MAZE_LIMITS.minArenaDimension - 1,
          height: 3000,
          seed: 1,
        }),
      ).toThrow(RangeError);
    });

    it('rejette les rayons de tank impossibles', () => {
      expect(() =>
        generateMaze({
          ...standardOptions,
          tankRadius: 0,
        }),
      ).toThrow(RangeError);

      expect(() =>
        generateMaze({
          ...standardOptions,
          tankRadius: -10,
        }),
      ).toThrow(RangeError);
    });

    it('rejette les tailles de cellules inférieures au diamètre du tank plus l’épaisseur des murs', () => {
      expect(() =>
        generateMaze({
          width: 3000,
          height: 3000,
          seed: 1,
          tankRadius: 50, // Diamètre = 100
          wallThickness: 30,
          cellSize: 120, // Trop petit (100 + 30 + minClearance = 140)
        }),
      ).toThrow(RangeError);
    });

    it('rejette les facteurs de boucles hors de [0, 1]', () => {
      expect(() =>
        generateMaze({
          ...standardOptions,
          loopFactor: -0.1,
        }),
      ).toThrow(RangeError);

      expect(() =>
        generateMaze({
          ...standardOptions,
          loopFactor: 1.5,
        }),
      ).toThrow(RangeError);
    });
  });
});

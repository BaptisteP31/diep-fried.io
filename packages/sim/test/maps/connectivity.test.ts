import type { Vec2 } from '@diep-fried/shared';
import { describe, expect, it } from 'vitest';
import {
  generateMaze,
  generateMazeLayout,
  generateTeamLayoutResult,
  verifyMazeConnectivity,
} from '../../src/maps';

describe('Maze connectivity & floodfill in dilated configuration space', () => {
  const tankRadius = 25;

  it('vérifie la connexité 100% de l’espace navigable sur plusieurs graines en mode standard', () => {
    const seeds = [42, 100, 2026, 99999];

    for (const seed of seeds) {
      const layout = generateMazeLayout({
        width: 2500,
        height: 2500,
        seed,
        tankRadius,
        cellSize: 250,
      });

      const cellW = layout.grid.cellWidth;
      const cellH = layout.grid.cellHeight;

      // Échantillonner les centres de toutes les cellules de la grille
      const checkPoints: Vec2[] = [];
      for (let r = 0; r < layout.grid.rows; r++) {
        for (let c = 0; c < layout.grid.cols; c++) {
          checkPoints.push({
            x: (c + 0.5) * cellW,
            y: (r + 0.5) * cellH,
          });
        }
      }

      const report = verifyMazeConnectivity({
        width: 2500,
        height: 2500,
        walls: layout.walls,
        tankRadius,
        sampleStep: 25,
        checkPoints,
      });

      expect(report.connected).toBe(true);
      expect(report.unreachablePoints).toHaveLength(0);
      expect(report.coverageFraction).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('garantit un chemin praticable entre les bases en mode 2 équipes avec labyrinthe', () => {
    const width = 3000;
    const height = 3000;
    const teamLayout = generateTeamLayoutResult(width, height, 2);

    const baseZones = teamLayout.teams.map((t) => t.baseArea);

    const walls = generateMaze({
      width,
      height,
      seed: 555,
      tankRadius,
      cellSize: 250,
      reservedZones: baseZones,
    });

    // Points de spawn des 2 équipes
    const spawnPoints: Vec2[] = [
      {
        x: teamLayout.teams[0]!.spawnArea.x + teamLayout.teams[0]!.spawnArea.width / 2,
        y: teamLayout.teams[0]!.spawnArea.y + teamLayout.teams[0]!.spawnArea.height / 2,
      },
      {
        x: teamLayout.teams[1]!.spawnArea.x + teamLayout.teams[1]!.spawnArea.width / 2,
        y: teamLayout.teams[1]!.spawnArea.y + teamLayout.teams[1]!.spawnArea.height / 2,
      },
    ];

    const report = verifyMazeConnectivity({
      width,
      height,
      walls,
      tankRadius,
      sampleStep: 30,
      checkPoints: spawnPoints,
    });

    expect(report.connected).toBe(true);
    expect(report.unreachablePoints).toHaveLength(0);
  });

  it('garantit des chemins praticables entre toutes les bases en mode 4 équipes avec labyrinthe', () => {
    const width = 3500;
    const height = 3500;
    const teamLayout = generateTeamLayoutResult(width, height, 4);

    const baseZones = teamLayout.teams.map((t) => t.baseArea);

    const walls = generateMaze({
      width,
      height,
      seed: 8888,
      tankRadius,
      cellSize: 250,
      reservedZones: baseZones,
    });

    const spawnPoints: Vec2[] = teamLayout.teams.map((t) => ({
      x: t.spawnArea.x + t.spawnArea.width / 2,
      y: t.spawnArea.y + t.spawnArea.height / 2,
    }));

    expect(spawnPoints).toHaveLength(4);

    const report = verifyMazeConnectivity({
      width,
      height,
      walls,
      tankRadius,
      sampleStep: 35,
      checkPoints: spawnPoints,
    });

    expect(report.connected).toBe(true);
    expect(report.unreachablePoints).toHaveLength(0);
  });

  it('détecte correctement l’inaccessibilité si un mur isole arbitrairement une zone', () => {
    const width = 1000;
    const height = 1000;

    // Mur hermétique scellant le quart supérieur gauche [0..300] x [0..300]
    const isolatingWalls = [
      { x: 300, y: 0, width: 30, height: 330 },
      { x: 0, y: 300, width: 330, height: 30 },
    ];

    const checkPoints: Vec2[] = [
      { x: 150, y: 150 }, // Dans la zone isolée
      { x: 600, y: 600 }, // Dans l'arène principale
    ];

    const report = verifyMazeConnectivity({
      width,
      height,
      walls: isolatingWalls,
      tankRadius,
      sampleStep: 25,
      checkPoints,
    });

    expect(report.connected).toBe(false);
    expect(report.unreachablePoints.length).toBeGreaterThan(0);
  });
});

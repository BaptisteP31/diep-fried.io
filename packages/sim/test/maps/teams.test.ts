import { describe, expect, it } from 'vitest';
import { generateTeamLayout, generateTeamLayoutResult, MAZE_LIMITS } from '../../src/maps';

describe('Team layout generator (generateTeamLayout)', () => {
  const arenaWidth = 4000;
  const arenaHeight = 4000;

  describe('Configuration 2 équipes', () => {
    it('génère deux bases latérales (ouest et est) avec zones base et spawn', () => {
      const result = generateTeamLayoutResult(arenaWidth, arenaHeight, 2);

      expect(result.teams).toHaveLength(2);
      expect(result.zones).toHaveLength(4); // 2 bases + 2 spawns

      const team1 = result.teams.find((t) => t.team === 1)!;
      const team2 = result.teams.find((t) => t.team === 2)!;

      expect(team1).toBeDefined();
      expect(team2).toBeDefined();

      // Team 1 (Ouest)
      expect(team1.baseArea.x).toBe(0);
      expect(team1.baseArea.y).toBe(0);
      expect(team1.baseArea.height).toBe(arenaHeight);

      // Team 2 (Est)
      expect(team2.baseArea.x + team2.baseArea.width).toBe(arenaWidth);
      expect(team2.baseArea.y).toBe(0);
      expect(team2.baseArea.height).toBe(arenaHeight);

      // Les bases doivent être séparées par un no-man's land central
      const separation = team2.baseArea.x - (team1.baseArea.x + team1.baseArea.width);
      expect(separation).toBeGreaterThan(MAZE_LIMITS.defaultTankRadius * 4);
    });

    it('englobe strictement la zone de spawn à l’intérieur de la base avec la marge demandée', () => {
      const spawnMargin = 50;
      const result = generateTeamLayoutResult(arenaWidth, arenaHeight, 2, { spawnMargin });

      for (const t of result.teams) {
        expect(t.spawnArea.x).toBe(t.baseArea.x + spawnMargin);
        expect(t.spawnArea.y).toBe(t.baseArea.y + spawnMargin);
        expect(t.spawnArea.width).toBe(t.baseArea.width - 2 * spawnMargin);
        expect(t.spawnArea.height).toBe(t.baseArea.height - 2 * spawnMargin);
      }
    });

    it('produit des MapZone au format compatible @diep-fried/shared', () => {
      const zones = generateTeamLayout(arenaWidth, arenaHeight, 2);

      expect(zones).toHaveLength(4);
      for (const z of zones) {
        expect(['base', 'spawn']).toContain(z.kind);
        expect([1, 2]).toContain(z.team);
        expect(z.area.width).toBeGreaterThan(0);
        expect(z.area.height).toBeGreaterThan(0);
      }
    });
  });

  describe('Configuration 4 équipes', () => {
    it('génère 4 bases carrées positionnées aux 4 coins cardinaux', () => {
      const result = generateTeamLayoutResult(arenaWidth, arenaHeight, 4);

      expect(result.teams).toHaveLength(4);
      expect(result.zones).toHaveLength(8); // 4 bases + 4 spawns

      const team1 = result.teams.find((t) => t.team === 1)!;
      const team2 = result.teams.find((t) => t.team === 2)!;
      const team3 = result.teams.find((t) => t.team === 3)!;
      const team4 = result.teams.find((t) => t.team === 4)!;

      // Team 1 : Nord-Ouest (0, 0)
      expect(team1.baseArea.x).toBe(0);
      expect(team1.baseArea.y).toBe(0);

      // Team 2 : Sud-Est (opposé diagonal maximal)
      expect(team2.baseArea.x + team2.baseArea.width).toBe(arenaWidth);
      expect(team2.baseArea.y + team2.baseArea.height).toBe(arenaHeight);

      // Team 3 : Nord-Est
      expect(team3.baseArea.x + team3.baseArea.width).toBe(arenaWidth);
      expect(team3.baseArea.y).toBe(0);

      // Team 4 : Sud-Ouest
      expect(team4.baseArea.x).toBe(0);
      expect(team4.baseArea.y + team4.baseArea.height).toBe(arenaHeight);

      // Vérifier la séparation horizontale et verticale
      const sepX = team3.baseArea.x - (team1.baseArea.x + team1.baseArea.width);
      const sepY = team4.baseArea.y - (team1.baseArea.y + team1.baseArea.height);

      expect(sepX).toBeGreaterThan(MAZE_LIMITS.defaultTankRadius * 4);
      expect(sepY).toBeGreaterThan(MAZE_LIMITS.defaultTankRadius * 4);
    });

    it('vérifie que les bases ne se chevauchent jamais', () => {
      const result = generateTeamLayoutResult(arenaWidth, arenaHeight, 4);
      const bases = result.teams.map((t) => t.baseArea);

      for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
          const b1 = bases[i]!;
          const b2 = bases[j]!;
          const overlap =
            b1.x < b2.x + b2.width &&
            b1.x + b1.width > b2.x &&
            b1.y < b2.y + b2.height &&
            b1.y + b1.height > b2.y;
          expect(overlap).toBe(false);
        }
      }
    });
  });

  describe('Rejet des configurations invalides', () => {
    it('rejette les comptes d’équipes différents de 2 ou 4', () => {
      // @ts-expect-error test de validation d'entrée incorrecte
      expect(() => generateTeamLayout(arenaWidth, arenaHeight, 1)).toThrow(Error);
      // @ts-expect-error test de validation d'entrée incorrecte
      expect(() => generateTeamLayout(arenaWidth, arenaHeight, 3)).toThrow(Error);
      // @ts-expect-error test de validation d'entrée incorrecte
      expect(() => generateTeamLayout(arenaWidth, arenaHeight, 5)).toThrow(Error);
    });

    it('rejette les dimensions invalides ou non finies', () => {
      expect(() => generateTeamLayout(-100, 3000, 2)).toThrow(TypeError);
      expect(() => generateTeamLayout(3000, NaN, 2)).toThrow(TypeError);
    });

    it('rejette les ratios de base excessifs (>= 0.5) empêchant tout passage central', () => {
      expect(() => generateTeamLayout(arenaWidth, arenaHeight, 2, { baseSizeRatio: 0.55 })).toThrow(
        RangeError,
      );
    });

    it('rejette les marges de spawn supérieures à la moitié de la base', () => {
      expect(() =>
        generateTeamLayout(arenaWidth, arenaHeight, 2, {
          baseSizeRatio: 0.1, // 400 unités de base
          spawnMargin: 250, // 250 * 2 = 500 > 400
        }),
      ).toThrow(Error);
    });
  });
});

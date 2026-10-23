import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS_LIMIT, resolveModeConfig } from '../src';

describe('resolveModeConfig', () => {
  it('applique les options et borne le nombre de joueurs', () => {
    expect(resolveModeConfig('ffa', { maxPlayers: 1000 }).maxPlayers).toBe(MAX_PLAYERS_LIMIT);
    expect(resolveModeConfig('ffa', { maxPlayers: 0 }).maxPlayers).toBe(1);
    expect(resolveModeConfig('ffa', { arenaSize: 'small' }).arena).toEqual({
      width: 3000,
      height: 3000,
    });
  });

  it('adapte la population de formes à la surface et à la densité', () => {
    const small = resolveModeConfig('ffa', { arenaSize: 'small' }).shapes.targetCount;
    const large = resolveModeConfig('ffa', { arenaSize: 'large' }).shapes.targetCount;
    const dense = resolveModeConfig('ffa', { arenaSize: 'small', shapeDensity: 'high' }).shapes
      .targetCount;
    expect(large).toBeGreaterThan(small);
    expect(dense).toBe(small * 2);
  });

  it('distingue les presets FFA et Sandbox', () => {
    expect(resolveModeConfig('ffa').sandbox.cheats).toBe(false);
    expect(resolveModeConfig('sandbox').sandbox.cheats).toBe(true);
  });

  it('renvoie une configuration indépendante du preset', () => {
    const first = resolveModeConfig('ffa');
    first.map.walls.push({ x: 0, y: 0, width: 1, height: 1 });
    first.progression.maxLevel = 1;
    const second = resolveModeConfig('ffa');
    expect(second.map.walls).toEqual([]);
    expect(second.progression.maxLevel).toBe(45);
  });
});

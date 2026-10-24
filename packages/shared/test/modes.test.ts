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

  it('résout la configuration des bots par défaut et applique les bornes dures', () => {
    const defaultConfig = resolveModeConfig('ffa');
    expect(defaultConfig.bots).toEqual({ count: 5, difficulty: 'normal' });

    // count plafonné à maxPlayers - 1
    const tinyRoom = resolveModeConfig('ffa', { maxPlayers: 3 });
    expect(tinyRoom.bots).toEqual({ count: 2, difficulty: 'normal' });

    const soloRoom = resolveModeConfig('ffa', { maxPlayers: 1 });
    expect(soloRoom.bots).toEqual({ count: 0, difficulty: 'normal' });

    // Option 0 désactive
    const disabled = resolveModeConfig('ffa', { botCount: 0 });
    expect(disabled.bots).toEqual({ count: 0, difficulty: 'normal' });

    // Borne haute à 12 et difficulté
    const custom = resolveModeConfig('ffa', {
      maxPlayers: 20,
      botCount: 15,
      botDifficulty: 'hard',
    });
    expect(custom.bots).toEqual({ count: 12, difficulty: 'hard' });

    // Valeur négative ou invalide bornée
    const clampedNeg = resolveModeConfig('ffa', { botCount: -5 });
    expect(clampedNeg.bots).toEqual({ count: 0, difficulty: 'normal' });
  });
});

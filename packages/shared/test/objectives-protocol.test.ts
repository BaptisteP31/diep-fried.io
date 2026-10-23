import { describe, expect, it } from 'vitest';
import { MODE_IDS, SANDBOX_ACTIONS, decodeClientMessage, resolveModeConfig } from '../src';

const decode = (message: unknown) => decodeClientMessage(JSON.stringify(message));

describe('extensions additives v1 : modes à objectifs, possess et boss', () => {
  it.each(['domination', 'tag', 'ctf', 'breakout', 'survival', 'mothership'])(
    'accepte le mode %s et fixe un minimum explicite de joueurs',
    (mode) => {
      expect(decode({ t: 'room.create', name: '', mode }).ok).toBe(true);
      const config = resolveModeConfig(mode as (typeof MODE_IDS)[number]);
      expect(config.match!.minPlayers).toBeGreaterThanOrEqual(2);
      expect(config.match!.restartDelayTicks).toBeGreaterThan(0);
    },
  );

  it('conserve les modes historiques sans rounds', () => {
    for (const mode of ['ffa', 'sandbox', 'teams2', 'teams4', 'maze'] as const)
      expect(resolveModeConfig(mode).match).toBeUndefined();
    expect(resolveModeConfig('ffa').bosses?.enabled).toBe(true);
    expect(resolveModeConfig('sandbox').bosses).toBeUndefined();
  });

  it('valide possess sans champ superflu', () => {
    expect(decode({ t: 'command', command: { type: 'possess', entityId: 4 } })).toEqual({
      ok: true,
      message: { t: 'command', command: { type: 'possess' } },
    });
  });

  it('ajoute summonBoss aux actions Sandbox', () => {
    expect(SANDBOX_ACTIONS).toContain('summonBoss');
    expect(decode({ t: 'command', command: { type: 'sandbox', action: 'summonBoss' } })).toEqual({
      ok: true,
      message: { t: 'command', command: { type: 'sandbox', action: 'summonBoss' } },
    });
  });

  it('résout le rayon du nid selon la taille d’arène', () => {
    expect(resolveModeConfig('ffa', { arenaSize: 'small' }).shapes.nest?.radius).toBe(420);
    expect(resolveModeConfig('ffa').shapes.nest?.radius).toBe(700);
  });
});

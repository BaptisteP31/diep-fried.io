import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveModeConfig, type ObjectiveState } from '@diep-fried/shared';
import {
  clock,
  matchHeading,
  needsVisualReset,
  objectiveText,
  resultText,
  scoreText,
  secondsLeft,
} from '../src/ui/match-model';
import { MatchHud } from '../src/ui/match-hud';
import { SnapshotBuffer } from '../src/state/snapshot-buffer';
import { installDom } from './helpers/dom';
import { match, snapshot, tank } from './helpers/match';

const config = resolveModeConfig('ctf');
const flag: ObjectiveState = {
  id: 0,
  kind: 'flag',
  x: 100,
  y: 200,
  radius: 70,
  team: 2,
  entityId: null,
  progress: 0,
  flag: { status: 'dropped', carrierId: null, homeX: 800, homeY: 200, returnTick: 151 },
};
afterEach(() => vi.unstubAllGlobals());

describe('présentation autoritaire des matchs', () => {
  it('arrondit les ticks, borne le compte à rebours et distingue une absence de limite', () => {
    expect(secondsLeft(151, 60, 30)).toBe(4);
    expect(secondsLeft(60, 61, 30)).toBe(0);
    expect(secondsLeft(null, 61, 30)).toBeNull();
    expect(clock(601)).toBe('10:01');
    expect(matchHeading(match({ phase: 'waiting', players: 1 }), config, 60)).toContain(
      '1/2 joueurs minimum · encore 1',
    );
    expect(matchHeading(match(), config, 60)).toContain('9:59');
    expect(matchHeading(match({ endTick: null }), config, 60)).toContain('Sans limite');
  });

  it('distingue vainqueur joueur, équipe, égalité et raisons sans recalculer les scores', () => {
    const result = { team: 2, playerId: null, name: null, reason: 'timeLimit' as const, tick: 100 };
    const state = match({ phase: 'finished', result, endTick: 400 });
    expect(resultText(state, config)).toBe('Victoire : Rouges · Limite de temps atteinte');
    expect(matchHeading(state, config, 100)).toContain('Reprise dans 10 s');
    expect(resultText(match({ result: { ...result, team: null } }), config)).toContain('Égalité');
    expect(
      resultText(
        match({
          result: { ...result, team: null, playerId: 4, name: 'Bob', reason: 'lastSurvivor' },
        }),
        config,
      ),
    ).toBe('Bob remporte la manche · Dernier survivant');
    expect(scoreText(state, config)).toContain('Bleus : 1 captures');
    expect(scoreText(match({ survivors: [2, 7] }), resolveModeConfig('survival'))).toContain(
      '2 survivant(s)',
    );
  });

  it('lit les trois états CTF, santé, possession et territoire contesté/capture', () => {
    expect(objectiveText(flag, config, 60)).toBe('Rouges · au sol · retour 4 s');
    expect(
      objectiveText(
        { ...flag, flag: { ...flag.flag!, status: 'home', returnTick: null } },
        config,
        60,
      ),
    ).toBe('Rouges · à la base');
    expect(
      objectiveText(
        { ...flag, flag: { ...flag.flag!, status: 'carried', carrierId: 7, returnTick: null } },
        config,
        60,
      ),
    ).toContain('porté par #7');
    expect(
      objectiveText(
        { ...flag, kind: 'territory', team: 0, capturingTeam: 1, contested: true, progress: 0.42 },
        config,
        60,
      ),
    ).toBe('Neutre · Contesté · Capture Bleus : 42 %');
    expect(
      objectiveText(
        { ...flag, kind: 'dominator', health: 123, maxHealth: 4000, possessedBy: 3 },
        config,
        60,
      ),
    ).toBe('Rouges · 123/4000 PV · piloté par #3');
  });

  it('purge aux frontières de vie/possession/round, mais pas pour des dégâts ou un score', () => {
    const before = snapshot();
    expect(needsVisualReset(before, snapshot({ tick: 62 }))).toBe(false);
    expect(needsVisualReset(before, snapshot({ match: match({ round: 2 }) }))).toBe(true);
    expect(
      needsVisualReset(
        before,
        snapshot({ self: { ...before.self, alive: false, entityId: null } }),
      ),
    ).toBe(true);
    expect(
      needsVisualReset(
        before,
        snapshot({ self: { ...before.self, entityId: -10, possessing: -10 } }),
      ),
    ).toBe(true);
    const buffer = new SnapshotBuffer(1000 / 30, 100);
    buffer.push(before, 2000);
    const after = snapshot({ tick: 62, match: match({ round: 2 }), entities: [tank({ x: 900 })] });
    if (needsVisualReset(buffer.latest(), after)) buffer.clear();
    buffer.push(after, 2067);
    expect(buffer.sample(2068)?.entities[0]?.x).toBe(900);
    expect(buffer.sample(2068)?.match?.round).toBe(2);
  });
});

describe('HUD et notifications non bloquantes', () => {
  it('rend les objectifs hors champ, contrôle confirmé et transitions seulement une fois', () => {
    const { el } = installDom();
    const possess = vi.fn();
    const hud = new MatchHud(possess);
    const config = resolveModeConfig('domination');
    const objective = { ...flag, kind: 'dominator' as const, health: 4000, maxHealth: 4000 };
    hud.update(snapshot({ match: match({ phase: 'waiting', objectives: [objective] }) }), config);
    expect(el('match-objectives').children[0]?.children[0]?.textContent).toBe('D1');
    hud.update(
      snapshot({
        tick: 62,
        self: { ...snapshot().self, possessing: -8 },
        match: match({ objectives: [objective] }),
      }),
      config,
    );
    expect(el('match-phase').textContent).toContain('En cours');
    expect(el('match-possess').textContent).toContain('Rendre le contrôle');
    el('match-possess').dispatchEvent(new Event('click'));
    expect(possess).toHaveBeenCalledOnce();
    expect(el('game-notices').textContent).toContain('confirmé');
    hud.renderNotices(performance.now() + 6000);
    expect(el('game-notices').hidden).toBe(true);
    hud.reset();
    expect(el('match-hud').hidden).toBe(true);
  });

  it('annonce un boss uniquement lorsqu’il est visible, sans répéter après sortie du champ', () => {
    const { el } = installDom();
    const hud = new MatchHud(vi.fn());
    const boss = tank({ id: -9, name: 'Summoner', classId: 'summoner', playerId: null });
    hud.update(snapshot({ match: undefined, entities: [boss] }), config);
    expect(el('game-notices').textContent).toBe('Boss visible : Summoner');
    hud.renderNotices(performance.now() + 6000);
    hud.update(snapshot({ match: undefined, entities: [] }), config);
    hud.update(snapshot({ match: undefined, entities: [boss] }), config);
    expect(el('game-notices').hidden).toBe(true);
  });
});

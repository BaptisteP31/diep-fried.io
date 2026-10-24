import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  resolveModeConfig,
  type EntityState,
  type ModeConfig,
  type ModeId,
  type ObjectiveSite,
  type PlayerInput,
  type ProjectileFamily,
  type TankState,
} from '@diep-fried/shared';
import { createSimulation, type SimEvent, type Simulation } from '../src';
import { AI_BALANCE, scoreForLevel } from '../src/balance';

function config(mode: ModeId, objectives: ObjectiveSite[] = []): ModeConfig {
  const c = resolveModeConfig(mode);
  c.arena = { width: 2000, height: 1200 };
  c.shapes.targetCount = 0;
  c.progression.startLevel = 45;
  c.map.objectives = objectives;
  c.map.zones = c.teams.map((team, i) => ({
    kind: 'spawn',
    team: team.id,
    area: { x: 175 + i * 650, y: 575, width: 50, height: 50 },
  }));
  c.match!.restartDelayTicks = 5;
  return c;
}
function create(c: ModeConfig, count = 2): Simulation {
  const s = createSimulation({ config: c, seed: 1 });
  for (let id = 1; id <= count; id++) s.addPlayer(id, { name: `P${id}` });
  s.step();
  return s;
}
function own(s: Simulation, id = 1): TankState {
  const snap = s.snapshotFor(id)!;
  const body = snap.entities.find((b) => b.id === snap.self.entityId);
  if (body?.kind !== 'tank') throw new Error(`P${id} has no tank at ${s.tick}`);
  return body;
}
function input(s: Simulation, id: number, changes: Partial<PlayerInput> = {}): void {
  s.setInput(id, {
    seq: s.tick + 1,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    alt: false,
    ...changes,
  });
}
function ticks(s: Simulation, count: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < count; i++) events.push(...s.step());
  return events;
}
function choose(s: Simulation, id: number, target: string): void {
  const path = (at: string): string[] | undefined => {
    if (at === target) return [];
    for (const child of CLASS_DEFINITIONS[at]!.upgradesTo) {
      const tail = path(child);
      if (tail) return [child, ...tail];
    }
  };
  for (const classId of path('tank')!) s.queueCommand(id, { type: 'chooseClass', classId });
  s.step();
}
const flags = (): ObjectiveSite[] => [
  { kind: 'flag', team: 1, x: 100, y: 600, radius: 40 },
  { kind: 'flag', team: 2, x: 500, y: 600, radius: 40 },
];
function pickup(s: Simulation): void {
  for (let i = 0; i < 200; i++) {
    const t = own(s);
    input(s, 1, { move: { x: Math.min(1, (500 - t.x) / 40), y: (600 - t.y) / 100 } });
    s.step();
    if (s.snapshotFor(1)!.match!.objectives[1]!.flag!.status === 'carried') {
      input(s, 1);
      return;
    }
  }
  throw new Error('no pickup');
}

function fortresses(mode: 'domination' | 'mothership' = 'domination'): ModeConfig {
  return config(mode, [
    {
      kind: mode === 'domination' ? 'dominator' : 'mothership',
      team: 1,
      x: 400,
      y: 600,
      radius: mode === 'domination' ? 70 : 110,
      classId: mode === 'domination' ? 'dominator-gunner' : 'mothership',
    },
    {
      kind: mode === 'domination' ? 'dominator' : 'mothership',
      team: 2,
      x: 1800,
      y: 100,
      radius: mode === 'domination' ? 70 : 110,
      classId: mode === 'domination' ? 'dominator-gunner' : 'mothership',
    },
  ]);
}

// Observation seulement : ces budgets et la mémoire IA ne sont pas exposés sur le réseau.
function internals(s: Simulation) {
  return s as unknown as {
    ais: Map<
      number,
      {
        tank: TankState;
        targetId: number | null;
        lastSeen: number;
        lastX: number;
        lastY: number;
        pilot: { input: PlayerInput | null };
      }
    >;
    bodies: Map<number, EntityState & { ownerPlayerId?: number }>;
    projectileCounts: Map<number, Record<ProjectileFamily, number>>;
  };
}

describe('independent objective review regressions', () => {
  it('Tag: an arrival cannot repopulate an empty camp during play', () => {
    const c = config('tag');
    // Deux alliés doivent pouvoir apparaître sans saturer la zone de spawn.
    c.map.zones.forEach((zone, i) => {
      zone.area = { x: 100 + i * 450, y: 450, width: 300, height: 300 };
    });
    const s = create(c);
    const teams = new Set([own(s, 1).team, own(s, 2).team]);
    expect(s.snapshotFor(1)!.match!.phase).toBe('playing');
    s.addPlayer(3, { name: 'newcomer' });
    s.step();
    expect(teams.has(own(s, 3).team)).toBe(true);
  });

  it('CTF: entering waiting drops the carried flag at the carrier position', () => {
    const s = create(config('ctf', flags()));
    pickup(s);
    s.removePlayer(2);
    s.step();
    const flag = s.snapshotFor(1)!.match!.objectives[1]!;
    expect(s.snapshotFor(1)!.match!.phase).toBe('waiting');
    expect(flag.flag!.status).toBe('dropped');
    expect(flag.flag!.carrierId).toBeNull();
    expect(flag.x).toBeCloseTo(own(s).x);
    expect(flag.y).toBeCloseTo(own(s).y);
  });

  it('CTF: an enemy objective snapshot cannot locate an invisible carrier', () => {
    const s = create(config('ctf', flags()));
    choose(s, 1, 'stalker');
    pickup(s);
    ticks(s, 200);
    const carrier = own(s);
    expect(carrier.opacity).toBe(0);
    const enemy = s.snapshotFor(2)!;
    expect(enemy.entities.some((b) => b.id === carrier.id)).toBe(false);
    const flag = enemy.match!.objectives[1]!;
    expect(flag.x).toBe(flag.flag!.homeX);
    expect(flag.y).toBe(flag.flag!.homeY);
    expect(flag.flag!.carrierId).toBeNull();
    expect(flag.flag!.positionHidden).toBe(true);
    expect(s.snapshotFor(1)!.match!.objectives[1]!.x).toBe(carrier.x);
    expect(s.snapshotFor(1)!.match!.objectives[1]!.flag!.positionHidden).toBeUndefined();
    s.addPlayer(3, { name: 'ally observer' });
    s.addPlayer(4, { name: 'enemy observer' });
    expect(s.snapshotFor(3)!.match!.objectives[1]!.flag!.carrierId).toBe(1);
    expect(s.snapshotFor(3)!.match!.objectives[1]!.x).toBe(carrier.x);
    expect(s.snapshotFor(4)!.match!.objectives[1]!.flag!.positionHidden).toBe(true);
    // Classement et état de match n'ajoutent aucune position du joueur masqué.
    expect(enemy.leaderboard!.find((row) => row.playerId === 1)).toEqual({
      playerId: 1,
      name: 'P1',
      classId: 'stalker',
      score: scoreForLevel(45),
    });
    input(s, 1, { move: { x: 0, y: 1 } });
    s.step();
    const revealed = s.snapshotFor(2)!.match!.objectives[1]!;
    expect(revealed.flag!.positionHidden).toBeUndefined();
    expect(revealed.flag!.carrierId).toBe(1);
    expect(revealed.y).toBe(own(s).y);
  });

  it('a possessed Dominator cannot fire damaging shots while waiting', () => {
    const c = config('domination', [
      { kind: 'dominator', team: 1, x: 400, y: 600, radius: 70, classId: 'dominator-gunner' },
      { kind: 'dominator', team: 0, x: 1800, y: 100, radius: 70, classId: 'dominator-gunner' },
    ]);
    c.match!.minPlayers = 3;
    const s = create(c);
    s.queueCommand(1, { type: 'possess' });
    s.step();
    expect(s.snapshotFor(1)!.self.possessing).toBeDefined();
    ticks(s, 100);
    input(s, 1, { fire: true, aim: { x: own(s, 2).x - 400, y: own(s, 2).y - 600 } });
    const health = own(s, 2).health;
    ticks(s, 120);
    expect(s.snapshotFor(2)!.self.alive).toBe(true);
    expect(own(s, 2).health).toBe(health);
    expect(
      s.snapshotFor(1)!.entities.filter((b) => b.kind === 'projectile' && b.ownerId === own(s).id),
    ).toEqual([]);
  });

  it('reset clears stale movement and fire but retains monotone input sequence numbers', () => {
    const c = config('ctf', flags());
    c.match!.timeLimitTicks = 5;
    const s = create(c);
    input(s, 1, { seq: 100, fire: true, move: { x: 1, y: 0 } });
    ticks(s, 10);
    expect(s.snapshotFor(1)!.match!.round).toBe(2);
    const at = own(s);
    s.step();
    expect(own(s).x).toBe(at.x);
    expect(own(s).barrelShots.every((t) => t === -1)).toBe(true);
    expect(s.snapshotFor(1)!.ackSeq).toBe(100);
    input(s, 1, { seq: 99, fire: true, move: { x: 1, y: 0 } });
    s.step();
    expect(own(s).x).toBe(at.x);
    expect(s.snapshotFor(1)!.ackSeq).toBe(100);
    input(s, 1, { seq: 101, move: { x: 1, y: 0 } });
    s.step();
    expect(own(s).x).toBeGreaterThan(at.x);
  });

  it('waiting also neutralizes an objective bullet already in flight', () => {
    const c = fortresses();
    c.match!.minPlayers = 3;
    const s = create(c, 3);
    ticks(s, 100);
    s.queueCommand(1, { type: 'possess' });
    s.step();
    input(s, 1, { fire: true, aim: { x: own(s, 2).x - 400, y: own(s, 2).y - 600 } });
    s.step();
    expect(
      s.snapshotFor(1)!.entities.some((b) => b.kind === 'projectile' && b.ownerId === own(s).id),
    ).toBe(true);
    input(s, 1);
    s.removePlayer(3);
    s.step();
    expect(s.snapshotFor(1)!.match!.phase).toBe('waiting');
    const health = own(s, 2).health;
    ticks(s, 45);
    expect(own(s, 2).health).toBe(health);
  });

  it('a possessed Mothership cannot move or create drones while waiting', () => {
    const c = fortresses('mothership');
    c.match!.minPlayers = 3;
    const s = create(c);
    s.queueCommand(1, { type: 'possess' });
    s.step();
    expect(s.snapshotFor(1)!.self.possessing).toBeDefined();
    const before = own(s);
    input(s, 1, { fire: true, move: { x: 0, y: -1 } });
    ticks(s, 60);
    expect(own(s)).toMatchObject({ x: before.x, y: before.y, vx: 0, vy: 0 });
    expect(
      s.snapshotFor(1)!.entities.filter((b) => b.kind === 'projectile' && b.ownerId === before.id),
    ).toEqual([]);
  });
});

describe('objective review: disconnects, rounds and AI invariants', () => {
  it('synchronizes earned XP and level back to the parked tank after possession', () => {
    const c = fortresses('mothership');
    c.progression.startLevel = 1;
    const s = create(c);
    const originalHealth = own(s).maxHealth;
    s.queueCommand(1, { type: 'possess' });
    s.step();
    expect(s.snapshotFor(1)!.self.possessing).toBeDefined();
    for (let i = 0; i < 900 && s.snapshotFor(2)!.self.alive; i++) {
      const target = own(s, 2);
      const pilot = own(s);
      input(s, 1, { fire: true, aim: { x: target.x - pilot.x, y: target.y - pilot.y } });
      s.step();
    }
    expect(s.snapshotFor(2)!.self.alive).toBe(false);
    expect(s.snapshotFor(1)!.self.score).toBeGreaterThan(0);
    s.queueCommand(1, { type: 'possess' });
    s.step();
    const self = s.snapshotFor(1)!.self;
    const restored = own(s);
    expect(restored.score).toBe(self.score);
    expect(restored.level).toBe(self.level);
    expect(restored.maxHealth).toBeGreaterThan(originalHealth);
  });

  it.each(['domination', 'tag', 'ctf', 'breakout', 'survival', 'mothership'] as const)(
    '%s: waits for two participants and completes two rounds with a fresh third round',
    (mode) => {
      const c =
        mode === 'domination' || mode === 'mothership'
          ? fortresses(mode)
          : config(mode, mode === 'ctf' ? flags() : []);
      c.match!.timeLimitTicks = 5;
      const s = create(c, 1);
      expect(s.snapshotFor(1)!.match).toMatchObject({ phase: 'waiting', minPlayers: 2, round: 0 });
      expect(ticks(s, 10).filter((e) => e.type === 'matchPhase')).toEqual([]);
      s.addPlayer(2, { name: 'P2' });
      s.step();
      for (let round = 1; round <= 2; round++) {
        expect(s.snapshotFor(1)!.match).toMatchObject({ phase: 'playing', round, result: null });
        const ids = [own(s).id, own(s, 2).id];
        const end = ticks(s, 5);
        expect(end.filter((e) => e.type === 'matchPhase' && e.phase === 'finished')).toHaveLength(
          1,
        );
        expect(s.snapshotFor(1)!.match!.result).toMatchObject({ reason: 'timeLimit', team: null });
        const restart = ticks(s, 5);
        expect(
          restart.filter((e) => e.type === 'matchPhase' && e.phase === 'playing'),
        ).toHaveLength(1);
        expect(s.snapshotFor(1)!.match!.round).toBe(round + 1);
        expect([own(s).id, own(s, 2).id].every((id) => !ids.includes(id))).toBe(true);
        expect(s.config).toEqual(c);
      }
    },
  );

  it('AI requires line of sight and forgets the last visible position after the bounded delay', () => {
    const c = fortresses();
    c.sandbox.cheats = true;
    c.map.walls = [{ x: 650, y: 450, width: 30, height: 300 }];
    const s = create(c);
    const ai = [...internals(s).ais.values()].find((entry) => entry.tank.team === 1)!;
    ticks(s, 100);
    expect(ai.targetId).toBeNull();
    expect(ai.tank.barrelShots.every((tick) => tick === -1)).toBe(true);
    input(s, 2, { move: { x: 0, y: -1 } });
    for (let i = 0; i < 150 && ai.targetId === null; i++) s.step();
    expect(ai.targetId).toBe(own(s, 2).id);
    // La protection rend la cible invalide ; ses déplacements suivants restent inconnus de l'IA.
    s.queueCommand(2, { type: 'sandbox', action: 'toggleGod' });
    s.step();
    const last = { tick: ai.lastSeen, x: ai.lastX, y: ai.lastY };
    s.step();
    expect(ai.targetId).not.toBeNull();
    expect(ai.pilot.input!.fire).toBe(true);
    ticks(s, AI_BALANCE.memorySeconds * c.tickRate + 1);
    expect({ tick: ai.lastSeen, x: ai.lastX, y: ai.lastY }).toEqual(last);
    expect(ai.targetId).toBeNull();
    expect(ai.pilot.input!.fire).toBe(false);
    const shots = [...ai.tank.barrelShots];
    ticks(s, 30);
    expect(ai.tank.barrelShots).toEqual(shots);
  });

  it('disconnecting a pilot releases the objective and removes the parked tank and human drones', () => {
    const s = create(fortresses());
    choose(s, 1, 'factory');
    ticks(s, 10);
    const humanId = own(s).id;
    expect(
      s.snapshotFor(1)!.entities.some((b) => b.kind === 'projectile' && b.ownerId === humanId),
    ).toBe(true);
    s.queueCommand(1, { type: 'possess' });
    s.step();
    const objectiveId = own(s).id;
    expect(s.snapshotFor(1)!.self.possessing).toBe(objectiveId);
    expect(
      [...internals(s).bodies.values()].some(
        (b) => b.kind === 'projectile' && b.ownerId === humanId,
      ),
    ).toBe(false);
    s.queueCommand(1, { type: 'possess' });
    s.removePlayer(1);
    expect(s.snapshotFor(1)).toBeUndefined();
    s.step();
    expect(s.snapshotFor(2)!.match!.objectives[0]!.possessedBy).toBeNull();
    expect(internals(s).bodies.has(humanId)).toBe(false);
    expect(internals(s).bodies.has(objectiveId)).toBe(true);
    expect(internals(s).projectileCounts.has(1)).toBe(false);
    // Un nouvel arrivant peut piloter à nouveau le même objectif allié.
    s.addPlayer(3, { name: 'replacement' });
    s.step();
    s.queueCommand(3, { type: 'possess' });
    s.step();
    expect(s.snapshotFor(3)!.self.possessing).toBeDefined();
  });

  it('Survival: respawn, possession and repeated reconnects cannot restore a participant mid-round', () => {
    const c = config('survival');
    c.sandbox.cheats = true;
    const s = create(c, 3);
    s.queueCommand(1, { type: 'sandbox', action: 'selfDestruct' });
    s.step();
    expect(s.snapshotFor(1)!.match!.survivors).toEqual([2, 3]);
    for (let attempt = 0; attempt < 5; attempt++) {
      s.removePlayer(1);
      s.addPlayer(1, { name: 'rejoin' });
      s.queueCommand(1, { type: 'respawn' });
      s.queueCommand(1, { type: 'possess' });
      input(s, 1, { fire: true, move: { x: 1, y: 1 } });
      s.step();
      expect(s.snapshotFor(1)!.self).toMatchObject({
        alive: false,
        spectator: true,
        respawnTick: null,
      });
      expect(s.snapshotFor(1)!.match!.survivors).toEqual([2, 3]);
    }
    s.removePlayer(3);
    const end = s.step();
    expect(end.filter((e) => e.type === 'matchPhase' && e.phase === 'finished')).toHaveLength(1);
    expect(s.snapshotFor(1)!.match!.result).toMatchObject({ playerId: 2, reason: 'lastSurvivor' });
    ticks(s, 5);
    expect(s.snapshotFor(1)!.match).toMatchObject({
      round: 2,
      phase: 'playing',
      survivors: [1, 2],
    });
    expect(s.snapshotFor(1)!.self.alive).toBe(true);
  });

  it('Survival: simultaneous zone deaths produce one draw, with no extra victory at the time limit', () => {
    const c = config('survival');
    c.match!.timeLimitTicks = 1;
    c.match!.shrink = {
      delayTicks: 0,
      durationTicks: 1,
      finalRadiusFraction: 0,
      damagePerSecond: 1e6,
    };
    const s = create(c);
    const events = s.step();
    expect(events.filter((e) => e.type === 'death')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'matchPhase' && e.phase === 'finished')).toHaveLength(1);
    expect(s.snapshotFor(1)!.match!.result).toMatchObject({
      playerId: null,
      team: null,
      reason: 'lastSurvivor',
    });
    expect(ticks(s, 4).filter((e) => e.type === 'matchPhase')).toEqual([]);
  });

  it.each(['domination', 'mothership'] as const)(
    '%s: two resets remove old AI, projectiles, negative owner budgets and possession',
    (mode) => {
      const c = fortresses(mode);
      c.sandbox.cheats = true;
      c.match!.timeLimitTicks = 120;
      const s = create(c);
      for (let round = 1; round <= 2; round++) {
        s.queueCommand(2, { type: 'sandbox', action: 'toggleGod' });
        s.queueCommand(1, { type: 'sandbox', action: 'summonBoss' });
        s.queueCommand(1, { type: 'possess' });
        s.step();
        input(s, 1, { fire: true, aim: { x: 0, y: -1 } });
        ticks(s, 10);
        expect(s.snapshotFor(1)!.self.possessing).toBeDefined();
        const oldAi = [...internals(s).ais.keys()];
        expect(oldAi).toHaveLength(3);
        const oldBodies = [...internals(s).bodies.keys()];
        expect([...internals(s).projectileCounts.keys()].some((key) => key < 0)).toBe(true);
        const endTick = s.snapshotFor(1)!.match!.endTick!;
        const events = ticks(s, endTick - s.tick);
        expect(
          events.filter((e) => e.type === 'matchPhase' && e.phase === 'finished'),
        ).toHaveLength(1);
        const score = s.snapshotFor(1)!.self.score;
        const health = own(s, 2).health;
        const podium = ticks(s, 4);
        expect(
          podium.filter(
            (e) =>
              e.type === 'death' ||
              e.type === 'levelUp' ||
              e.type === 'objective' ||
              e.type === 'matchPhase',
          ),
        ).toEqual([]);
        expect(s.snapshotFor(1)!.self.score).toBe(score);
        expect(own(s, 2).health).toBeGreaterThanOrEqual(health);
        const reset = s.step();
        expect(reset.filter((e) => e.type === 'spawn')).toHaveLength(2);
        expect(s.snapshotFor(1)!.match).toMatchObject({
          round: round + 1,
          phase: 'playing',
          result: null,
        });
        expect(s.snapshotFor(1)!.self).toMatchObject({
          alive: true,
          score: scoreForLevel(45),
          classId: 'tank',
        });
        expect(s.snapshotFor(1)!.self.possessing).toBeUndefined();
        expect(oldAi.every((key) => !internals(s).ais.has(key))).toBe(true);
        expect(oldBodies.every((id) => !internals(s).bodies.has(id))).toBe(true);
        expect(internals(s).projectileCounts.size).toBe(0);
        expect(internals(s).ais.size).toBe(2);
      }
    },
  );
});

import { describe, expect, it } from 'vitest';
import {
  CLASSIC_BOSSES,
  CLASS_DEFINITIONS,
  SPECIAL_CLASS_DEFINITIONS,
  getClassDefinition,
  resolveModeConfig,
  type MapZone,
  type MatchState,
  type ModeConfig,
  type ModeId,
  type ObjectiveSite,
  type PlayerInput,
  type StatId,
  type TankState,
} from '@diep-fried/shared';
import { createSimulation, prepareModeConfig, type SimEvent, type Simulation } from '../src';
import { scoreForLevel } from '../src/balance';
import { circleVsWalls } from '../src/maps';

// Spawns resserrés et objectifs explicites : scénarios déterministes via la seule API publique.
const SPAWNS: Record<number, MapZone['area']> = {
  1: { x: 175, y: 475, width: 50, height: 50 },
  2: { x: 625, y: 475, width: 50, height: 50 },
  3: { x: 175, y: 125, width: 50, height: 50 },
  4: { x: 625, y: 825, width: 50, height: 50 },
};

function setup(mode: ModeId, objectives: ObjectiveSite[] = []): ModeConfig {
  const c = resolveModeConfig(mode);
  c.arena = { width: 1000, height: 1000 };
  c.shapes.targetCount = 0;
  c.sandbox.cheats = true;
  c.progression.startLevel = 45;
  c.respawn.delayTicks = 0;
  c.match!.restartDelayTicks = 20;
  c.map.zones = c.teams.map((team) => ({ kind: 'spawn', team: team.id, area: SPAWNS[team.id]! }));
  c.map.objectives = objectives;
  return c;
}
const dominator = (x: number, y: number, classId = 'dominator-destroyer'): ObjectiveSite => ({
  kind: 'dominator',
  team: 0,
  x,
  y,
  radius: 70,
  classId,
});
function create(c: ModeConfig, players = 2, seed = 1): Simulation {
  const sim = createSimulation({ config: c, seed });
  for (let id = 1; id <= players; id++) sim.addPlayer(id, { name: `P${id}` });
  sim.step();
  return sim;
}
function own(sim: Simulation, id = 1): TankState {
  const snap = sim.snapshotFor(id)!;
  const tank = snap.entities.find((body) => body.id === snap.self.entityId);
  if (tank?.kind !== 'tank') throw new Error(`Player ${id} is dead`);
  return tank;
}
const match = (sim: Simulation, id = 1): MatchState => sim.snapshotFor(id)!.match!;
function input(sim: Simulation, id: number, changes: Partial<PlayerInput> = {}): void {
  sim.setInput(id, {
    seq: sim.tick + 1,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    alt: false,
    ...changes,
  });
}
function step(sim: Simulation, count: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < count; i++) events.push(...sim.step());
  return events;
}
/** Classe et 33 points via les commandes Sandbox et ordinaires. */
function arm(sim: Simulation, id: number, classId = 'annihilator'): void {
  const catalog = Object.keys(CLASS_DEFINITIONS);
  for (let i = 0; i < catalog.indexOf(classId); i++)
    sim.queueCommand(id, { type: 'sandbox', action: 'cycleClass' });
  const stats: StatId[] = [
    'bulletDamage',
    'reload',
    'bulletPenetration',
    'bulletSpeed',
    'maxHealth',
  ];
  for (const stat of stats)
    for (let i = 0; i < 7; i++) sim.queueCommand(id, { type: 'upgradeStat', stat });
  sim.step();
  expect(sim.snapshotFor(id)!.self.classId).toBe(classId);
}
/**
 * Tire sur une cible mobile jusqu'à `until` (échec après `limit` ticks, sauf `until` absent).
 * `hold` : distance conservée en compensant le recul.
 */
function fireUntil(
  sim: Simulation,
  shooters: number[],
  target: () => { x: number; y: number } | undefined,
  until?: (events: SimEvent[]) => boolean,
  limit = 1500,
  hold = 0,
): SimEvent[] {
  const all: SimEvent[] = [];
  for (let tick = 0; tick < limit; tick++) {
    const at = target();
    for (const id of shooters) {
      const snap = sim.snapshotFor(id)!;
      const tank = snap.entities.find((b) => b.id === snap.self.entityId);
      if (!at || !tank) {
        input(sim, id);
        continue;
      }
      const aim = { x: at.x - tank.x, y: at.y - tank.y };
      const d = Math.hypot(aim.x, aim.y) || 1;
      const sign = hold && d > hold ? 1 : 0;
      input(sim, id, { aim, fire: true, move: { x: (aim.x / d) * sign, y: (aim.y / d) * sign } });
    }
    const events = sim.step();
    all.push(...events);
    if (until?.(events)) return all;
  }
  if (until) throw new Error('condition jamais atteinte');
  return all;
}
const entity = (sim: Simulation, id: number) =>
  sim.snapshotFor(1)!.entities.find((b) => b.id === id) as TankState | undefined;

describe('cartes des modes à objectifs', () => {
  it.each([
    ['domination', 'dominator', 4, 2],
    ['ctf', 'flag', 2, 2],
    ['breakout', 'territory', 5, 2],
    ['mothership', 'mothership', 2, 2],
    ['tag', undefined, 0, 4],
    ['survival', undefined, 0, 0],
  ] as const)('%s : %s ×%i hors des bases', (mode, kind, count, teams) => {
    for (const arenaSize of ['small', 'medium', 'large'] as const) {
      const c = prepareModeConfig(resolveModeConfig(mode, { arenaSize }), 4);
      expect(c.teams).toHaveLength(teams);
      expect(c.map.zones.filter((z) => z.kind === 'base')).toHaveLength(teams);
      const sites = c.map.objectives ?? [];
      expect(sites).toHaveLength(count);
      const bases = c.map.zones.filter((z) => z.kind === 'base').map((z) => z.area);
      for (const site of sites) {
        expect(site.kind).toBe(kind);
        expect(circleVsWalls(site.x, site.y, site.radius, bases)).toBe(false);
        expect(site.x - site.radius).toBeGreaterThanOrEqual(0);
        expect(site.y + site.radius).toBeLessThanOrEqual(c.arena.height);
      }
      expect(c.match!.minPlayers).toBe(2);
    }
  });

  it('préserve des objectifs explicites et ne modifie pas les presets', () => {
    const c = setup('domination', [dominator(400, 500)]);
    expect(prepareModeConfig(c, 3).map.objectives).toEqual(c.map.objectives);
    expect(resolveModeConfig('ffa').match).toBeUndefined();
  });

  it('sépare les classes spéciales des 54 classes jouables', () => {
    expect(Object.keys(CLASS_DEFINITIONS)).toHaveLength(54);
    for (const id of Object.keys(SPECIAL_CLASS_DEFINITIONS)) {
      expect(CLASS_DEFINITIONS[id]).toBeUndefined();
      expect(getClassDefinition(id)).toBe(SPECIAL_CLASS_DEFINITIONS[id]);
    }
  });
});

describe('rounds : attente, victoire unique, remise à zéro', () => {
  it('attend le minimum de joueurs : objectif invulnérable, aucune victoire solo', () => {
    const sim = create(setup('domination', [dominator(400, 500)]), 1);
    arm(sim, 1);
    expect(match(sim)).toMatchObject({ phase: 'waiting', round: 0, minPlayers: 2, players: 1 });
    const id = match(sim).objectives[0]!.entityId!;
    expect(entity(sim, id)).toMatchObject({ playerId: null, spawnProtected: true, team: 0 });
    const events = fireUntil(sim, [1], () => entity(sim, id), undefined, 300).filter(
      (e) => e.type === 'objective' || e.type === 'matchPhase',
    );
    expect(events).toEqual([]);
    expect(entity(sim, id)!.health).toBe(entity(sim, id)!.maxHealth);
    sim.addPlayer(2, { name: 'P2' });
    const start = sim.step();
    expect(start).toContainEqual({ type: 'matchPhase', phase: 'playing', round: 1, result: null });
    expect(match(sim).phase).toBe('playing');
  });

  it('Domination : capture, possession, neutralisation et éjection du pilote', () => {
    const sim = create(setup('domination', [dominator(400, 500), dominator(500, 880)]));
    arm(sim, 1);
    arm(sim, 2);
    // P2 reste hors d'atteinte du Dominator capturé jusqu'à sa contre-attaque.
    sim.queueCommand(2, { type: 'sandbox', action: 'toggleGod' });
    const id = match(sim).objectives[0]!.entityId!;
    const captured = fireUntil(
      sim,
      [1],
      () => entity(sim, id),
      (events) => events.some((e) => e.type === 'objective'),
    );
    expect(captured).toContainEqual({
      type: 'objective',
      objectiveId: 0,
      kind: 'dominator',
      action: 'captured',
      team: own(sim, 1).team,
      playerId: 1,
    });
    expect(entity(sim, id)).toMatchObject({ team: own(sim, 1).team, spawnProtected: false });
    expect(entity(sim, id)!.health).toBe(entity(sim, id)!.maxHealth);
    expect(match(sim).scores.find((s) => s.team === own(sim, 1).team)!.score).toBe(1);
    expect(match(sim).phase).toBe('playing');

    // H : prise de contrôle du Dominator allié voisin, refusée à l'adversaire.
    walk(
      sim,
      1,
      { x: 400, y: 500 },
      () => Math.hypot(own(sim, 1).x - 400, own(sim, 1).y - 500) < 190,
    );
    input(sim, 1);
    sim.queueCommand(2, { type: 'possess' });
    sim.queueCommand(1, { type: 'possess' });
    const events = sim.step();
    expect(events).toContainEqual({ type: 'possess', playerId: 1, entityId: id });
    expect(events.filter((e) => e.type === 'possess')).toHaveLength(1);
    const self = sim.snapshotFor(1)!.self;
    expect(self).toMatchObject({ entityId: id, possessing: id, alive: true });
    expect(match(sim).objectives[0]!.possessedBy).toBe(1);

    sim.queueCommand(2, { type: 'sandbox', action: 'toggleGod' });
    const neutralized = fireUntil(
      sim,
      [2],
      () => entity(sim, id),
      (e) => e.some((event) => event.type === 'objective'),
    );
    expect(neutralized).toContainEqual(
      expect.objectContaining({ action: 'neutralized', team: own(sim, 2).team, playerId: 2 }),
    );
    expect(neutralized).toContainEqual({ type: 'possess', playerId: 1, entityId: null });
    expect(entity(sim, id)!.team).toBe(0);
    const back = own(sim, 1);
    expect(sim.snapshotFor(1)!.self.possessing).toBeUndefined();
    expect(Math.hypot(back.x - 400, back.y - 500)).toBeLessThan(70 + back.radius + 10);
  });

  it('gagne une fois avec tous les Dominators, gèle les dégâts puis repart proprement', () => {
    const c = setup('domination', [dominator(400, 500)]);
    const sim = create(c);
    arm(sim, 1);
    // Le Dominator capturé ne vise pas un tank protégé.
    sim.queueCommand(2, { type: 'sandbox', action: 'toggleGod' });
    const id = match(sim).objectives[0]!.entityId!;
    const events = fireUntil(
      sim,
      [1],
      () => entity(sim, id),
      (e) => e.some((event) => event.type === 'matchPhase'),
    );
    const team = own(sim, 1).team;
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'matchPhase', phase: 'finished', round: 1 }),
    );
    expect(match(sim).result).toMatchObject({ team, reason: 'dominators', playerId: null });
    const score = sim.snapshotFor(1)!.self.score;
    // Podium : tirs inoffensifs, ni XP ni second résultat.
    sim.queueCommand(2, { type: 'sandbox', action: 'toggleGod' });
    const after = fireUntil(sim, [1], () => own(sim, 2), undefined, 15);
    expect(after.filter((e) => e.type === 'matchPhase' || e.type === 'death')).toEqual([]);
    expect(sim.snapshotFor(1)!.self.score).toBe(score);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);

    const before = { p1: own(sim, 1).id, p2: own(sim, 2).id };
    input(sim, 1);
    const restart = step(sim, 10);
    expect(restart).toContainEqual({
      type: 'matchPhase',
      phase: 'playing',
      round: 2,
      result: null,
    });
    expect(
      restart.filter((e) => e.type === 'spawn').map((e) => e.type === 'spawn' && e.playerId),
    ).toEqual([1, 2]);
    const snap = sim.snapshotFor(1)!;
    expect(snap.self).toMatchObject({ score: scoreForLevel(45), classId: 'tank', alive: true });
    expect(own(sim, 1).id).not.toBe(before.p1);
    expect(own(sim, 2).id).not.toBe(before.p2);
    expect(snap.entities.filter((b) => b.kind === 'projectile')).toEqual([]);
    expect(match(sim)).toMatchObject({ phase: 'playing', round: 2, result: null });
    expect(match(sim).objectives[0]).toMatchObject({ team: 0, progress: 1 });
    expect(sim.config).toEqual(c);
  });

  it('revient en attente si un joueur part en cours de round', () => {
    const sim = create(setup('ctf', flags()));
    expect(match(sim).phase).toBe('playing');
    sim.removePlayer(2);
    expect(sim.step()).toContainEqual({
      type: 'matchPhase',
      phase: 'waiting',
      round: 1,
      result: null,
    });
  });
});

describe('Tag', () => {
  it('ne convertit pas un suicide, convertit au camp du tueur et rééquilibre au round suivant', () => {
    const sim = create(setup('tag'));
    const [a, b] = [own(sim, 1).team, own(sim, 2).team];
    expect(a).not.toBe(b);
    sim.queueCommand(2, { type: 'sandbox', action: 'selfDestruct' });
    sim.step();
    sim.queueCommand(2, { type: 'respawn' });
    sim.step();
    expect(own(sim, 2).team).toBe(b);
    arm(sim, 1);
    step(sim, 100);
    const events = fireUntil(
      sim,
      [1],
      () => own(sim, 2),
      (e) => e.some((x) => x.type === 'death'),
    );
    expect(events).toContainEqual({ type: 'teamChange', playerId: 2, team: a });
    expect(match(sim).result).toMatchObject({ team: a, reason: 'conversion' });
    expect(match(sim).scores.find((s) => s.team === a)).toMatchObject({ score: 2, players: 2 });
    step(sim, 21);
    expect(match(sim).phase).toBe('playing');
    expect([own(sim, 1).team, own(sim, 2).team]).toEqual([a, b]);
  });
});

function flags(): ObjectiveSite[] {
  return [
    { kind: 'flag', team: 1, x: 300, y: 500, radius: 40 },
    { kind: 'flag', team: 2, x: 550, y: 500, radius: 40 },
  ];
}
function walk(
  sim: Simulation,
  id: number,
  to: { x: number; y: number },
  until: (e: SimEvent[]) => boolean,
) {
  for (let tick = 0; tick < 600; tick++) {
    const tank = own(sim, id);
    const d = Math.hypot(to.x - tank.x, to.y - tank.y) || 1;
    input(sim, id, { move: { x: (to.x - tank.x) / d, y: (to.y - tank.y) / d } });
    const events = sim.step();
    if (until(events)) return events;
  }
  throw new Error('destination jamais atteinte');
}
const flagEvent = (action: string) => (events: SimEvent[]) =>
  events.some((e) => e.type === 'objective' && e.action === action);

describe('Capture the Flag', () => {
  it('prend, laisse tomber à la mort, puis un allié renvoie le drapeau', () => {
    const sim = create(setup('ctf', flags()));
    walk(sim, 1, { x: 550, y: 500 }, flagEvent('pickup'));
    expect(match(sim).objectives[1]!.flag).toMatchObject({ status: 'carried', carrierId: 1 });
    step(sim, 3);
    expect(match(sim).objectives[1]!.x).toBeCloseTo(own(sim, 1).x);
    const at = own(sim, 1);
    sim.queueCommand(1, { type: 'sandbox', action: 'selfDestruct' });
    const drop = sim.step();
    expect(drop).toContainEqual({
      type: 'objective',
      objectiveId: 1,
      kind: 'flag',
      action: 'drop',
      team: 2,
      playerId: 1,
    });
    const flag = match(sim).objectives[1]!;
    expect(flag).toMatchObject({ x: at.x, y: at.y, progress: 0 });
    expect(flag.flag).toMatchObject({ status: 'dropped', carrierId: null });
    expect(flag.flag!.returnTick).toBe(sim.tick + 900);
    walk(sim, 2, { x: at.x, y: at.y }, flagEvent('return'));
    expect(match(sim).objectives[1]).toMatchObject({ x: 550, y: 500, progress: 1 });
  });

  it('marque en ramenant le drapeau adverse à sa base et gagne au seuil', () => {
    const c = setup('ctf', flags());
    c.match!.scoreLimit = 1;
    const sim = create(c);
    walk(sim, 1, { x: 550, y: 500 }, flagEvent('pickup'));
    const events = walk(sim, 1, { x: 300, y: 500 }, flagEvent('score'));
    expect(events).toContainEqual(
      expect.objectContaining({ action: 'score', team: 1, playerId: 1 }),
    );
    expect(match(sim).result).toMatchObject({ team: 1, reason: 'flags' });
    expect(match(sim).objectives[1]!.flag!.status).toBe('home');
  });

  it('retour automatique et égalité à la limite de temps', () => {
    const c = setup('ctf', flags());
    c.match!.timeLimitTicks = 1200;
    const sim = create(c);
    walk(sim, 1, { x: 550, y: 500 }, flagEvent('pickup'));
    input(sim, 1);
    sim.queueCommand(1, { type: 'sandbox', action: 'selfDestruct' });
    sim.step();
    const back = step(sim, 900);
    expect(back).toContainEqual(expect.objectContaining({ action: 'return', playerId: null }));
    const end = step(sim, 1201 - sim.tick);
    expect(end).toContainEqual(
      expect.objectContaining({
        type: 'matchPhase',
        phase: 'finished',
        result: expect.objectContaining({ team: null, reason: 'timeLimit', tick: 1201 }),
      }),
    );
  });

  it('dépose le drapeau quand le porteur se déconnecte', () => {
    const sim = create(setup('ctf', flags()));
    walk(sim, 1, { x: 550, y: 500 }, flagEvent('pickup'));
    sim.removePlayer(1);
    sim.addPlayer(3, { name: 'P3' });
    sim.step();
    expect(match(sim, 2).objectives[1]!.flag!.status).toBe('dropped');
  });
});

describe('Breakout (convention du remake)', () => {
  const territory = (x: number, y: number, radius = 100): ObjectiveSite => ({
    kind: 'territory',
    team: 0,
    x,
    y,
    radius,
  });

  it('capture par présence exclusive, marque des points et gagne au seuil', () => {
    const c = setup('breakout', [territory(200, 500), territory(900, 100)]);
    c.match!.scoreLimit = 3;
    const sim = create(c);
    const events = step(sim, 245);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'objective', action: 'captured', team: 1, objectiveId: 0 }),
    );
    expect(match(sim).objectives[0]).toMatchObject({ team: 1, progress: 0 });
    expect(match(sim).phase).toBe('playing');
    step(sim, 100);
    expect(match(sim).result).toMatchObject({ team: 1, reason: 'territories' });
    expect(match(sim).scores.find((s) => s.team === 1)!.score).toBe(3);
  });

  it('gèle un territoire contesté et gagne en détenant tous les territoires', () => {
    const contested = create(setup('breakout', [territory(425, 500, 300)]));
    step(contested, 300);
    expect(match(contested).objectives[0]).toMatchObject({ team: 0, progress: 0, contested: true });
    const sim = create(setup('breakout', [territory(200, 500)]));
    step(sim, 120);
    expect(match(sim).objectives[0]).toMatchObject({ capturingTeam: 1 });
    expect(match(sim).objectives[0]!.progress).toBeCloseTo(0.5, 1);
    step(sim, 125);
    expect(match(sim).result).toMatchObject({ team: 1, reason: 'territories' });
  });
});

describe('Survival', () => {
  it('arrivant spectateur, élimination, dernier survivant et retour de tous au round suivant', () => {
    const sim = create(setup('survival'));
    expect(match(sim)).toMatchObject({ phase: 'playing', survivors: [1, 2] });
    sim.addPlayer(3, { name: 'P3' });
    sim.queueCommand(3, { type: 'respawn' });
    step(sim, 5);
    expect(sim.snapshotFor(3)!.self).toMatchObject({
      alive: false,
      spectator: true,
      respawnTick: null,
    });
    expect(match(sim).survivors).toEqual([1, 2]);
    sim.queueCommand(1, { type: 'sandbox', action: 'selfDestruct' });
    const events = sim.step();
    expect(events).toContainEqual(expect.objectContaining({ type: 'death' }));
    expect(sim.snapshotFor(1)!.self).toMatchObject({ spectator: true, respawnTick: null });
    expect(match(sim).result).toMatchObject({
      team: own(sim, 2).team,
      playerId: 2,
      name: 'P2',
      reason: 'lastSurvivor',
    });
    sim.queueCommand(1, { type: 'respawn' });
    sim.step();
    expect(sim.snapshotFor(1)!.self.alive).toBe(false);
    step(sim, 20);
    for (const id of [1, 2, 3]) {
      expect(sim.snapshotFor(id)!.self.alive).toBe(true);
      expect(sim.snapshotFor(id)!.self.spectator).toBeUndefined();
    }
    expect(match(sim)).toMatchObject({ round: 2, survivors: [1, 2, 3] });
  });

  it('la zone sûre rétrécit et blesse hors du cercle', () => {
    const c = setup('survival');
    c.match!.shrink = {
      delayTicks: 0,
      durationTicks: 30,
      finalRadiusFraction: 0.05,
      damagePerSecond: 30,
    };
    const sim = create(c);
    step(sim, 40);
    expect(match(sim).safeZone).toEqual({ x: 500, y: 500, radius: 50 });
    expect(own(sim, 1).health).toBeLessThan(own(sim, 1).maxHealth);
  });
});

describe('Mothership', () => {
  function motherships(): ModeConfig {
    const c = setup('mothership', [
      { kind: 'mothership', team: 1, x: 150, y: 500, radius: 110, classId: 'mothership' },
      { kind: 'mothership', team: 2, x: 2850, y: 500, radius: 110, classId: 'mothership' },
    ]);
    c.arena = { width: 3000, height: 1000 };
    c.map.zones = [
      { kind: 'spawn', team: 1, area: { x: 1300, y: 475, width: 50, height: 50 } },
      { kind: 'spawn', team: 2, area: { x: 2600, y: 75, width: 50, height: 50 } },
    ];
    return c;
  }

  it('détruire le vaisseau-mère adverse termine le round', () => {
    const sim = create(motherships());
    arm(sim, 1);
    const target = match(sim).objectives[1]!;
    const enemy = () =>
      sim.snapshotFor(1)!.entities.find((b) => b.id === target.entityId) ?? target;
    const events = fireUntil(
      sim,
      [1],
      enemy,
      (e) => e.some((x) => x.type === 'matchPhase'),
      2500,
      1550,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'objective',
        kind: 'mothership',
        action: 'destroyed',
        team: 2,
      }),
    );
    expect(match(sim).result).toMatchObject({ team: 1, reason: 'mothership' });
    expect(match(sim).objectives[1]).toMatchObject({ entityId: null, progress: 0 });
  });

  it('un allié pilote le vaisseau-mère puis récupère son propre tank', () => {
    const c = motherships();
    c.map.zones[0]!.area = { x: 290, y: 475, width: 10, height: 10 };
    const sim = create(c);
    const tank = own(sim, 1);
    const mothership = match(sim).objectives[0]!.entityId!;
    sim.queueCommand(1, { type: 'possess' });
    sim.step();
    expect(sim.snapshotFor(1)!.self.entityId).toBe(mothership);
    expect(sim.snapshotFor(1)!.entities.find((b) => b.id === tank.id)).toBeUndefined();
    const y = entity(sim, mothership)!.y;
    input(sim, 1, { move: { x: 0, y: -1 } });
    step(sim, 30);
    expect(entity(sim, mothership)!.y).toBeLessThan(y - 20);
    sim.queueCommand(1, { type: 'possess' });
    sim.step();
    expect(own(sim, 1).id).toBe(tank.id);
    expect(match(sim).objectives[0]!.possessedBy).toBeNull();
  });

  it('refuse possess hors mode, hors portée et sans tank', () => {
    const ffa = resolveModeConfig('ffa');
    ffa.arena = { width: 1000, height: 1000 };
    ffa.shapes.targetCount = 0;
    const sim = create(ffa, 1);
    sim.queueCommand(1, { type: 'possess' });
    expect(sim.step().some((e) => e.type === 'possess')).toBe(false);
    const far = create(motherships());
    far.queueCommand(1, { type: 'possess' });
    expect(far.step().some((e) => e.type === 'possess')).toBe(false);
  });
});

describe('boss classiques et IA', () => {
  function bossArena(pool: string[]): ModeConfig {
    const c = resolveModeConfig('teams2');
    // Un seul camp : les joueurs coopèrent contre le boss neutre, sans tir allié.
    c.teams = [c.teams[0]!];
    c.arena = { width: 1600, height: 1600 };
    c.shapes.targetCount = 0;
    c.sandbox.cheats = true;
    c.progression.startLevel = 45;
    c.bosses = { enabled: true, firstSpawnTicks: 1, intervalTicks: 1_000_000, maxAlive: 1, pool };
    return c;
  }

  it.each(CLASSIC_BOSSES)('%s apparaît, est visible et attaque un joueur', (classId) => {
    const sim = create(bossArena([classId]), 1, 3);
    const boss = sim.snapshotFor(1)!.entities.find((b) => b.kind === 'tank' && b.playerId === null);
    expect(boss).toMatchObject({ classId, team: 0, health: 3000, maxHealth: 3000 });
    let hurt = false;
    for (let tick = 0; tick < 1200 && !hurt; tick++) {
      const events = sim.step();
      const self = sim.snapshotFor(1)!.self;
      hurt =
        events.some((e) => e.type === 'death') ||
        (self.alive && own(sim).health < own(sim).maxHealth);
    }
    expect(hurt).toBe(true);
  });

  it('un boss endommageable rapporte ses XP et emporte ses drones', () => {
    const sim = create(bossArena(['summoner']), 4, 5);
    for (let id = 1; id <= 4; id++) arm(sim, id);
    const boss = () =>
      sim.snapshotFor(1)!.entities.find((b) => b.kind === 'tank' && b.playerId === null);
    const id = boss()!.id;
    const events = fireUntil(
      sim,
      [1, 2, 3, 4],
      boss,
      (e) => e.some((x) => x.type === 'boss'),
      3000,
    );
    const death = events.find((e) => e.type === 'boss')!;
    expect(death).toMatchObject({ action: 'death', entityId: id, classId: 'summoner' });
    const killer = death.type === 'boss' ? death.killerPlayerId : null;
    expect(killer).not.toBeNull();
    expect(sim.snapshotFor(killer!)!.self.score).toBeGreaterThanOrEqual(scoreForLevel(45) + 12_000);
    for (let i = 1; i <= 4; i++)
      expect(
        sim.snapshotFor(i)!.entities.filter((b) => b.kind === 'projectile' && b.ownerId === id),
      ).toEqual([]);
  });

  it('borne la population : maxAlive, cap dur de 8 et horloge sans rattrapage', () => {
    const c = bossArena([]);
    c.bosses = { enabled: true, firstSpawnTicks: 5, intervalTicks: 10, maxAlive: 2 };
    const sim = createSimulation({ config: c, seed: 1 });
    sim.addPlayer(1, { name: 'P1' });
    sim.queueCommand(1, { type: 'sandbox', action: 'toggleGod' });
    const spawns: [number, string][] = [];
    for (let tick = 0; tick < 200; tick++)
      for (const e of sim.step())
        if (e.type === 'boss' && e.action === 'spawn') spawns.push([sim.tick, e.classId]);
    expect(spawns).toEqual([
      [5, 'guardian-of-the-pentagons'],
      [15, 'summoner'],
    ]);
    for (let i = 0; i < 20; i++) sim.queueCommand(1, { type: 'sandbox', action: 'summonBoss' });
    sim.step();
    const bosses = sim
      .snapshotFor(1)!
      .entities.filter((b) => b.kind === 'tank' && b.playerId === null);
    expect(bosses).toHaveLength(8);
    expect(new Set(bosses.map((b) => b.kind === 'tank' && b.classId))).toEqual(
      new Set(CLASSIC_BOSSES),
    );
  });

  it('nid : Alpha Pentagons, Crashers qui chargent, variantes rares', () => {
    const c = resolveModeConfig('ffa');
    c.arena = { width: 1000, height: 1000 };
    c.shapes.targetCount = 10;
    c.shapes.nest = { radius: 250, alphaShare: 0.1, crasherShare: 0.5 };
    c.shapes.shinyChance = 1;
    delete c.bosses;
    const sim = create(c, 1);
    const shapes = sim.snapshotFor(1)!.entities.filter((b) => b.kind === 'shape');
    const count = (shape: string) => shapes.filter((b) => b.kind === 'shape' && b.shape === shape);
    expect(count('alphaPentagon')).toHaveLength(1);
    expect(count('alphaPentagon')[0]).toMatchObject({ health: 3000, shiny: false });
    expect(count('crasher')).toHaveLength(5);
    for (const shape of count('square')) expect(shape).toMatchObject({ shiny: true, health: 1000 });
    let hurt = false;
    for (let tick = 0; tick < 900 && !hurt; tick++) {
      const tank = own(sim);
      const d = Math.hypot(500 - tank.x, 500 - tank.y) || 1;
      input(sim, 1, {
        move: d > 60 ? { x: (500 - tank.x) / d, y: (500 - tank.y) / d } : { x: 0, y: 0 },
      });
      const events = sim.step();
      hurt = events.some((e) => e.type === 'death') || own(sim).health < own(sim).maxHealth;
    }
    expect(hurt).toBe(true);
  });

  it('rejoue à l’identique un round avec IA, objectifs et boss', () => {
    const run = () => {
      const c = setup('domination', [
        dominator(400, 500, 'dominator-gunner'),
        dominator(800, 200, 'dominator-trapper'),
      ]);
      c.bosses = { enabled: true, firstSpawnTicks: 10, intervalTicks: 200, maxAlive: 2 };
      const sim = create(c, 3, 9);
      for (let tick = 0; tick < 400; tick++) {
        for (let id = 1; id <= 3; id++)
          input(sim, id, {
            move: { x: Math.sin(tick / 30 + id), y: Math.cos(tick / 25 + id) },
            aim: { x: Math.cos(tick / 10), y: Math.sin(tick / 10) },
            fire: tick % 50 < 35,
          });
        if (tick === 100) sim.queueCommand(1, { type: 'possess' });
        sim.step();
      }
      return JSON.stringify([1, 2, 3].map((id) => sim.snapshotFor(id)));
    };
    expect(run()).toBe(run());
  });
});

describe('préréglages réels', () => {
  it.each(['domination', 'tag', 'ctf', 'breakout', 'survival', 'mothership'] as const)(
    '%s : carte générée, quatre joueurs actifs, snapshots sérialisables',
    (mode) => {
      const c = prepareModeConfig(resolveModeConfig(mode, { arenaSize: 'small' }), 21);
      const sim = create(c, 4, 21);
      const phases = new Set<string>();
      for (let tick = 0; tick < 600; tick++) {
        for (let id = 1; id <= 4; id++) {
          sim.queueCommand(id, { type: 'respawn' });
          if (tick % 97 === id) sim.queueCommand(id, { type: 'possess' });
          input(sim, id, {
            move: { x: Math.sin(tick / 40 + id), y: Math.cos(tick / 35 + id * 2) },
            aim: { x: Math.cos(tick / 15 + id) * 400, y: Math.sin(tick / 15 + id) * 400 },
            fire: tick % 60 < 45,
          });
        }
        sim.step();
        phases.add(match(sim).phase);
      }
      expect(phases.has('playing')).toBe(true);
      for (let id = 1; id <= 4; id++) {
        const snap = sim.snapshotFor(id)!;
        expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
        expect(snap.match!.objectives).toHaveLength(c.map.objectives!.length);
      }
      expect(sim.config).toEqual(c);
    },
  );
});

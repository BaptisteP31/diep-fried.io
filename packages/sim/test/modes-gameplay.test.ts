import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  resolveModeConfig,
  type ModeConfig,
  type ModeId,
  type PlayerCommand,
  type PlayerInput,
  type TankState,
} from '@diep-fried/shared';
import { createSimulation, prepareModeConfig, type Simulation, type SimEvent } from '../src';
import { circleVsWalls, generateMaze, generateTeamLayout } from '../src/maps';

function config(mode: ModeId = 'sandbox'): ModeConfig {
  const c = resolveModeConfig(mode);
  c.arena = { width: 1000, height: 1000 };
  c.shapes.targetCount = 0;
  return c;
}
function create(c = config(), seed = 1, players = 1): Simulation {
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
function command(
  sim: Simulation,
  action: Extract<PlayerCommand, { type: 'sandbox' }>['action'],
  id = 1,
): SimEvent[] {
  sim.queueCommand(id, { type: 'sandbox', action });
  return sim.step();
}
function choose(sim: Simulation, classId: string): void {
  const catalog = Object.keys(CLASS_DEFINITIONS);
  const current = sim.snapshotFor(1)!.self.classId;
  const count =
    (catalog.indexOf(classId) - catalog.indexOf(current) + catalog.length) % catalog.length;
  for (let i = 0; i < count; i++) sim.queueCommand(1, { type: 'sandbox', action: 'cycleClass' });
  sim.step();
  expect(sim.snapshotFor(1)!.self.classId).toBe(classId);
}

// Des zones de spawn resserrées permettent des scénarios précis via la seule API publique.
function duel(wallX?: number): ModeConfig {
  const c = config('teams2');
  c.progression.startLevel = 45;
  c.sandbox.cheats = true;
  c.map.zones = [
    { kind: 'spawn', team: 1, area: { x: 175, y: 475, width: 50, height: 50 } },
    { kind: 'spawn', team: 2, area: { x: 625, y: 475, width: 50, height: 50 } },
  ];
  if (wallX !== undefined) c.map.walls = [{ x: wallX, y: 0, width: 20, height: 1000 }];
  return c;
}

describe('cartes résolues avant simulation', () => {
  it('génère une carte reproductible, copiée et inchangée par la simulation', () => {
    const preset = resolveModeConfig('maze', { arenaSize: 'small' });
    const resolved = prepareModeConfig(preset, 17);
    expect(preset.map.walls).toEqual([]);
    expect(resolved.map.walls).toEqual(generateMaze({ ...resolved.arena, seed: 17 }));
    expect(prepareModeConfig(preset, 18).map.walls).not.toEqual(resolved.map.walls);
    const sim = create(resolved, 17);
    expect(sim.config).toEqual(resolved);
    resolved.map.walls.length = 0;
    expect(sim.config.map.walls.length).toBeGreaterThan(0);
  });

  it.each(['teams2', 'teams4'] as const)('intègre le layout existant pour %s', (mode) => {
    const c = prepareModeConfig(resolveModeConfig(mode), 8);
    expect(c.map.zones).toEqual(generateTeamLayout(5000, 5000, mode === 'teams2' ? 2 : 4));
    expect(c.teams).toHaveLength(mode === 'teams2' ? 2 : 4);
  });

  it('respecte une carte explicitement fournie', () => {
    const c = config('maze');
    c.map.walls = [{ x: 400, y: 0, width: 20, height: 500 }];
    expect(prepareModeConfig(c, 32)).toEqual(c);
  });
});

describe('équipes et bases', () => {
  it.each(['teams2', 'teams4'] as const)('équilibre %s et conserve le camp au respawn', (mode) => {
    const c = prepareModeConfig(resolveModeConfig(mode, { arenaSize: 'small' }), 3);
    c.shapes.targetCount = 0;
    c.sandbox.cheats = true;
    c.respawn.delayTicks = 0;
    const sim = create(c, 3, 11);
    const counts = c.teams.map(
      (team) =>
        Array.from({ length: 11 }, (_, i) => own(sim, i + 1).team).filter((id) => id === team.id)
          .length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    const before = own(sim, 1);
    const zone = c.map.zones.find((z) => z.kind === 'spawn' && z.team === before.team)!;
    expect(before.x - before.radius).toBeGreaterThanOrEqual(zone.area.x);
    expect(before.y - before.radius).toBeGreaterThanOrEqual(zone.area.y);
    command(sim, 'selfDestruct');
    sim.queueCommand(1, { type: 'respawn' });
    sim.step();
    expect(own(sim).team).toBe(before.team);
    expect(own(sim).id).not.toBe(before.id);
    sim.removePlayer(1);
    sim.addPlayer(30, { name: 'Nouveau' });
    sim.step();
    expect(own(sim, 30).team).toBe(before.team);
  });

  it('laisse passer les tirs alliés sans dégâts de balle ni contact', () => {
    const c = duel();
    c.map.zones[0]!.area = { x: 100, y: 350, width: 180, height: 300 };
    const sim = create(c, 9, 3);
    expect(own(sim, 1).team).toBe(own(sim, 3).team);
    for (let tick = 0; tick < 250; tick++) {
      const a = own(sim, 1),
        b = own(sim, 3);
      input(sim, 1, {
        aim: { x: b.x - a.x, y: b.y - a.y },
        fire: true,
        move: { x: b.x - a.x, y: b.y - a.y },
      });
      input(sim, 3, { fire: true });
      sim.step();
    }
    expect(own(sim, 1).health).toBe(own(sim, 1).maxHealth);
    expect(own(sim, 3).health).toBe(own(sim, 3).maxHealth);
  });

  it('protège la base même en tirant, repousse les intrus et rend les gardes comme drones', () => {
    const c = prepareModeConfig(resolveModeConfig('teams2', { arenaSize: 'small' }), 5);
    c.shapes.targetCount = 30;
    c.sandbox.cheats = true;
    const sim = create(c, 5, 2);
    command(sim, 'toggleGod', 2);
    input(sim, 1, { fire: true });
    input(sim, 2, { move: { x: -1, y: 0 }, fire: true, aim: { x: -1000, y: 0 } });
    step(sim, 600);
    const base = c.map.zones.find((z) => z.kind === 'base' && z.team === own(sim).team)!;
    expect(own(sim).spawnProtected).toBe(true);
    expect(own(sim).health).toBe(own(sim).maxHealth);
    expect(own(sim, 2).x - own(sim, 2).radius).toBeGreaterThanOrEqual(
      base.area.x + base.area.width,
    );
    const drones = sim
      .snapshotFor(1)!
      .entities.filter(
        (b) => b.kind === 'projectile' && b.family === 'drone' && b.team === own(sim).team,
      );
    expect(drones.length).toBeGreaterThan(0);
    for (const b of sim.snapshotFor(1)!.entities.filter((b) => b.kind === 'shape'))
      expect(
        circleVsWalls(
          b.x,
          b.y,
          b.radius,
          c.map.zones.filter((z) => z.kind === 'base').map((z) => z.area),
        ),
      ).toBe(false);
  });

  it('les gardes chassent un ennemi au bord de la base sans donner d’XP à un joueur', () => {
    const c = prepareModeConfig(resolveModeConfig('teams2', { arenaSize: 'small' }), 5);
    c.shapes.targetCount = 0;
    const sim = create(c, 5, 2);
    input(sim, 2, { move: { x: -1, y: 0 } });
    const events = step(sim, 600);
    expect(
      events.some(
        (e) =>
          e.type === 'death' && e.death.playerId === 2 && e.death.killerName === 'Défense de base',
      ),
    ).toBe(true);
    expect(sim.snapshotFor(1)!.self.score).toBe(0);
  });
});

describe('murs Maze et ligne de vue', () => {
  it('ne fait pas naître les tirs derrière un mur plus fin que la longueur du canon', () => {
    const c = duel(228);
    c.map.walls[0]!.width = 2;
    c.tickRate = 1;
    const sim = create(c, 1, 2);
    step(sim, 4);
    input(sim, 1, { fire: true });
    step(sim, 5);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
    expect(sim.snapshotFor(1)!.entities.filter((b) => b.kind === 'projectile')).toEqual([]);
  });

  it('bloque tanks et formes sans pénétration ni changement de côté', () => {
    const c = config('maze');
    c.map.walls = [{ x: 490, y: 0, width: 20, height: 1000 }];
    c.shapes.targetCount = 40;
    const sim = create(c, 7);
    const side = new Map(sim.snapshotFor(1)!.entities.map((b) => [b.id, b.x < 500]));
    input(sim, 1, { move: { x: own(sim).x < 500 ? 1 : -1, y: 0 } });
    for (let tick = 0; tick < 300; tick++) {
      sim.step();
      for (const b of sim.snapshotFor(1)!.entities) {
        expect(circleVsWalls(b.x, b.y, b.radius, c.map.walls)).toBe(false);
        if (side.has(b.id)) expect(b.x < 500).toBe(side.get(b.id));
      }
    }
  });

  it('garde les spawns libres sur une carte générée, même aux coins', () => {
    const c = prepareModeConfig(resolveModeConfig('maze', { arenaSize: 'small' }), 33);
    c.shapes.targetCount = 60;
    const sim = create(c, 33, 16);
    for (let id = 1; id <= 16; id++) {
      const b = own(sim, id);
      expect(circleVsWalls(b.x, b.y, b.radius, c.map.walls)).toBe(false);
      for (const shape of sim.snapshotFor(id)!.entities.filter((e) => e.kind === 'shape'))
        expect(circleVsWalls(shape.x, shape.y, shape.radius, c.map.walls)).toBe(false);
    }
  });

  it('arrête un tir de 600 unités/tick au mur et permet une cible avant le mur', () => {
    const c = duel(400);
    c.tickRate = 1;
    const sim = create(c, 1, 2);
    input(sim, 1, { fire: true });
    step(sim, 10);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
    expect(sim.snapshotFor(1)!.entities.filter((b) => b.kind === 'projectile')).toEqual([]);
    const before = duel(800);
    before.tickRate = 1;
    const other = create(before, 1, 2);
    input(other, 1, { fire: true });
    step(other, 5);
    expect(own(other, 2).health).toBeLessThan(own(other, 2).maxHealth);
  });

  it.each(['overseer', 'factory'] as const)(
    'bloque les %s guidés et leurs tirs au mur',
    (classId) => {
      const sim = create(duel(400), 1, 2);
      choose(sim, classId);
      input(sim, 1, { fire: true, aim: { x: 450, y: 0 } });
      step(sim, 300);
      const controlled = sim
        .snapshotFor(1)!
        .entities.filter(
          (b) => b.kind === 'projectile' && (b.family === 'drone' || b.family === 'minion'),
        );
      expect(controlled.length).toBeGreaterThan(0);
      for (const b of controlled) {
        expect(b.x + b.radius).toBeLessThanOrEqual(400);
        expect(circleVsWalls(b.x, b.y, b.radius, sim.config.map.walls)).toBe(false);
      }
      expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
    },
  );

  it('les tourelles ignorent une cible cachée par un mur', () => {
    const sim = create(duel(400), 1, 2);
    choose(sim, 'auto-tank');
    step(sim, 180);
    const tank = own(sim);
    expect(tank.barrelShots.every((tick) => tick === -1)).toBe(true);
    expect(sim.snapshotFor(1)!.entities.filter((b) => b.kind === 'projectile')).toEqual([]);
  });
});

describe('commandes sandbox autoritaires', () => {
  it('ajoute exactement un niveau, son événement et ses points, plafonné à 45', () => {
    const sim = create();
    expect(command(sim, 'levelUp')).toContainEqual({ type: 'levelUp', playerId: 1, level: 2 });
    expect(sim.snapshotFor(1)!.self.level).toBe(2);
    expect(sim.snapshotFor(1)!.self.statPoints).toBe(1);
    for (let i = 0; i < 60; i++) sim.queueCommand(1, { type: 'sandbox', action: 'levelUp' });
    sim.step();
    expect(sim.snapshotFor(1)!.self.level).toBe(45);
    expect(sim.snapshotFor(1)!.self.statPoints).toBe(33);
    const score = sim.snapshotFor(1)!.self.score;
    expect(command(sim, 'levelUp')).toEqual([]);
    expect(sim.snapshotFor(1)!.self.score).toBe(score);
  });

  it('parcourt les 54 classes sans modifier niveau/score, puis revient au Tank', () => {
    const sim = create();
    const seen = new Set([own(sim).classId]);
    for (let i = 1; i < 54; i++) {
      command(sim, 'cycleClass');
      seen.add(own(sim).classId);
      expect(sim.snapshotFor(1)!.self.level).toBe(1);
      expect(sim.snapshotFor(1)!.self.score).toBe(0);
    }
    expect([...seen].sort()).toEqual(Object.keys(CLASS_DEFINITIONS).sort());
    command(sim, 'cycleClass');
    expect(own(sim).classId).toBe('tank');
  });

  it('nettoie les drones et la caméra au changement de classe', () => {
    const sim = create();
    choose(sim, 'overseer');
    step(sim, 90);
    expect(
      sim.snapshotFor(1)!.entities.some((b) => b.kind === 'projectile' && b.family === 'drone'),
    ).toBe(true);
    command(sim, 'cycleClass');
    expect(
      sim.snapshotFor(1)!.entities.some((b) => b.kind === 'projectile' && b.family === 'drone'),
    ).toBe(false);
    choose(sim, 'predator');
    input(sim, 1, { alt: true });
    sim.step();
    expect(own(sim).cameraOffset).toBeDefined();
    command(sim, 'cycleClass');
    expect(own(sim).cameraOffset).toBeUndefined();
  });

  it('suicide : un événement de mort, zéro XP et respawn sans god', () => {
    const sim = create(config(), 1, 2);
    command(sim, 'levelUp');
    command(sim, 'toggleGod');
    const score = sim.snapshotFor(1)!.self.score;
    const events = command(sim, 'selfDestruct');
    expect(events.filter((e) => e.type === 'death')).toHaveLength(1);
    expect(sim.snapshotFor(1)!.self.alive).toBe(false);
    expect(sim.snapshotFor(1)!.self.score).toBe(score);
    expect(sim.snapshotFor(2)!.self.score).toBe(0);
    command(sim, 'levelUp');
    expect(sim.snapshotFor(1)!.self.score).toBe(score);
    sim.queueCommand(1, { type: 'respawn' });
    sim.step();
    input(sim, 1, { fire: true });
    sim.step();
    expect(own(sim).spawnProtected).toBe(false);
  });

  it('god est visible, résiste aux tirs puis cesse au second toggle', () => {
    const sim = create(duel(), 1, 2);
    command(sim, 'toggleGod', 2);
    input(sim, 1, { fire: true });
    input(sim, 2, { fire: true });
    step(sim, 160);
    expect(own(sim, 2).spawnProtected).toBe(true);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
    command(sim, 'toggleGod', 2);
    expect(own(sim, 2).spawnProtected).toBe(false);
    step(sim, 60);
    expect(own(sim, 2).health).toBeLessThan(own(sim, 2).maxHealth);
  });

  it.each(['ffa', 'maze', 'teams2', 'teams4', 'sandbox'] as const)(
    'refuse toutes les triches si cheats=false (%s)',
    (mode) => {
      const c = config(mode);
      c.sandbox.cheats = false;
      const sim = create(c);
      step(sim, 100);
      const initial = sim.snapshotFor(1)!.self;
      for (const action of ['levelUp', 'cycleClass', 'selfDestruct', 'toggleGod'] as const) {
        expect(command(sim, action)).toEqual([]);
        expect(sim.snapshotFor(1)!.self).toEqual(initial);
        expect(own(sim).spawnProtected).toBe(false);
      }
    },
  );
});

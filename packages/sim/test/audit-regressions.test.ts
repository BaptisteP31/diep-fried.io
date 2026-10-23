import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  resolveModeConfig,
  type ModeConfig,
  type PlayerInput,
  type ProjectileState,
  type TankState,
} from '@diep-fried/shared';
import { createSimulation, prepareModeConfig, type Simulation } from '../src';

// Findings 1 et 5 : uniquement l'API publique, sans commandes Sandbox.
function duel(bases = true): ModeConfig {
  const config = resolveModeConfig('teams2');
  config.progression.startLevel = 45;
  config.shapes.targetCount = 0;
  config.arena = { width: 2000, height: 1000 };
  const zones: ModeConfig['map']['zones'] = [
    { kind: 'base', team: 1, area: { x: 0, y: 0, width: 300, height: 1000 } },
    { kind: 'spawn', team: 1, area: { x: 175, y: 475, width: 50, height: 50 } },
    { kind: 'base', team: 2, area: { x: 1700, y: 0, width: 300, height: 1000 } },
    { kind: 'spawn', team: 2, area: { x: 725, y: 475, width: 50, height: 50 } },
  ];
  config.map.zones = zones.filter((zone) => bases || zone.kind !== 'base');
  return config;
}

function create(config = duel(), players = 2): Simulation {
  expect(config.sandbox.cheats).toBe(false);
  const sim = createSimulation({ config, seed: 1 });
  for (let id = 1; id <= players; id++) sim.addPlayer(id, { name: `P${id}` });
  sim.step();
  return sim;
}

function own(sim: Simulation, id = 1): TankState {
  const snapshot = sim.snapshotFor(id)!;
  const tank = snapshot.entities.find((body) => body.id === snapshot.self.entityId);
  if (tank?.kind !== 'tank') throw new Error(`Player ${id} is dead at tick ${sim.tick}`);
  return tank;
}

function shots(sim: Simulation, id = 1): ProjectileState[] {
  return sim.snapshotFor(id)!.entities.filter((body) => body.kind === 'projectile');
}

function step(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
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

function choose(sim: Simulation, target: string, id = 1): void {
  const path = (at: string): string[] | undefined => {
    if (at === target) return [];
    for (const child of CLASS_DEFINITIONS[at]!.upgradesTo) {
      const tail = path(child);
      if (tail) return [child, ...tail];
    }
  };
  for (const classId of path('tank')!) sim.queueCommand(id, { type: 'chooseClass', classId });
  sim.step();
  expect(sim.snapshotFor(id)!.self.classId).toBe(target);
}

function factoryDuel(config: ModeConfig): Simulation {
  const sim = create(config);
  choose(sim, 'factory');
  choose(sim, 'annihilator', 2);
  for (let i = 0; i < 7; i++) sim.queueCommand(2, { type: 'upgradeStat', stat: 'maxHealth' });
  step(sim, 100);
  return sim;
}

function exchange(sim: Simulation, baseEdge: number) {
  let damaged = false;
  let offensive = false;
  let outside = false;
  for (let i = 0; i < 120 && sim.snapshotFor(2)!.self.alive; i++) {
    const owner = own(sim);
    const enemy = own(sim, 2);
    const minions = shots(sim).filter((body) => body.family === 'minion');
    outside ||= minions.some((body) => body.x - body.radius > baseEdge);
    const target = minions.find((body) => body.x > baseEdge + 150) ?? owner;
    input(sim, 1, { fire: true, aim: { x: enemy.x - owner.x, y: enemy.y - owner.y } });
    input(sim, 2, { fire: true, aim: { x: target.x - enemy.x, y: target.y - enemy.y } });
    sim.step();
    offensive ||= !sim.snapshotFor(2)!.self.alive || own(sim, 2).health < enemy.health;
    damaged ||= shots(sim).some(
      (body) => body.family === 'minion' && body.health! < body.maxHealth!,
    );
  }
  return { damaged, offensive, outside };
}

describe('audit finding 1 : protection des unités Factory', () => {
  it.each([true, false])('les minions hors base sont vulnérables (bases = %s)', (bases) => {
    const sim = factoryDuel(duel(bases));
    expect(exchange(sim, 300)).toEqual({ damaged: true, offensive: true, outside: true });
    expect(own(sim).spawnProtected).toBe(bases);
  });

  it('reproduit la vulnérabilité sur le layout teams2 standard par simples déplacements', () => {
    const config = prepareModeConfig(resolveModeConfig('teams2', { arenaSize: 'small' }), 1);
    config.progression.startLevel = 45;
    config.shapes.targetCount = 0;
    const sim = factoryDuel(config);
    const base = config.map.zones.find((zone) => zone.kind === 'base' && zone.team === 1)!;
    const edge = base.area.x + base.area.width;
    const destination = { x: edge + 550, y: own(sim).y };
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    for (let i = 0; i < 600; i++) {
      const enemy = own(sim, 2);
      input(sim, 2, {
        move: {
          x: clamp((destination.x - enemy.x) / 50),
          y: clamp((destination.y - enemy.y) / 50),
        },
      });
      sim.step();
    }
    expect(Math.hypot(own(sim, 2).x - destination.x, own(sim, 2).y - destination.y)).toBeLessThan(
      1,
    );
    expect(exchange(sim, edge)).toEqual({ damaged: true, offensive: true, outside: true });
    expect(own(sim).spawnProtected).toBe(true);
    expect(own(sim).health).toBe(own(sim).maxHealth);
  });

  it('un minion physiquement dans sa base ne tire pas de balle secondaire manuelle', () => {
    const sim = create(duel(), 1);
    choose(sim, 'factory');
    step(sim, 200);
    input(sim, 1, { fire: true, aim: { x: 50, y: 0 } });
    step(sim, 20);
    const minions = shots(sim).filter((body) => body.family === 'minion');
    expect(minions).toHaveLength(6);
    expect(minions.every((body) => body.x + body.radius <= 300)).toBe(true);
    expect(minions.every((body) => body.barrelShots!.every((tick) => tick === -1))).toBe(true);
    expect(shots(sim).filter((body) => body.family === 'bullet' && body.team === 1)).toEqual([]);
  });

  it.each(['factory', 'manager'])(
    '%s garde sa protection temporaire sans attaque automatique',
    (classId) => {
      const sim = create(duel(false));
      choose(sim, classId);
      for (let i = 0; i < 100 && own(sim).spawnProtected; i++) {
        const enemy = own(sim, 2);
        expect(enemy.health).toBe(enemy.maxHealth);
        expect(shots(sim).filter((body) => body.family === 'bullet' && body.team === 1)).toEqual(
          [],
        );
        sim.step();
      }
      expect(own(sim).spawnProtected).toBe(false);
      let offensive = false;
      for (let i = 0; i < 200 && sim.snapshotFor(2)!.self.alive; i++) {
        sim.step();
        offensive ||= !sim.snapshotFor(2)!.self.alive || own(sim, 2).health < own(sim, 2).maxHealth;
      }
      expect(offensive).toBe(true);
    },
  );
});

function stealthDuel(classId: string): Simulation {
  const config = duel(false);
  // L'allié doit avoir sa propre place ; l'adversaire reste à portée, protégé des drones Manager.
  config.map.zones[0]!.area = { x: 100, y: 350, width: 200, height: 300 };
  config.map.zones.push({
    kind: 'base',
    team: 2,
    area: { x: 650, y: 0, width: 1350, height: 1000 },
  });
  const sim = create(config, 3);
  choose(sim, classId);
  return sim;
}

describe('audit finding 5 : camouflage dans les snapshots', () => {
  it.each(['stalker', 'manager', 'landmine'])(
    '%s disparaît uniquement pour les ennemis à opacité zéro et revient dès révélation',
    (classId) => {
      const sim = stealthDuel(classId);
      const id = own(sim).id;
      let fading = false;
      for (let i = 0; i < 500; i++) {
        const tank = own(sim);
        fading ||= tank.opacity > 0 && tank.opacity < 1;
        expect(sim.snapshotFor(2)!.entities.find((body) => body.id === id)).toEqual(
          tank.opacity > 0 ? tank : undefined,
        );
        sim.step();
      }
      expect(fading).toBe(true);
      const hidden = own(sim);
      expect(hidden.opacity).toBe(0);
      expect(own(sim, 3).team).toBe(hidden.team);
      expect(sim.snapshotFor(3)!.entities.find((body) => body.id === id)).toEqual(hidden);
      expect(sim.snapshotFor(2)!.entities.find((body) => body.id === id)).toBeUndefined();
      // Aucun ownerId de drone ne doit divulguer l'identifiant du tank masqué.
      expect(shots(sim, 2).some((body) => body.ownerId === id)).toBe(false);
      if (classId === 'manager') {
        const drones = shots(sim).filter((body) => body.ownerId === id);
        expect(drones.length).toBeGreaterThan(0);
        expect(
          shots(sim, 2).filter((body) => drones.some((drone) => drone.id === body.id)),
        ).toHaveLength(drones.length);
        input(sim, 1, { fire: true });
        step(sim, 15);
        expect(own(sim).opacity).toBe(0);
        expect(sim.snapshotFor(2)!.entities.some((body) => body.id === id)).toBe(false);
      }
      input(sim, 1, { move: { x: 0, y: 1 } });
      sim.step();
      expect(own(sim).opacity).toBe(1);
      expect(sim.snapshotFor(2)!.entities.find((body) => body.id === id)).toEqual(own(sim));
      if (classId === 'manager')
        expect(shots(sim, 2).some((body) => body.ownerId === id)).toBe(true);
    },
  );

  it('Landmine reste une cible physique des tirs manuels et se révèle après les dégâts', () => {
    const sim = stealthDuel('landmine');
    step(sim, 500);
    const hidden = own(sim);
    expect(hidden.opacity).toBe(0);
    expect(sim.snapshotFor(2)!.entities.some((body) => body.id === hidden.id)).toBe(false);
    const enemy = own(sim, 2);
    input(sim, 2, { fire: true, aim: { x: hidden.x - enemy.x, y: hidden.y - enemy.y } });
    let damaged = false;
    for (let i = 0; i < 100; i++) {
      sim.step();
      if (own(sim).health < hidden.health) {
        damaged = true;
        break;
      }
    }
    expect(damaged).toBe(true);
    sim.step();
    expect(own(sim).opacity).toBe(1);
    expect(sim.snapshotFor(2)!.entities.find((body) => body.id === hidden.id)).toEqual(own(sim));
  });

  it('FFA masque aussi les adversaires sans équipe commune', () => {
    const config = duel(false);
    config.mode = 'ffa';
    config.teams = [];
    config.arena = { width: 1000, height: 1000 };
    const sim = create(config);
    choose(sim, 'stalker');
    expect(sim.snapshotFor(2)!.entities.some((body) => body.id === own(sim).id)).toBe(true);
    step(sim, 500);
    const hidden = own(sim);
    expect(hidden.team).not.toBe(own(sim, 2).team);
    expect(hidden.opacity).toBe(0);
    expect(sim.snapshotFor(2)!.entities.some((body) => body.id === hidden.id)).toBe(false);
  });
});

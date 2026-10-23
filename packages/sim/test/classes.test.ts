import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  STAT_IDS,
  resolveModeConfig,
  type ClassId,
  type ModeConfig,
  type PlayerInput,
  type ProjectileState,
  type TankState,
} from '@diep-fried/shared';
import catalog from '../../../docs/specification/content-catalog.json';
import { createSimulation, type Simulation } from '../src';
import { BALANCE as B } from '../src/balance';

function create(setup?: (config: ModeConfig) => void, seed = 1): Simulation {
  const config = resolveModeConfig('sandbox');
  config.progression.startLevel = 45;
  config.arena = { width: 2000, height: 2000 };
  config.shapes.targetCount = 0;
  setup?.(config);
  const sim = createSimulation({ config, seed });
  sim.addPlayer(1, { name: 'A' });
  sim.step();
  return sim;
}
function tank(sim: Simulation, id = 1): TankState {
  const snap = sim.snapshotFor(id)!;
  const own = snap.entities.find((body) => body.id === snap.self.entityId);
  if (own?.kind !== 'tank') throw new Error('Expected tank');
  return own;
}
function shots(sim: Simulation, family?: ProjectileState['family'], id = 1): ProjectileState[] {
  return sim
    .snapshotFor(id)!
    .entities.filter(
      (b): b is ProjectileState =>
        b.kind === 'projectile' && (family === undefined || b.family === family),
    );
}
function step(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}
function input(sim: Simulation, patch: Partial<PlayerInput> = {}, id = 1): void {
  sim.setInput(id, {
    seq: sim.tick + 1,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 600 },
    fire: false,
    alt: false,
    ...patch,
  });
}
function pathTo(id: string, at = 'tank', path: string[] = []): string[] | undefined {
  if (at === id) return path;
  for (const child of catalog.tanks.find((c) => c.id === at)!.upgradesTo) {
    const found = pathTo(id, child, [...path, child]);
    if (found) return found;
  }
  return undefined;
}
function choose(sim: Simulation, id: ClassId): void {
  for (const classId of pathTo(id)!) sim.queueCommand(1, { type: 'chooseClass', classId });
  sim.step();
  expect(sim.snapshotFor(1)!.self.classId).toBe(id);
}
function invest(sim: Simulation, stat: (typeof STAT_IDS)[number], count: number): void {
  for (let i = 0; i < count; i++) sim.queueCommand(1, { type: 'upgradeStat', stat });
  sim.step();
}

describe('catalogue jouable', () => {
  it('contient exactement les 54 classes du catalogue et les paliers 1/4/13/36', () => {
    expect(Object.keys(CLASS_DEFINITIONS).sort()).toEqual(catalog.tanks.map((c) => c.id).sort());
    expect(
      [1, 15, 30, 45].map(
        (level) => Object.values(CLASS_DEFINITIONS).filter((c) => c.level === level).length,
      ),
    ).toEqual([1, 4, 13, 36]);
    for (const entry of catalog.tanks) {
      const def = CLASS_DEFINITIONS[entry.id]!;
      expect(def.level).toBe(entry.levelRequirement);
      expect(def.upgradesTo).toEqual(entry.upgradesTo);
      const sim = create();
      choose(sim, entry.id);
      expect(sim.snapshotFor(1)!.self.level).toBe(45);
      expect(def.barrels.length > 0 || def.bodyDamage! > 1).toBe(true);
      for (const b of def.barrels)
        expect(b.reload > 0 && b.penetration > 0 && b.damage > 0).toBe(true);
    }
  });

  it('bloque chaque classe avant son niveau et permet les deux sauts depuis Tank au bon palier', () => {
    for (const entry of catalog.tanks.filter((c) => c.id !== 'tank')) {
      const sim = create((c) => {
        c.progression.startLevel = entry.levelRequirement - 1;
      });
      const path = pathTo(entry.id)!;
      for (const classId of path) sim.queueCommand(1, { type: 'chooseClass', classId });
      sim.step();
      expect(sim.snapshotFor(1)!.self.classId).not.toBe(entry.id);
    }
    const sim = create((c) => {
      c.progression.startLevel = 30;
    });
    expect(sim.snapshotFor(1)!.self.classChoices).toContain('smasher');
    expect(sim.snapshotFor(1)!.self.classChoices).not.toContain('auto-tank');
  });

  it.each([
    'triplet',
    'penta-shot',
    'spread-shot',
    'octo-tank',
    'triple-twin',
    'predator',
    'streamliner',
    'sprayer',
    'booster',
    'fighter',
  ])('%s utilise chaque canon avec ses phases et ne tire pas après relâchement', (id) => {
    const sim = create();
    choose(sim, id);
    input(sim, { fire: true });
    const fired = new Set<number>();
    for (let i = 0; i < 70; i++) {
      sim.step();
      tank(sim).barrelShots.forEach((tick, index) => {
        if (tick === sim.tick) fired.add(index);
      });
    }
    expect(fired.size).toBe(CLASS_DEFINITIONS[id]!.barrels.length);
    input(sim);
    sim.step();
    const before = tank(sim).barrelShots;
    step(sim, 80);
    expect(tank(sim).barrelShots).toEqual(before);
  });
});

describe('essaims et conversion', () => {
  it.each([
    ['overseer', 8],
    ['overlord', 8],
    ['manager', 8],
    ['battleship', 20],
    ['hybrid', 2],
    ['overtrapper', 2],
    ['factory', 6],
  ] as const)('%s remplit sa population et respecte sa limite', (id, limit) => {
    const sim = create((c) => {
      c.arena = { width: 900, height: 900 };
    });
    choose(sim, id);
    step(sim, 360);
    expect(shots(sim).filter((b) => b.family === 'drone' || b.family === 'minion')).toHaveLength(
      limit,
    );
    for (let i = 0; i < 300; i++) {
      sim.step();
      expect(
        shots(sim).filter((b) => b.family === 'drone' || b.family === 'minion').length,
      ).toBeLessThanOrEqual(limit);
    }
  });

  it('guide, repousse et borne les drones dans l’arène et la portée de contrôle', () => {
    const sim = create();
    choose(sim, 'overseer');
    step(sim, 260);
    const id = shots(sim, 'drone')[0]!.id;
    input(sim, { fire: true, aim: { x: -650, y: 650 } });
    step(sim, 20);
    const guided = shots(sim, 'drone').find((b) => b.id === id)!;
    expect(-guided.vx + guided.vy).toBeGreaterThan(0);
    input(sim, { alt: true, aim: { x: -650, y: 650 } });
    step(sim, 20);
    const repelled = shots(sim, 'drone').find((b) => b.id === id)!;
    expect(-repelled.vx + repelled.vy).toBeLessThan(0);
    input(sim, { fire: true, aim: { x: 10000, y: 10000 } });
    for (let i = 0; i < 400; i++) {
      sim.step();
      const owner = tank(sim);
      for (const drone of shots(sim, 'drone')) {
        expect(drone.x).toBeGreaterThanOrEqual(drone.radius);
        expect(drone.y).toBeLessThanOrEqual(sim.config.arena.height - drone.radius);
        expect(Math.hypot(drone.x - owner.x, drone.y - owner.y)).toBeLessThanOrEqual(
          B.droneLeash + 1e-6,
        );
      }
    }
  });

  it('Factory fait tirer les minions, publie leur recul et inflige des dégâts', () => {
    const sim = create((c) => {
      c.arena = { width: 900, height: 900 };
      c.shapes.targetCount = 8;
    });
    choose(sim, 'factory');
    input(sim, { fire: true, aim: { x: -400, y: 300 } });
    let armed = false;
    let secondary = false;
    for (let i = 0; i < 360; i++) {
      sim.step();
      armed ||= shots(sim, 'minion').some(
        (b) => b.bodyShape === 'square' && b.barrelShots!.some((t) => t >= 0),
      );
      secondary ||= shots(sim, 'bullet').length > 0;
    }
    expect(armed).toBe(true);
    expect(secondary).toBe(true);
    expect(sim.snapshotFor(1)!.self.score).toBeGreaterThan(23540);
  });

  it('les drones autonomes Hybrid attaquent sans clic ni guidage', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 700 };
      c.shapes.targetCount = 5;
    });
    choose(sim, 'hybrid');
    step(sim, 500);
    expect(tank(sim).barrelShots[0]).toBe(-1);
    expect(sim.snapshotFor(1)!.self.score).toBeGreaterThan(23540);
  });

  it('Necromancer amorce par contact, infecte par drones et gagne une seule fois l’XP des carrés', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 700 };
      c.shapes.targetCount = 16;
    });
    choose(sim, 'necromancer');
    invest(sim, 'reload', 7);
    expect(shots(sim, 'drone')).toHaveLength(0);
    let firstDrone = false;
    let infectedByDrone = false;
    for (let i = 0; i < 700; i++) {
      const owner = tank(sim);
      const target = sim
        .snapshotFor(1)!
        .entities.find((b) => b.kind === 'shape' && b.shape === 'square');
      if (!target) {
        sim.step();
        continue;
      }
      const dx = target.x - owner.x;
      const dy = target.y - owner.y;
      const d = Math.hypot(dx, dy) || 1;
      const before = shots(sim, 'drone').length;
      input(sim, {
        move: firstDrone ? { x: 0, y: 0 } : { x: dx / d, y: dy / d },
        aim: { x: dx, y: dy },
        fire: true,
      });
      sim.step();
      const drones = shots(sim, 'drone');
      if (firstDrone && drones.length > before) infectedByDrone = true;
      firstDrone ||= drones.length > 0;
      expect(drones.length).toBeLessThanOrEqual(42);
      expect(drones.every((b) => b.bodyShape === 'square')).toBe(true);
      if (infectedByDrone && drones.length >= 12) break;
    }
    expect(firstDrone).toBe(true);
    expect(infectedByDrone).toBe(true);
    expect(shots(sim, 'drone').length).toBeGreaterThanOrEqual(12);
    expect(sim.snapshotFor(1)!.self.score - 23540).toBeGreaterThanOrEqual(120);
  });

  it.each([0, 7])('Necromancer sature à 14 + 4 × Reload (%i) sans dépasser la borne', (reload) => {
    const sim = create((c) => {
      c.arena = { width: 900, height: 900 };
      c.shapes.targetCount = 80;
    });
    choose(sim, 'necromancer');
    invest(sim, 'maxHealth', 7);
    invest(sim, 'reload', reload);
    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      const owner = tank(sim);
      const targets = sim
        .snapshotFor(1)!
        .entities.filter((b) => b.kind === 'shape' && b.shape === 'square');
      targets.sort(
        (a, b) =>
          Math.hypot(a.x - owner.x, a.y - owner.y) - Math.hypot(b.x - owner.x, b.y - owner.y),
      );
      const target = targets[0];
      if (target) {
        const dx = target.x - owner.x;
        const dy = target.y - owner.y;
        const d = Math.hypot(dx, dy) || 1;
        input(sim, {
          move: peak ? { x: 0, y: 0 } : { x: dx / d, y: dy / d },
          aim: { x: dx, y: dy },
          fire: true,
        });
      }
      sim.step();
      const count = shots(sim, 'drone').length;
      peak = Math.max(peak, count);
      expect(count).toBeLessThanOrEqual(14 + 4 * reload);
    }
    expect(peak).toBe(14 + 4 * reload);
  });

  it('une première conversion donne un seul carré allié et exactement 10 XP', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 700 };
      c.shapes.targetCount = 1;
    });
    choose(sim, 'necromancer');
    const target = sim.snapshotFor(1)!.entities.find((b) => b.kind === 'shape')!;
    expect(target.kind === 'shape' && target.shape).toBe('square');
    for (let i = 0; i < 300 && shots(sim, 'drone').length === 0; i++) {
      const owner = tank(sim);
      const moving = sim.snapshotFor(1)!.entities.find((b) => b.id === target.id)!;
      const dx = moving.x - owner.x;
      const dy = moving.y - owner.y;
      const d = Math.hypot(dx, dy) || 1;
      input(sim, { move: { x: dx / d, y: dy / d }, fire: true });
      sim.step();
    }
    expect(shots(sim, 'drone')).toHaveLength(1);
    expect(sim.snapshotFor(1)!.self.score).toBe(23550);
    expect(sim.snapshotFor(1)!.entities.some((b) => b.id === target.id)).toBe(false);
    expect(sim.snapshotFor(1)!.entities.filter((b) => b.kind === 'shape')).toHaveLength(1);
  });

  it.each(['overseer', 'factory'])(
    '%s retire les unités à la mort et les recrée avec le nouvel identifiant',
    (classId) => {
      const sim = create((c) => {
        c.arena = { width: 900, height: 900 };
      });
      choose(sim, classId);
      step(sim, 260);
      const ownerId = tank(sim).id;
      const family = classId === 'factory' ? 'minion' : 'drone';
      expect(shots(sim, family)).toHaveLength(classId === 'factory' ? 6 : 8);
      sim.addPlayer(2, { name: 'B' });
      sim.step();
      for (const classId of pathTo('annihilator')!)
        sim.queueCommand(2, { type: 'chooseClass', classId });
      for (const stat of ['bulletDamage', 'bulletPenetration', 'reload', 'maxHealth'] as const)
        for (let i = 0; i < 7; i++) sim.queueCommand(2, { type: 'upgradeStat', stat });
      sim.step();
      for (let i = 0; i < 600 && sim.snapshotFor(1)!.self.alive; i++) {
        const owner = tank(sim);
        const enemy = tank(sim, 2);
        input(sim, { fire: true, aim: { x: owner.x - enemy.x, y: owner.y - enemy.y } }, 2);
        sim.step();
      }
      expect(sim.snapshotFor(1)!.self.alive).toBe(false);
      expect(shots(sim, family).filter((b) => b.ownerId === ownerId)).toHaveLength(0);
      sim.removePlayer(2);
      sim.queueCommand(1, { type: 'respawn' });
      sim.step();
      choose(sim, classId);
      step(sim, 260);
      expect(tank(sim).id).not.toBe(ownerId);
      expect(shots(sim, family).every((b) => b.ownerId === tank(sim).id)).toBe(true);
    },
  );

  it('nettoie les unités contrôlées au changement de classe et tous les tirs à la déconnexion', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 700 };
    });
    choose(sim, 'overseer');
    step(sim, 260);
    const oldIds = shots(sim).map((b) => b.id);
    sim.queueCommand(1, { type: 'chooseClass', classId: 'factory' });
    sim.step();
    expect(shots(sim).some((b) => oldIds.includes(b.id))).toBe(false);
    step(sim, 150);
    input(sim, { fire: true });
    step(sim, 20);
    sim.addPlayer(2, { name: 'B' });
    sim.step();
    sim.removePlayer(1);
    expect(shots(sim, undefined, 2)).toHaveLength(0);
  });
});

describe('pièges, missiles et plombs', () => {
  it('garde un piège immobile pendant 30 s puis l’expire au tick exact', () => {
    const sim = create();
    choose(sim, 'trapper');
    input(sim, { fire: true });
    sim.step();
    const born = sim.tick;
    const id = shots(sim, 'trap')[0]!.id;
    input(sim);
    step(sim, 120);
    const trap = shots(sim, 'trap').find((b) => b.id === id)!;
    expect(Math.hypot(trap.vx, trap.vy)).toBeLessThan(0.001);
    expect(trap.health).toBe(trap.maxHealth);
    step(sim, born + 899 - sim.tick);
    expect(shots(sim, 'trap').some((b) => b.id === id)).toBe(true);
    sim.step();
    expect(shots(sim, 'trap').some((b) => b.id === id)).toBe(false);
  });

  it('un piège bloque une balle adverse avec sa réserve de pénétration', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 200 };
    }, 3);
    choose(sim, 'mega-trapper');
    sim.addPlayer(2, { name: 'B' });
    sim.step();
    step(sim, 91);
    const a = tank(sim);
    const b = tank(sim, 2);
    input(sim, { fire: true, aim: { x: b.x - a.x, y: b.y - a.y } });
    sim.step();
    input(sim);
    step(sim, 90);
    const original = shots(sim, 'trap')[0]!;
    const enemy = tank(sim, 2);
    input(sim, { fire: true, aim: { x: original.x - enemy.x, y: original.y - enemy.y } }, 2);
    sim.step();
    input(sim, {}, 2);
    step(sim, 30);
    const hit = shots(sim, 'trap').find((t) => t.id === original.id)!;
    expect(hit.health).toBe(original.health! - 12);
    expect(shots(sim, 'bullet')).toHaveLength(0);
    expect(tank(sim).health).toBe(tank(sim).maxHealth);
  });

  it('un piège blesse au contact, puis peut blesser la même cible après son délai', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 200 };
    }, 3);
    choose(sim, 'trapper');
    sim.addPlayer(2, { name: 'B' });
    sim.step();
    step(sim, 91);
    const a = tank(sim);
    const b = tank(sim, 2);
    input(sim, { fire: true, aim: { x: b.x - a.x, y: b.y - a.y } });
    sim.step();
    input(sim);
    step(sim, 90);
    const trapId = shots(sim, 'trap')[0]!.id;
    let hits = 0;
    for (let i = 0; i < 200 && hits < 2; i++) {
      const trap = shots(sim, 'trap').find((t) => t.id === trapId)!;
      const enemy = tank(sim, 2);
      const dx = trap.x - enemy.x;
      const dy = trap.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      input(sim, { move: d > 2 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 } }, 2);
      sim.step();
      if (tank(sim, 2).health < enemy.health) hits++;
    }
    expect(hits).toBe(2);
  });

  it('Firework explose aussi sur impact avant sa mèche et crédite les dégâts', () => {
    const sim = create((c) => {
      c.arena = { width: 500, height: 200 };
    }, 3);
    choose(sim, 'firework');
    sim.addPlayer(2, { name: 'B' });
    sim.step();
    step(sim, 91);
    const a = tank(sim);
    const b = tank(sim, 2);
    input(sim, { fire: true, aim: { x: b.x - a.x, y: b.y - a.y } });
    sim.step();
    input(sim);
    const born = sim.tick;
    let impact = false;
    for (let i = 0; i < 35; i++) {
      sim.step();
      if (tank(sim, 2).health < b.health) {
        impact = true;
        break;
      }
    }
    expect(impact).toBe(true);
    expect(sim.tick - born).toBeLessThan(36);
    expect(shots(sim, 'missile')).toHaveLength(0);
    expect(shots(sim, 'bullet').length).toBeGreaterThan(0);
  });

  it('borne les pièges persistants à 80 par propriétaire sous Reload maximal', () => {
    const sim = create((c) => {
      c.arena = { width: 900, height: 900 };
    });
    choose(sim, 'tri-trapper');
    invest(sim, 'reload', 7);
    input(sim, { fire: true });
    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      sim.step();
      peak = Math.max(peak, shots(sim, 'trap').length);
      expect(shots(sim, 'trap').length).toBeLessThanOrEqual(80);
    }
    expect(peak).toBe(80);
  });

  it('garde le budget de pièges sur les vies successives, puis libère les slots expirés', () => {
    const sim = create((c) => {
      c.arena = { width: 900, height: 900 };
    });
    choose(sim, 'tri-trapper');
    invest(sim, 'reload', 7);
    input(sim, { fire: true });
    step(sim, 350);
    expect(shots(sim, 'trap')).toHaveLength(80);
    const oldOwner = tank(sim).id;
    sim.addPlayer(2, { name: 'B' });
    sim.step();
    for (const classId of pathTo('annihilator')!)
      sim.queueCommand(2, { type: 'chooseClass', classId });
    for (const stat of ['maxHealth', 'bulletDamage', 'bulletPenetration', 'reload'] as const)
      for (let point = 0; point < 7; point++) sim.queueCommand(2, { type: 'upgradeStat', stat });
    sim.step();
    for (let tick = 0; tick < 300 && sim.snapshotFor(1)!.self.alive; tick++) {
      const owner = tank(sim);
      const enemy = tank(sim, 2);
      input(sim, { fire: true, aim: { x: owner.x - enemy.x, y: owner.y - enemy.y } }, 2);
      sim.step();
    }
    expect(sim.snapshotFor(1)!.self.alive).toBe(false);
    expect(shots(sim, 'trap').some((b) => b.ownerId === oldOwner)).toBe(true);
    sim.removePlayer(2);
    sim.queueCommand(1, { type: 'respawn' });
    sim.step();
    choose(sim, 'tri-trapper');
    invest(sim, 'reload', 7);
    input(sim, { fire: true });
    for (let tick = 0; tick < 1000; tick++) {
      sim.step();
      expect(shots(sim, 'trap').length).toBeLessThanOrEqual(80);
    }
    expect(shots(sim, 'trap').some((b) => b.ownerId === oldOwner)).toBe(false);
    expect(shots(sim, 'trap').some((b) => b.ownerId === tank(sim).id)).toBe(true);
  });

  it.each(['skimmer', 'rocketeer', 'glider'] as const)(
    '%s porte un corps missile et tire des projectiles secondaires',
    (id) => {
      const sim = create();
      choose(sim, id);
      input(sim, { fire: true });
      sim.step();
      input(sim);
      const initial = shots(sim, 'missile')[0]!;
      const speed = Math.hypot(initial.vx, initial.vy);
      step(sim, 15);
      const missile = shots(sim, 'missile').find((b) => b.id === initial.id)!;
      expect(missile.classId).toBe(id);
      expect(missile.barrelShots![0]).toBeGreaterThan(0);
      expect(shots(sim, 'bullet').length).toBeGreaterThanOrEqual(id === 'skimmer' ? 2 : 1);
      if (id === 'rocketeer') expect(Math.hypot(missile.vx, missile.vy)).toBeGreaterThan(speed);
      if (id === 'glider') expect(missile.angle).toBeGreaterThan(initial.angle);
    },
  );

  it('Firework explose en 16 éclats radiaux sans récursion', () => {
    const sim = create();
    choose(sim, 'firework');
    input(sim, { fire: true });
    sim.step();
    input(sim);
    const id = shots(sim, 'missile')[0]!.id;
    step(sim, 36);
    expect(shots(sim, 'missile').some((b) => b.id === id)).toBe(false);
    const fragments = shots(sim, 'bullet');
    expect(fragments).toHaveLength(16);
    expect(new Set(fragments.map((b) => b.angle)).size).toBe(16);
    step(sim, 80);
    expect(shots(sim)).toHaveLength(0);
  });

  it.each([
    ['shotgun', 12],
    ['pellet-shot', 30],
    ['dual-barrel', 12],
  ] as const)('%s lance %i plombs par volée initiale', (id, count) => {
    const sim = create();
    choose(sim, id);
    input(sim, { fire: true });
    sim.step();
    expect(shots(sim, 'bullet')).toHaveLength(count);
    expect(new Set(shots(sim, 'bullet').map((b) => b.angle)).size).toBe(count);
    if (id === 'dual-barrel') {
      const first = tank(sim).barrelShots[0];
      step(sim, 18);
      expect(tank(sim).barrelShots).toEqual([first, sim.tick]);
    }
  });
});

describe('tourelles, furtivité et corps', () => {
  it.each(['auto-3', 'auto-5', 'auto-tank', 'auto-gunner', 'auto-trapper', 'auto-smasher'])(
    '%s vise et blesse sans action du joueur',
    (id) => {
      const sim = create((c) => {
        c.arena = { width: 700, height: 700 };
      });
      sim.addPlayer(2, { name: 'B' });
      sim.step();
      choose(sim, id);
      let hurt = false;
      for (let i = 0; i < 240; i++) {
        sim.step();
        hurt ||= !sim.snapshotFor(2)!.self.alive || tank(sim, 2).health < tank(sim, 2).maxHealth;
      }
      const def = CLASS_DEFINITIONS[id]!;
      expect(def.barrels.filter((b) => b.auto).length).toBeGreaterThan(0);
      def.barrels.forEach((b, i) => {
        expect(tank(sim).barrelShots[i]! >= 0).toBe(!!b.auto);
      });
      expect(hurt).toBe(true);
    },
  );

  it.each([
    ['stalker', 60],
    ['manager', 60],
    ['landmine', 450],
  ] as const)('%s devient invisible à l’arrêt puis se révèle en mouvement', (id, ticks) => {
    const sim = create();
    choose(sim, id);
    step(sim, ticks);
    expect(tank(sim).opacity).toBe(0);
    if (id === 'manager') {
      input(sim, { fire: true });
      step(sim, 15);
      expect(tank(sim).opacity).toBe(0);
    }
    input(sim, { move: { x: 0, y: 1 } });
    sim.step();
    expect(tank(sim).opacity).toBe(1);
  });

  it('Stalker se révèle en tirant et Predator fournit un décalage caméra Alt réversible', () => {
    const stealth = create();
    choose(stealth, 'stalker');
    step(stealth, 60);
    input(stealth, { fire: true });
    stealth.step();
    expect(tank(stealth).opacity).toBe(1);
    const sim = create();
    choose(sim, 'predator');
    input(sim, { alt: true });
    sim.step();
    expect(tank(sim).cameraOffset!.y).toBeCloseTo(650);
    input(sim);
    sim.step();
    expect(tank(sim).cameraOffset).toEqual({ x: 0, y: 0 });
  });

  it('Spike inflige plus de dégâts corporels que Smasher, avec le même investissement', () => {
    const run = (classId: string) => {
      const sim = create((c) => {
        c.arena = { width: 700, height: 200 };
      });
      choose(sim, classId);
      sim.addPlayer(2, { name: 'B' });
      sim.step();
      step(sim, 91);
      let firstHealth: number | undefined;
      for (let i = 0; i < 200; i++) {
        const owner = tank(sim);
        const target = tank(sim, 2);
        const dx = target.x - owner.x;
        const dy = target.y - owner.y;
        const d = Math.hypot(dx, dy) || 1;
        input(sim, { move: { x: dx / d, y: dy / d } });
        sim.step();
        const health = tank(sim, 2).health;
        if (health < target.health) {
          firstHealth = health;
          break;
        }
      }
      expect(firstHealth).toBeDefined();
      return 138 - firstHealth!;
    };
    expect(run('spike')).toBeGreaterThan(run('smasher'));
  });

  it('une cible invisible échappe aux tourelles mais les tirs manuels la blessent et la révèlent', () => {
    const sim = create((c) => {
      c.arena = { width: 700, height: 700 };
    });
    choose(sim, 'stalker');
    sim.addPlayer(2, { name: 'B' });
    sim.step();
    for (const classId of pathTo('auto-gunner')!)
      sim.queueCommand(2, { type: 'chooseClass', classId });
    sim.step();
    step(sim, 140);
    expect(tank(sim).opacity).toBe(0);
    expect(tank(sim, 2).barrelShots.every((t) => t === -1)).toBe(true);
    let revealed = false;
    for (let i = 0; i < 90; i++) {
      const owner = tank(sim);
      const enemy = tank(sim, 2);
      input(sim, { fire: true, aim: { x: owner.x - enemy.x, y: owner.y - enemy.y } }, 2);
      sim.step();
      if (tank(sim).health < owner.health) {
        expect(tank(sim).opacity).toBe(1);
        revealed = true;
        break;
      }
    }
    expect(revealed).toBe(true);
  });

  it('Smasher rembourse les stats de tir, relève les caps corps à 10 et Auto Smasher réactive les tirs à 7', () => {
    const sim = create();
    for (const stat of ['bulletSpeed', 'bulletPenetration', 'bulletDamage', 'reload'] as const)
      invest(sim, stat, 7);
    expect(sim.snapshotFor(1)!.self.statPoints).toBe(5);
    choose(sim, 'smasher');
    expect(sim.snapshotFor(1)!.self.statPoints).toBe(33);
    expect(sim.snapshotFor(1)!.self.stats.reload).toBe(0);
    invest(sim, 'bodyDamage', 12);
    expect(sim.snapshotFor(1)!.self.stats.bodyDamage).toBe(10);
    invest(sim, 'reload', 7);
    expect(sim.snapshotFor(1)!.self.stats.reload).toBe(0);
    sim.queueCommand(1, { type: 'chooseClass', classId: 'auto-smasher' });
    sim.step();
    invest(sim, 'bulletDamage', 10);
    expect(sim.snapshotFor(1)!.self.stats.bulletDamage).toBe(7);
    expect(sim.snapshotFor(1)!.self.statCaps.bodyDamage).toBe(10);
  });
});

describe('rejeu et isolation des nouveaux états', () => {
  it('rejoue drones, conversion, missiles, pièges, minions et auto-tourelles avec les mêmes événements', () => {
    const run = () => {
      const sim = create((c) => {
        c.arena = { width: 1600, height: 1600 };
        c.shapes.targetCount = 80;
      }, 17);
      for (let id = 2; id <= 8; id++) sim.addPlayer(id, { name: `P${id}` });
      sim.step();
      const classes = [
        'necromancer',
        'factory',
        'battleship',
        'skimmer',
        'firework',
        'tri-trapper',
        'auto-gunner',
        'glider',
      ];
      classes.forEach((classId, index) => {
        for (const upgrade of pathTo(classId)!)
          sim.queueCommand(index + 1, { type: 'chooseClass', classId: upgrade });
      });
      const snapshots = [];
      const events = [];
      for (let tick = 0; tick < 360; tick++) {
        for (let id = 1; id <= 8; id++)
          input(
            sim,
            {
              move: { x: Math.cos(tick / 25 + id), y: Math.sin(tick / 25 + id) },
              aim: { x: 600 * Math.cos(tick / 20 + id), y: 600 * Math.sin(tick / 20 + id) },
              fire: tick % 80 < 60,
              alt: tick % 80 >= 60,
            },
            id,
          );
        events.push(...sim.step());
        if (tick % 30 === 0)
          snapshots.push(Array.from({ length: 8 }, (_, i) => sim.snapshotFor(i + 1)));
      }
      return { snapshots, events };
    };
    const first = run();
    expect(first).toEqual(run());
    const families = new Set(
      first.snapshots
        .flat(2)
        .flatMap((s) => s!.entities.filter((b) => b.kind === 'projectile').map((b) => b.family)),
    );
    expect([...families].sort()).toEqual(['bullet', 'drone', 'minion', 'missile', 'trap']);
  });

  it('copie barrelShots, barrelAngles et cameraOffset jusque dans les états optionnels', () => {
    const sim = create();
    choose(sim, 'factory');
    input(sim, { fire: true });
    step(sim, 15);
    const snapshot = sim.snapshotFor(1)!;
    const minion = snapshot.entities.find((b) => b.kind === 'projectile' && b.family === 'minion')!;
    if (minion.kind !== 'projectile') throw new Error('Expected minion');
    minion.barrelShots![0] = -12345;
    expect(shots(sim, 'minion')[0]!.barrelShots![0]).not.toBe(-12345);
    const pred = create();
    choose(pred, 'predator');
    input(pred, { alt: true });
    pred.step();
    const old = tank(pred);
    old.cameraOffset!.x = -12345;
    expect(tank(pred).cameraOffset!.x).not.toBe(-12345);
    const auto = create();
    choose(auto, 'auto-tank');
    tank(auto).barrelAngles![0] = -12345;
    expect(tank(auto).barrelAngles![0]).not.toBe(-12345);
  });
});

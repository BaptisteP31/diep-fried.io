import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  STAT_IDS,
  resolveModeConfig,
  type ModeConfig,
  type PlayerCommand,
  type PlayerInput,
  type TankState,
} from '@diep-fried/shared';
import { createSimulation, type SimEvent, type Simulation } from '../src';
import { describeSimulationContract } from './simulation-contract';

describeSimulationContract('simulation complète', createSimulation);

function config(level = 1): ModeConfig {
  const config = resolveModeConfig('ffa');
  config.arena = { width: 1000, height: 1000 };
  config.shapes.targetCount = 0;
  config.progression.startLevel = level;
  return config;
}
function create(level = 1, seed = 1, setup?: (config: ModeConfig) => void): Simulation {
  const options = config(level);
  setup?.(options);
  const sim = createSimulation({ config: options, seed });
  sim.addPlayer(1, { name: 'Ana' });
  sim.step();
  return sim;
}
function own(sim: Simulation, playerId = 1): TankState {
  const snapshot = sim.snapshotFor(playerId)!;
  const body = snapshot.entities.find((body) => body.id === snapshot.self.entityId);
  if (body?.kind !== 'tank') throw new Error('Expected living tank');
  return body;
}
function input(sim: Simulation, playerId = 1, changes: Partial<PlayerInput> = {}): void {
  sim.setInput(playerId, {
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
function command(sim: Simulation, command: PlayerCommand): void {
  sim.queueCommand(1, command);
  sim.step();
}
function aimAt(sim: Simulation, playerId: number, targetId: number, fire = true): void {
  const tank = own(sim, playerId);
  const target = own(sim, targetId);
  input(sim, playerId, { aim: { x: target.x - tank.x, y: target.y - tank.y }, fire });
}
function shootUntilDeath(sim: Simulation): Extract<SimEvent, { type: 'death' }> {
  for (let i = 0; i < 1200; i++) {
    aimAt(sim, 1, 2);
    const event = sim.step().find((event) => event.type === 'death');
    if (event?.type === 'death') return event;
  }
  throw new Error('No death after sustained aimed fire');
}

describe('mouvement et snapshots', () => {
  it('accélère, normalise les diagonales et freine jusqu’à l’arrêt', () => {
    const sim = create();
    input(sim, 1, { move: { x: 1, y: 0 } });
    sim.step();
    const first = own(sim).vx;
    step(sim, 8);
    expect(own(sim).vx).toBeGreaterThan(first);
    expect(own(sim).vx).toBeLessThan(220);
    input(sim);
    step(sim, 60);
    expect(own(sim).vx).toBe(0);
    const diagonal = create();
    input(diagonal, 1, { move: { x: 1, y: 1 } });
    step(diagonal, 10);
    expect(Math.hypot(own(diagonal).vx, own(diagonal).vy)).toBeLessThanOrEqual(220);
  });

  it('reste borné dans les quatre coins, annule la vitesse normale et permet de repartir', () => {
    const sim = create();
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      input(sim, 1, { move: { x: x!, y: y! } });
      step(sim, 240);
      const tank = own(sim);
      expect(tank.x).toBe(x === -1 ? tank.radius : sim.config.arena.width - tank.radius);
      expect(tank.y).toBe(y === -1 ? tank.radius : sim.config.arena.height - tank.radius);
      expect(tank.vx).toBe(0);
      expect(tank.vy).toBe(0);
    }
    input(sim, 1, { move: { x: 1, y: -1 } });
    step(sim, 10);
    expect(own(sim).vx).toBeGreaterThan(0);
    expect(own(sim).vy).toBeLessThan(0);
  });

  it('filtre par vue tout en conservant soi et un classement global stable de dix joueurs', () => {
    const sim = create(45, 1, (config) => {
      config.arena = { width: 8000, height: 8000 };
    });
    for (let id = 2; id <= 12; id++) sim.addPlayer(id, { name: `P${id}` });
    sim.step();
    const snapshot = sim.snapshotFor(1)!;
    expect(snapshot.entities.length).toBeLessThan(12);
    expect(snapshot.entities.map((body) => body.id)).toContain(snapshot.self.entityId);
    expect(snapshot.leaderboard?.map((entry) => entry.playerId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    for (const body of snapshot.entities) {
      expect(Math.abs(body.x - own(sim).x)).toBeLessThanOrEqual(
        snapshot.self.view + 100 + body.radius,
      );
    }
    command(sim, { type: 'chooseClass', classId: 'sniper' });
    expect(sim.snapshotFor(1)!.self.view).toBe(1125);
  });

  it('isole les entrées, configuration et snapshots des mutations du consommateur', () => {
    const options = config();
    const sim = createSimulation({ config: options, seed: 2 });
    sim.addPlayer(1, { name: 'Ana' });
    sim.step();
    options.arena.width = 1;
    const controls: PlayerInput = {
      seq: 1,
      move: { x: 1, y: 0 },
      aim: { x: 0, y: 1 },
      fire: false,
      alt: false,
    };
    sim.setInput(1, controls);
    controls.move.x = -1;
    controls.aim.y = -1;
    const snapshot = sim.snapshotFor(1)!;
    snapshot.entities[0]!.x = -999;
    snapshot.self.stats.maxHealth = 999;
    sim.step();
    expect(own(sim).vx).toBeGreaterThan(0);
    expect(own(sim).angle).toBe(Math.PI / 2);
    expect(sim.config.arena.width).toBe(1000);
    expect(sim.snapshotFor(1)!.self.stats.maxHealth).toBe(0);
  });
});

describe('statistiques et classes', () => {
  it('accorde 33 points à 45 et applique le calendrier aux niveaux intermédiaires', () => {
    for (const [level, points] of [
      [1, 0],
      [2, 1],
      [28, 27],
      [29, 27],
      [30, 28],
      [33, 29],
      [44, 32],
      [45, 33],
    ]) {
      expect(create(level).snapshotFor(1)!.self.statPoints).toBe(points);
    }
  });

  it('refuse les dépenses sans points, statistiques inconnues et répétitions au plafond', () => {
    const sim = create();
    command(sim, { type: 'upgradeStat', stat: 'maxHealth' });
    expect(sim.snapshotFor(1)!.self.stats.maxHealth).toBe(0);
    const max = create(45);
    // Défense de la simulation même si un appelant contourne le validateur réseau.
    command(max, { type: 'upgradeStat', stat: 'unknown' } as unknown as PlayerCommand);
    for (let i = 0; i < 20; i++) max.queueCommand(1, { type: 'upgradeStat', stat: 'maxHealth' });
    max.step();
    expect(max.snapshotFor(1)!.self.stats.maxHealth).toBe(7);
    expect(max.snapshotFor(1)!.self.statPoints).toBe(26);
    expect(own(max).maxHealth).toBe(243);
    for (const stat of STAT_IDS) {
      for (let i = 0; i < 7; i++) max.queueCommand(1, { type: 'upgradeStat', stat });
    }
    max.step();
    expect(max.snapshotFor(1)!.self.statPoints).toBe(0);
    expect(Object.values(max.snapshotFor(1)!.self.stats).reduce((a, b) => a + b, 0)).toBe(33);
  });

  it('valide niveau et arêtes de classe ; les spécialisations sont définitives pour cette vie', () => {
    const sim = create(14);
    command(sim, { type: 'chooseClass', classId: 'twin' });
    expect(sim.snapshotFor(1)!.self.classId).toBe('tank');
    const ready = create(15);
    expect(ready.snapshotFor(1)!.self.classChoices).toEqual([
      'twin',
      'sniper',
      'machine-gun',
      'flank-guard',
    ]);
    command(ready, { type: 'chooseClass', classId: '__proto__' });
    command(ready, { type: 'chooseClass', classId: 'twin' });
    expect(own(ready).barrelShots).toEqual([-1, -1]);
    command(ready, { type: 'chooseClass', classId: 'sniper' });
    expect(ready.snapshotFor(1)!.self.classId).toBe('twin');
    expect(ready.snapshotFor(1)!.self.classChoices).toEqual([]);
  });

  it('applique vitesse, santé, dégâts, pénétration et cadence améliorés', () => {
    const base = create(45);
    const boosted = create(45);
    for (const stat of [
      'maxHealth',
      'bulletDamage',
      'bulletPenetration',
      'bulletSpeed',
      'reload',
      'movementSpeed',
    ] as const) {
      boosted.queueCommand(1, { type: 'upgradeStat', stat });
    }
    boosted.step();
    base.step();
    input(base, 1, { fire: true, move: { x: 1, y: 0 } });
    input(boosted, 1, { fire: true, move: { x: 1, y: 0 } });
    base.step();
    boosted.step();
    const a = base.snapshotFor(1)!.entities.find((body) => body.kind === 'projectile')!;
    const b = boosted.snapshotFor(1)!.entities.find((body) => body.kind === 'projectile')!;
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(Math.hypot(a.vx, a.vy));
    expect(b.kind === 'projectile' && b.health).toBe(19);
    expect(own(boosted).maxHealth).toBe(own(base).maxHealth + 15);
    expect(own(boosted).vx).toBeGreaterThan(own(base).vx);
    const baseShot = own(base).barrelShots[0]!;
    step(base, 14);
    step(boosted, 14);
    expect(own(base).barrelShots[0]).toBe(baseShot);
    expect(own(boosted).barrelShots[0]).toBeGreaterThan(baseShot);
  });
});

describe('armes et balles', () => {
  it('alterne les canons du Twin, publie barrelShots et cumule le recul', () => {
    const sim = create(15);
    command(sim, { type: 'chooseClass', classId: 'twin' });
    input(sim, 1, { fire: true });
    sim.step();
    const firstTick = sim.tick;
    expect(own(sim).barrelShots).toEqual([firstTick, -1]);
    expect(own(sim).vx).toBeLessThan(0);
    step(sim, 7);
    expect(own(sim).barrelShots[1]).toBe(-1);
    sim.step();
    expect(own(sim).barrelShots).toEqual([firstTick, firstTick + 8]);
    expect(sim.snapshotFor(1)!.entities.filter((body) => body.kind === 'projectile')).toHaveLength(
      2,
    );
    step(sim, 7);
    expect(own(sim).barrelShots[0]).toBe(firstTick + 15);
  });

  it('tire devant et derrière pour Flank Guard et disperse Machine Gun avec Rng', () => {
    const flank = create(15);
    command(flank, { type: 'chooseClass', classId: 'flank-guard' });
    input(flank, 1, { fire: true });
    flank.step();
    const bullets = flank.snapshotFor(1)!.entities.filter((body) => body.kind === 'projectile');
    expect(bullets.map((body) => Math.sign(body.vx))).toEqual([1, -1]);
    const run = () => {
      const sim = create(15);
      command(sim, { type: 'chooseClass', classId: 'machine-gun' });
      input(sim, 1, { fire: true });
      step(sim, 14);
      return sim
        .snapshotFor(1)!
        .entities.filter((body) => body.kind === 'projectile')
        .map((body) => body.angle);
    };
    const angles = run();
    expect(angles.length).toBeGreaterThan(2);
    expect(new Set(angles).size).toBe(angles.length);
    expect(
      angles.every(
        (angle) => Math.abs(angle) <= CLASS_DEFINITIONS['machine-gun']!.barrels[0]!.spread,
      ),
    ).toBe(true);
    expect(angles).toEqual(run());
  });

  it('rend chaque point de Reload utile à 30 Hz sans rafale de rattrapage', () => {
    const shotsOverTenSeconds = (classId: 'tank' | 'machine-gun', reload: number) => {
      const sim = create(45);
      if (classId !== 'tank') sim.queueCommand(1, { type: 'chooseClass', classId });
      for (let i = 0; i < reload; i++) sim.queueCommand(1, { type: 'upgradeStat', stat: 'reload' });
      sim.step();
      input(sim, 1, { fire: true });
      let shots = 0;
      for (let i = 0; i < 300; i++) {
        sim.step();
        if (own(sim).barrelShots[0] === sim.tick) shots++;
      }
      return shots;
    };
    for (const classId of ['tank', 'machine-gun'] as const) {
      const counts = Array.from({ length: 8 }, (_, reload) => shotsOverTenSeconds(classId, reload));
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!);
    }
  });

  it('expire les balles au tick prévu et supprime les tirs quittant l’arène', () => {
    const sim = create(45, 1, (config) => {
      config.arena = { width: 6000, height: 6000 };
    });
    for (let i = 0; i < 7; i++) sim.queueCommand(1, { type: 'upgradeStat', stat: 'movementSpeed' });
    sim.step();
    input(sim, 1, { fire: true });
    sim.step();
    const bulletId = sim.snapshotFor(1)!.entities.find((body) => body.kind === 'projectile')!.id;
    input(sim, 1, { move: { x: 1, y: 0 } });
    step(sim, 74);
    expect(sim.snapshotFor(1)!.entities.map((body) => body.id)).toContain(bulletId);
    sim.step();
    expect(sim.snapshotFor(1)!.entities.map((body) => body.id)).not.toContain(bulletId);
    const bounded = create();
    input(bounded, 1, { fire: true });
    bounded.step();
    input(bounded);
    step(bounded, 60);
    expect(
      bounded.snapshotFor(1)!.entities.filter((body) => body.kind === 'projectile'),
    ).toHaveLength(0);
  });

  it('laisse un tir rapide dépasser un tir du même propriétaire sans perte de durabilité', () => {
    const sim = create(45, 1, (config) => {
      config.arena = { width: 4000, height: 200 };
    });
    input(sim, 1, { fire: true });
    sim.step();
    const slowId = sim.snapshotFor(1)!.entities.find((body) => body.kind === 'projectile')!.id;
    input(sim);
    for (let i = 0; i < 7; i++) sim.queueCommand(1, { type: 'upgradeStat', stat: 'bulletSpeed' });
    sim.step();
    input(sim, 1, { fire: true });
    step(sim, 14);
    input(sim);
    const fastId = sim
      .snapshotFor(1)!
      .entities.find((body) => body.kind === 'projectile' && body.id !== slowId)!.id;
    let overtook = false;
    for (let i = 0; i < 30; i++) {
      const bullets = sim.snapshotFor(1)!.entities.filter((body) => body.kind === 'projectile');
      const slow = bullets.find((body) => body.id === slowId)!;
      const fast = bullets.find((body) => body.id === fastId)!;
      expect(slow.health).toBe(slow.maxHealth);
      expect(fast.health).toBe(fast.maxHealth);
      if (fast.x > slow.x) {
        overtook = true;
        break;
      }
      sim.step();
    }
    expect(overtook).toBe(true);
    expect(own(sim).health).toBe(own(sim).maxHealth);
  });

  it('fait collisionner des balles ennemies opposées entre deux positions de tick', () => {
    const sim = create(45, 3, (config) => {
      config.arena.height = 200;
      config.tickRate = 5;
    });
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    for (const id of [1, 2]) sim.queueCommand(id, { type: 'upgradeStat', stat: 'bulletDamage' });
    sim.step();
    aimAt(sim, 1, 2);
    aimAt(sim, 2, 1);
    sim.step();
    input(sim, 1);
    input(sim, 2);
    let annihilated = false;
    for (let i = 0; i < 5; i++) {
      sim.step();
      if (sim.snapshotFor(1)!.entities.filter((body) => body.kind === 'projectile').length === 0) {
        annihilated = true;
        break;
      }
    }
    expect(annihilated).toBe(true);
    expect(own(sim, 1).health).toBe(own(sim, 1).maxHealth);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
  });
});

describe('combat, formes et vies', () => {
  it('protège le spawn pendant trois secondes, puis les tirs blessent et la santé régénère après le repos', () => {
    const sim = create();
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    aimAt(sim, 1, 2);
    sim.step();
    input(sim, 1);
    expect(own(sim, 1).spawnProtected).toBe(false);
    step(sim, 70);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
    step(sim, 30);
    expect(own(sim, 2).spawnProtected).toBe(false);
    aimAt(sim, 1, 2);
    sim.step();
    input(sim, 1);
    let hitTick = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      if (own(sim, 2).health < own(sim, 2).maxHealth) {
        hitTick = sim.tick;
        break;
      }
    }
    expect(hitTick).toBeGreaterThan(0);
    const damaged = own(sim, 2).health;
    expect(damaged).toBe(38);
    step(sim, 149);
    expect(own(sim, 2).health).toBe(damaged);
    sim.step();
    expect(own(sim, 2).health).toBeGreaterThan(damaged);
    step(sim, 400);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
  });

  it('attribue un seul kill, émet les niveaux, attend respawn et conserve la fraction du score', () => {
    const sim = create(15);
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    input(sim, 2);
    sim.step();
    const oldId = own(sim, 2).id;
    const score = sim.snapshotFor(2)!.self.score;
    const death = shootUntilDeath(sim);
    expect(death.death).toMatchObject({
      playerId: 2,
      killerName: 'Ana',
      score,
      level: 15,
      classId: 'tank',
    });
    const killerScore = sim.snapshotFor(1)!.self.score;
    expect(killerScore).toBe(score + 100 + Math.floor(score * 0.25));
    expect(sim.snapshotFor(1)!.self.level).toBeGreaterThan(15);
    expect(sim.snapshotFor(1)!.leaderboard![0]!.playerId).toBe(1);
    for (const cmd of [
      { type: 'respawn' },
      { type: 'upgradeStat', stat: 'maxHealth' },
      { type: 'chooseClass', classId: 'twin' },
    ] as const) {
      sim.queueCommand(2, cmd);
    }
    sim.step();
    expect(sim.snapshotFor(2)!.self.alive).toBe(false);
    expect(sim.snapshotFor(2)!.self.stats.maxHealth).toBe(0);
    const events = step(sim, death.death.respawnTick - sim.tick + 10);
    expect(events.filter((event) => event.type === 'death')).toHaveLength(0);
    expect(sim.snapshotFor(2)!.self.alive).toBe(false);
    expect(sim.snapshotFor(1)!.self.score).toBe(killerScore);
    sim.queueCommand(2, { type: 'respawn' });
    sim.step();
    const snapshot = sim.snapshotFor(2)!;
    expect(snapshot.self.alive).toBe(true);
    expect(snapshot.self.entityId).not.toBe(oldId);
    expect(snapshot.self.score).toBe(Math.floor(score * 0.5));
    expect(snapshot.self.respawnTick).toBeNull();
    expect(own(sim, 2).spawnProtected).toBe(true);
    expect(own(sim, 2).health).toBe(own(sim, 2).maxHealth);
    // Le numéro de séquence reçu survit à la mort et à la réapparition.
    sim.setInput(2, { seq: 1, move: { x: 1, y: 0 }, aim: { x: 0, y: 1 }, fire: true, alt: false });
    sim.step();
    expect(own(sim, 2).spawnProtected).toBe(true);
  });

  it('gère le contact tank/tank sans traversée et inflige les dégâts corporels', () => {
    const sim = create(1, 3, (config) => {
      config.arena.height = 200;
    });
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    step(sim, 91);
    const a = own(sim, 1);
    const b = own(sim, 2);
    const left = a.x < b.x ? 1 : 2;
    const right = left === 1 ? 2 : 1;
    let hit = false;
    for (let i = 0; i < 90; i++) {
      input(sim, left, { move: { x: 1, y: 0 } });
      input(sim, right, { move: { x: -1, y: 0 } });
      sim.step();
      expect(own(sim, left).x).toBeLessThan(own(sim, right).x);
      if (own(sim, left).health < 50) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
    expect(own(sim, right).health).toBeLessThan(50);
  });

  it('résout deux dégâts corporels létaux simultanés sans résurrection par le niveau gagné', () => {
    const sim = create(1, 3, (config) => {
      config.arena.height = 200;
    });
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    step(sim, 91);
    const left = own(sim, 1).x < own(sim, 2).x ? 1 : 2;
    const events: SimEvent[] = [];
    for (
      let i = 0;
      i < 250 && sim.snapshotFor(1)!.self.alive && sim.snapshotFor(2)!.self.alive;
      i++
    ) {
      input(sim, left, { move: { x: 1, y: 0 } });
      input(sim, left === 1 ? 2 : 1, { move: { x: -1, y: 0 } });
      events.push(...sim.step());
    }
    const deaths = events.filter((event) => event.type === 'death');
    expect(deaths).toHaveLength(2);
    expect(sim.snapshotFor(1)!.self.alive).toBe(false);
    expect(sim.snapshotFor(2)!.self.alive).toBe(false);
    expect(sim.snapshotFor(1)!.self.score).toBe(100);
    expect(sim.snapshotFor(2)!.self.score).toBe(100);
    expect(step(sim, 30).filter((event) => event.type === 'death')).toHaveLength(0);
  });

  it('maintient des formes mobiles, applique un seul impact et récompense une destruction une fois', () => {
    const sim = create(1, 1, (config) => {
      config.shapes.targetCount = 1;
    });
    const shape = sim.snapshotFor(1)!.entities.find((body) => body.kind === 'shape')!;
    expect(shape.kind === 'shape' && shape.shape).toBe('square');
    const start = { ...shape };
    step(sim, 10);
    const moved = sim.snapshotFor(1)!.entities.find((body) => body.id === shape.id)!;
    expect(moved.x).not.toBe(start.x);
    expect(moved.angle).not.toBe(start.angle);
    let destroyed = false;
    let levelEvent = false;
    for (let i = 0; i < 200; i++) {
      const snapshot = sim.snapshotFor(1)!;
      const target = snapshot.entities.find((body) => body.id === shape.id);
      if (!target) {
        destroyed = true;
        break;
      }
      const tank = own(sim);
      const flight = Math.hypot(target.x - tank.x, target.y - tank.y) / 600;
      input(sim, 1, {
        aim: {
          x: target.x + target.vx * flight - tank.x,
          y: target.y + target.vy * flight - tank.y,
        },
        fire: true,
      });
      const events = sim.step();
      levelEvent = events.some((event) => event.type === 'levelUp') || levelEvent;
    }
    input(sim);
    expect(destroyed).toBe(true);
    expect(sim.snapshotFor(1)!.self.score).toBe(10);
    expect(levelEvent).toBe(false);
    expect(sim.snapshotFor(1)!.entities.filter((body) => body.kind === 'shape')).toHaveLength(1);
    step(sim, 2);
    expect(sim.snapshotFor(1)!.self.score).toBe(10);
  });

  it('ramène une forme poussée par un tank à sa vitesse de dérive', () => {
    const sim = create(1, 1, (config) => {
      config.arena = { width: 400, height: 400 };
      config.shapes.targetCount = 1;
    });
    const shapeId = sim.snapshotFor(1)!.entities.find((body) => body.kind === 'shape')!.id;
    const shape = () => sim.snapshotFor(1)!.entities.find((body) => body.id === shapeId)!;
    // Poussée pendant la protection de spawn : contact solide, sans dégât.
    let pushed = 0;
    for (let i = 0; i < 50; i++) {
      const target = shape();
      const tank = own(sim);
      const distance = Math.hypot(target.x - tank.x, target.y - tank.y);
      input(sim, 1, {
        move: { x: (target.x - tank.x) / distance, y: (target.y - tank.y) / distance },
      });
      sim.step();
      pushed = Math.max(pushed, Math.hypot(shape().vx, shape().vy));
    }
    // Le tank s'écarte ensuite : seule la décroissance propre à la forme agit.
    for (let i = 0; i < 30; i++) {
      const target = shape();
      const tank = own(sim);
      const distance = Math.hypot(target.x - tank.x, target.y - tank.y);
      input(sim, 1, {
        move: { x: (tank.x - target.x) / distance, y: (tank.y - target.y) / distance },
      });
      sim.step();
    }
    expect(pushed).toBeGreaterThan(60);
    expect(Math.hypot(shape().vx, shape().vy)).toBeLessThanOrEqual(28);
  });

  it('touche un tank à très faible fréquence sans répétition de dégâts d’une balle pénétrante', () => {
    const sim = create(45, 3, (config) => {
      config.arena.height = 200;
      config.tickRate = 2;
    });
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    for (let i = 0; i < 7; i++)
      sim.queueCommand(1, { type: 'upgradeStat', stat: 'bulletPenetration' });
    step(sim, 8);
    const health = own(sim, 2).health;
    aimAt(sim, 1, 2);
    sim.step();
    input(sim, 1);
    step(sim, 5);
    expect(own(sim, 2).health).toBe(health - 12);
  });

  it('fait blesser les formes au contact et applique Body Damage à leur destruction', () => {
    const sim = create(1, 1, (config) => {
      config.shapes.targetCount = 1;
    });
    const targetId = sim.snapshotFor(1)!.entities.find((body) => body.kind === 'shape')!.id;
    step(sim, 91);
    let collided = false;
    let destroyed = false;
    for (let i = 0; i < 400; i++) {
      const target = sim.snapshotFor(1)!.entities.find((body) => body.id === targetId);
      if (!target) {
        destroyed = true;
        break;
      }
      const tank = own(sim);
      const dx = target.x - tank.x;
      const dy = target.y - tank.y;
      const distance = Math.hypot(dx, dy);
      input(sim, 1, { move: { x: dx / distance, y: dy / distance } });
      sim.step();
      if (own(sim).health < own(sim).maxHealth) collided = true;
    }
    input(sim);
    expect(collided).toBe(true);
    expect(destroyed).toBe(true);
    expect(sim.snapshotFor(1)!.self.score).toBe(10);
  });

  it('augmente les dégâts corporels et la régénération investis', () => {
    const runContact = (boosted: boolean) => {
      const sim = create(45, 3, (config) => {
        config.arena.height = 200;
      });
      sim.addPlayer(2, { name: 'Bob' });
      sim.step();
      if (boosted) sim.queueCommand(1, { type: 'upgradeStat', stat: 'bodyDamage' });
      step(sim, 91);
      const left = own(sim, 1).x < own(sim, 2).x ? 1 : 2;
      for (let i = 0; i < 60; i++) {
        input(sim, left, { move: { x: 1, y: 0 } });
        input(sim, left === 1 ? 2 : 1, { move: { x: -1, y: 0 } });
        sim.step();
      }
      return own(sim, 2).health;
    };
    expect(runContact(true)).toBeLessThan(runContact(false));
    const runRegen = (boosted: boolean) => {
      const sim = create(1, 3, (config) => {
        config.arena.height = 200;
        config.progression.startLevel = 2;
      });
      sim.addPlayer(2, { name: 'Bob' });
      sim.step();
      if (boosted) sim.queueCommand(2, { type: 'upgradeStat', stat: 'healthRegen' });
      step(sim, 91);
      aimAt(sim, 1, 2);
      sim.step();
      input(sim, 1);
      step(sim, 240);
      return own(sim, 2).health;
    };
    expect(runRegen(true)).toBeGreaterThan(runRegen(false));
  });

  it('conserve tout le score en Sandbox, réinitialise classe et dépenses, et accepte un délai nul', () => {
    const options = resolveModeConfig('sandbox');
    options.progression.startLevel = 15;
    options.shapes.targetCount = 0;
    options.arena = { width: 1000, height: 200 };
    const sim = createSimulation({ config: options, seed: 3 });
    sim.addPlayer(1, { name: 'Ana' });
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    sim.queueCommand(2, { type: 'chooseClass', classId: 'twin' });
    sim.queueCommand(2, { type: 'upgradeStat', stat: 'maxHealth' });
    sim.step();
    const before = sim.snapshotFor(2)!.self;
    const death = shootUntilDeath(sim);
    expect(death.death.respawnTick).toBe(death.death.tick);
    sim.queueCommand(2, { type: 'respawn' });
    sim.step();
    const after = sim.snapshotFor(2)!.self;
    expect(after.score).toBe(before.score);
    expect(after.level).toBe(15);
    expect(after.classId).toBe('tank');
    expect(after.stats.maxHealth).toBe(0);
    expect(after.statPoints).toBe(14);
  });

  it('émet chaque palier de niveau atteint par le score, puis borne le niveau et les points', () => {
    const sim = create(1, 3, (config) => {
      config.progression.maxLevel = 3;
      config.arena.height = 200;
    });
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    const events: SimEvent[] = [];
    for (let i = 0; i < 500 && sim.snapshotFor(2)!.self.alive; i++) {
      aimAt(sim, 1, 2);
      events.push(...sim.step());
    }
    expect(events.filter((event) => event.type === 'levelUp')).toEqual([
      { type: 'levelUp', playerId: 1, level: 2 },
      { type: 'levelUp', playerId: 1, level: 3 },
    ]);
    expect(sim.snapshotFor(1)!.self).toMatchObject({
      score: 100,
      level: 3,
      statPoints: 2,
      levelProgress: 1,
    });
    expect(events.filter((event) => event.type === 'death')).toHaveLength(1);
  });

  it('rejoue une partie chargée avec les mêmes collisions, commandes, événements et snapshots', () => {
    const run = () => {
      const options = resolveModeConfig('ffa');
      options.progression.startLevel = 15;
      const sim = createSimulation({ config: options, seed: 17 });
      for (let id = 1; id <= 8; id++) sim.addPlayer(id, { name: `P${id}` });
      const snapshots = [];
      const events: SimEvent[] = [];
      for (let tick = 0; tick < 300; tick++) {
        for (let id = 1; id <= 8; id++) {
          sim.queueCommand(id, {
            type: 'upgradeStat',
            stat: STAT_IDS[(tick + id) % STAT_IDS.length]!,
          });
          if (tick === 1)
            sim.queueCommand(id, { type: 'chooseClass', classId: id % 2 ? 'twin' : 'machine-gun' });
          sim.setInput(id, {
            seq: tick + 1,
            move: { x: Math.sin(tick / 20 + id), y: Math.cos(tick / 20 + id) },
            aim: { x: Math.cos(tick / 10 + id), y: Math.sin(tick / 10 + id) },
            fire: true,
            alt: false,
          });
        }
        events.push(...sim.step());
        if (tick % 30 === 0) snapshots.push(sim.snapshotFor(1));
      }
      return { snapshots, events };
    };
    const first = run();
    expect(
      first.snapshots.some((snapshot) =>
        snapshot!.entities.some((body) => body.kind === 'projectile'),
      ),
    ).toBe(true);
    expect(first).toEqual(run());
  });

  it('retire immédiatement le joueur et ses tirs sans crédit fantôme', () => {
    const sim = create();
    input(sim, 1, { fire: true });
    step(sim, 20);
    sim.addPlayer(2, { name: 'Bob' });
    sim.step();
    sim.removePlayer(1);
    expect(sim.snapshotFor(2)!.entities.filter((body) => body.kind === 'projectile')).toHaveLength(
      0,
    );
    expect(sim.snapshotFor(2)!.leaderboard!.map((entry) => entry.playerId)).toEqual([2]);
  });
});

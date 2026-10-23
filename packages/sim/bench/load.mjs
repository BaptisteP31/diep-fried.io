// Harness Node uniquement : aucune horloge n'entre dans la simulation.
// Depuis la racine : node --import tsx packages/sim/bench/load.mjs
import { performance } from 'node:perf_hooks';
import { resolveModeConfig } from '../../shared/src/index.ts';
import { createSimulation } from '../src/index.ts';

const scenario = process.argv[2] ?? 'basic';
if (!['basic', 'swarm'].includes(scenario)) throw new Error('Expected basic or swarm');
const paths = [
  ['sniper', 'overseer', 'overlord'],
  ['sniper', 'overseer', 'overlord'],
  ['twin', 'twin-flank', 'battleship'],
  ['twin', 'twin-flank', 'battleship'],
  ['sniper', 'overseer', 'factory'],
  ['sniper', 'overseer', 'factory'],
  ['sniper', 'overseer', 'necromancer'],
  ['sniper', 'overseer', 'necromancer'],
];
const config = resolveModeConfig('ffa');
config.progression.startLevel = scenario === 'swarm' ? 45 : 15;
const sim = createSimulation({ config, seed: 17 });
for (let id = 1; id <= 8; id++) sim.addPlayer(id, { name: `P${id}` });
const costs = [];
let bytes = 0;
let snapshots = 0;
let entityCounts = 0;
let peakControlled = 0;
let peakProjectiles = 0;
const begin = performance.now();
for (let tick = 0; tick < 900; tick++) {
  for (let id = 1; id <= 8; id++) {
    const previous = scenario === 'swarm' ? sim.snapshotFor(id) : undefined;
    if (tick === 1 && scenario === 'basic') {
      sim.queueCommand(id, { type: 'chooseClass', classId: id % 2 ? 'twin' : 'machine-gun' });
    }
    if (scenario === 'swarm' && previous?.self.classId === 'tank') {
      for (const classId of paths[id - 1]) sim.queueCommand(id, { type: 'chooseClass', classId });
      for (const stat of ['maxHealth', 'bulletPenetration', 'reload', 'bulletDamage'])
        for (let point = 0; point < 7; point++) sim.queueCommand(id, { type: 'upgradeStat', stat });
    }
    sim.queueCommand(id, { type: 'respawn' });
    let move = { x: Math.sin(tick / 20 + id), y: Math.cos(tick / 20 + id) };
    let aim = { x: Math.cos(tick / 10 + id), y: Math.sin(tick / 10 + id) };
    if (scenario === 'swarm') {
      aim.x *= 700;
      aim.y *= 700;
      const own = previous?.entities.find((b) => b.id === previous.self.entityId);
      if (own && previous.self.classId === 'necromancer') {
        const square = previous.entities
          .filter((b) => b.kind === 'shape' && b.shape === 'square')
          .sort(
            (a, b) => Math.hypot(a.x - own.x, a.y - own.y) - Math.hypot(b.x - own.x, b.y - own.y),
          )[0];
        if (square) {
          aim = { x: square.x - own.x, y: square.y - own.y };
          const d = Math.hypot(aim.x, aim.y) || 1;
          move = previous.entities.some((b) => b.kind === 'projectile' && b.ownerId === own.id)
            ? { x: 0, y: 0 }
            : { x: aim.x / d, y: aim.y / d };
        }
      }
    }
    sim.setInput(id, {
      seq: tick + 1,
      move,
      aim,
      fire: true,
      alt: false,
    });
  }
  const start = performance.now();
  sim.step();
  costs.push(performance.now() - start);
  if (sim.tick % config.snapshotInterval === 0) {
    const visibleProjectiles = new Map();
    for (let id = 1; id <= 8; id++) {
      const snapshot = sim.snapshotFor(id);
      bytes += Buffer.byteLength(JSON.stringify(snapshot));
      snapshots++;
      entityCounts += snapshot.entities.length;
      for (const body of snapshot.entities)
        if (body.kind === 'projectile') visibleProjectiles.set(body.id, body);
    }
    peakProjectiles = Math.max(peakProjectiles, visibleProjectiles.size);
    peakControlled = Math.max(
      peakControlled,
      [...visibleProjectiles.values()].filter((b) => b.family === 'drone' || b.family === 'minion')
        .length,
    );
  }
}
costs.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      scenario,
      ticks: sim.tick,
      peakControlled,
      peakProjectiles,
      players: 8,
      shapes: config.shapes.targetCount,
      tickRate: config.tickRate,
      simulatedSeconds: 30,
      elapsedMs: +(performance.now() - begin).toFixed(1),
      meanStepMs: +(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(3),
      p95StepMs: +costs[Math.floor(costs.length * 0.95)].toFixed(3),
      snapshotBytesMean: Math.round(bytes / snapshots),
      entitiesPerSnapshotMean: +(entityCounts / snapshots).toFixed(1),
      aggregateKBps: +(bytes / 30 / 1000).toFixed(1),
      perPlayerKBps: +(bytes / 30 / 8 / 1000).toFixed(1),
    },
    null,
    2,
  ),
);

// Harness Node uniquement : aucune horloge n'entre dans la simulation.
// Depuis la racine : node --import tsx packages/sim/bench/load.mjs
import { performance } from 'node:perf_hooks';
import { resolveModeConfig } from '../../shared/src/index.ts';
import { createSimulation } from '../src/index.ts';

const config = resolveModeConfig('ffa');
config.progression.startLevel = 15;
const sim = createSimulation({ config, seed: 17 });
for (let id = 1; id <= 8; id++) sim.addPlayer(id, { name: `P${id}` });
const costs = [];
let bytes = 0;
let snapshots = 0;
let entityCounts = 0;
const begin = performance.now();
for (let tick = 0; tick < 900; tick++) {
  for (let id = 1; id <= 8; id++) {
    if (tick === 1) {
      sim.queueCommand(id, { type: 'chooseClass', classId: id % 2 ? 'twin' : 'machine-gun' });
    }
    sim.queueCommand(id, { type: 'respawn' });
    sim.setInput(id, {
      seq: tick + 1,
      move: { x: Math.sin(tick / 20 + id), y: Math.cos(tick / 20 + id) },
      aim: { x: Math.cos(tick / 10 + id), y: Math.sin(tick / 10 + id) },
      fire: true,
      alt: false,
    });
  }
  const start = performance.now();
  sim.step();
  costs.push(performance.now() - start);
  if (sim.tick % config.snapshotInterval === 0) {
    for (let id = 1; id <= 8; id++) {
      const snapshot = sim.snapshotFor(id);
      bytes += Buffer.byteLength(JSON.stringify(snapshot));
      snapshots++;
      entityCounts += snapshot.entities.length;
    }
  }
}
costs.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      ticks: sim.tick,
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

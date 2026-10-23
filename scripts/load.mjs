import { runScenario } from './qa/network-scenario.mjs';

await runScenario({ players: 8, durationMs: 30_000, label: 'load' });

import { runScenario } from './qa/network-scenario.mjs';

await runScenario({ players: 2, durationMs: 2_500, label: 'smoke' });

import type { ModeConfig } from '@diep-fried/shared';
import { generateMaze, generateTeamLayout } from './maps';
import { MODE_RULES } from './modes';
import { defaultObjectiveSites } from './objectives';

/** Résout une carte une seule fois, avant Room et Simulation ; aucune mutation du preset. */
export function prepareModeConfig(config: ModeConfig, seed: number): ModeConfig {
  const resolved = JSON.parse(JSON.stringify(config)) as ModeConfig;
  const { width, height } = resolved.arena;
  if (resolved.mode === 'maze' && resolved.map.walls.length === 0)
    resolved.map.walls = generateMaze({ width, height, seed });
  const teams = resolved.teams.length;
  if ((teams === 2 || teams === 4) && resolved.map.zones.length === 0)
    resolved.map.zones = generateTeamLayout(width, height, teams);
  // Objectifs placés après les bases : drapeaux et vaisseaux-mères se posent devant elles.
  if (MODE_RULES[resolved.mode].objective && resolved.map.objectives === undefined)
    resolved.map.objectives = defaultObjectiveSites(resolved);
  return resolved;
}

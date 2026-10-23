import type { ModeConfig } from '@diep-fried/shared';
import { generateMaze, generateTeamLayout } from './maps';

/** Résout une carte une seule fois, avant Room et Simulation ; aucune mutation du preset. */
export function prepareModeConfig(config: ModeConfig, seed: number): ModeConfig {
  const resolved = JSON.parse(JSON.stringify(config)) as ModeConfig;
  const { width, height } = resolved.arena;
  if (resolved.mode === 'maze' && resolved.map.walls.length === 0)
    resolved.map.walls = generateMaze({ width, height, seed });
  if ((resolved.mode === 'teams2' || resolved.mode === 'teams4') && resolved.map.zones.length === 0)
    resolved.map.zones = generateTeamLayout(width, height, resolved.mode === 'teams2' ? 2 : 4);
  return resolved;
}

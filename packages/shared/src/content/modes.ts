import type { ModeConfig, ModeId, RoomOptions } from '../model/mode';

/**
 * Presets de modes et résolution des options de salon.
 * Valeurs par défaut : choix de diep-fried.io, non mesurés sur le jeu original.
 */

const ARENA_SIZES = { small: 3000, medium: 5000, large: 8000 } as const;
const SHAPE_DENSITY = { low: 0.5, normal: 1, high: 2 } as const;
/** Formes visées par million d'unités² d'arène, densité `normal`. */
const SHAPES_PER_MILLION_UNITS = 8;

export const MAX_PLAYERS_LIMIT = 32;

const base: Omit<ModeConfig, 'mode'> = {
  tickRate: 30,
  snapshotInterval: 2,
  arena: { width: ARENA_SIZES.medium, height: ARENA_SIZES.medium },
  maxPlayers: 16,
  teams: [],
  friendlyFire: false,
  map: { walls: [], zones: [] },
  shapes: { targetCount: 0 },
  progression: { maxLevel: 45, startLevel: 1, scoreKeptOnDeath: 0.5 },
  respawn: { delayTicks: 60 },
  sandbox: { cheats: false },
};

const PRESETS: Record<ModeId, Omit<ModeConfig, 'mode'>> = {
  ffa: base,
  sandbox: {
    ...base,
    maxPlayers: 8,
    arena: { width: ARENA_SIZES.small, height: ARENA_SIZES.small },
    progression: { ...base.progression, scoreKeptOnDeath: 1 },
    respawn: { delayTicks: 0 },
    sandbox: { cheats: true },
  },
};

/** Construit la configuration complète d'un salon. `options` doit déjà être validé. */
export function resolveModeConfig(mode: ModeId, options: RoomOptions = {}): ModeConfig {
  const preset = PRESETS[mode];
  const side = options.arenaSize ? ARENA_SIZES[options.arenaSize] : preset.arena.width;
  const arena = options.arenaSize ? { width: side, height: side } : { ...preset.arena };
  const density = SHAPE_DENSITY[options.shapeDensity ?? 'normal'];
  const maxPlayers = Math.min(
    MAX_PLAYERS_LIMIT,
    Math.max(1, Math.floor(options.maxPlayers ?? preset.maxPlayers)),
  );
  const config: ModeConfig = {
    ...preset,
    mode,
    arena,
    maxPlayers,
    shapes: {
      targetCount: Math.round(
        ((arena.width * arena.height) / 1_000_000) * SHAPES_PER_MILLION_UNITS * density,
      ),
    },
  };
  // Copie profonde : aucun salon ne partage d'objet avec un preset.
  return JSON.parse(JSON.stringify(config)) as ModeConfig;
}

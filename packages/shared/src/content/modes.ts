import type {
  BotDifficulty,
  MatchConfig,
  ModeConfig,
  ModeId,
  RoomOptions,
  TeamDefinition,
} from '../model/mode';

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

const TWO_TEAMS: TeamDefinition[] = [
  { id: 1, color: 'blue', name: 'Bleus' },
  { id: 2, color: 'red', name: 'Rouges' },
];
const FOUR_TEAMS: TeamDefinition[] = [
  ...TWO_TEAMS,
  { id: 3, color: 'green', name: 'Verts' },
  { id: 4, color: 'purple', name: 'Violets' },
];
/** Nid central FFA : rayon en fraction du plus petit côté (résolu dans `resolveModeConfig`). */
const NEST_RADIUS_FRACTION = 0.14;
/** Rounds : deux joueurs minimum pour éviter une victoire solo immédiate ; 10 s de podium. */
const match: MatchConfig = {
  minPlayers: 2,
  restartDelayTicks: 300,
  timeLimitTicks: 0,
  scoreLimit: 0,
};

const PRESETS: Record<ModeId, Omit<ModeConfig, 'mode'>> = {
  ffa: {
    ...base,
    shapes: {
      targetCount: 0,
      nest: { radius: 0, alphaShare: 0.01, crasherShare: 0.05 },
      shinyChance: 0.0005,
    },
    // 3 min puis toutes les 10 min (proposition non vérifiée du catalogue : 10-15 min).
    bosses: { enabled: true, firstSpawnTicks: 5400, intervalTicks: 18_000, maxAlive: 1 },
  },
  maze: base,
  teams2: { ...base, teams: TWO_TEAMS },
  teams4: { ...base, teams: FOUR_TEAMS },
  domination: { ...base, teams: TWO_TEAMS, match },
  tag: { ...base, teams: FOUR_TEAMS, match },
  ctf: { ...base, teams: TWO_TEAMS, match: { ...match, timeLimitTicks: 18_000, scoreLimit: 3 } },
  breakout: {
    ...base,
    teams: TWO_TEAMS,
    match: { ...match, timeLimitTicks: 18_000, scoreLimit: 600 },
  },
  survival: {
    ...base,
    maxPlayers: 10,
    match: {
      ...match,
      shrink: {
        delayTicks: 1800,
        durationTicks: 7200,
        finalRadiusFraction: 0.08,
        damagePerSecond: 25,
      },
    },
  },
  mothership: { ...base, teams: TWO_TEAMS, match },
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

  const defaultDifficulty: BotDifficulty = 'normal';
  const botDifficulty: BotDifficulty =
    options.botDifficulty === 'easy' ||
    options.botDifficulty === 'normal' ||
    options.botDifficulty === 'hard'
      ? options.botDifficulty
      : defaultDifficulty;

  const rawBotCount = options.botCount !== undefined ? options.botCount : 5;
  const safeCount =
    typeof rawBotCount === 'number' && Number.isFinite(rawBotCount) ? Math.floor(rawBotCount) : 5;
  const clampedBotCount = Math.max(0, Math.min(12, Math.min(maxPlayers - 1, safeCount)));

  const config: ModeConfig = {
    ...preset,
    mode,
    arena,
    maxPlayers,
    shapes: {
      ...preset.shapes,
      targetCount: Math.round(
        ((arena.width * arena.height) / 1_000_000) * SHAPES_PER_MILLION_UNITS * density,
      ),
    },
    bots: {
      count: clampedBotCount,
      difficulty: botDifficulty,
    },
  };
  if (preset.shapes.nest)
    config.shapes.nest = {
      ...preset.shapes.nest,
      radius: Math.round(Math.min(arena.width, arena.height) * NEST_RADIUS_FRACTION),
    };
  // Copie profonde : aucun salon ne partage d'objet avec un preset.
  return JSON.parse(JSON.stringify(config)) as ModeConfig;
}

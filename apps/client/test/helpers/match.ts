import {
  emptyStatLevels,
  type MatchState,
  type SnapshotPayload,
  type TankState,
} from '@diep-fried/shared';

export function match(overrides: Partial<MatchState> = {}): MatchState {
  return {
    phase: 'playing',
    round: 1,
    phaseTick: 30,
    endTick: 18030,
    minPlayers: 2,
    players: 2,
    result: null,
    scores: [
      { team: 1, score: 1, players: 1 },
      { team: 2, score: 0, players: 1 },
    ],
    objectives: [],
    ...overrides,
  };
}

export function tank(overrides: Partial<TankState> = {}): TankState {
  return {
    kind: 'tank',
    id: 10,
    playerId: 1,
    name: 'Alice',
    classId: 'tank',
    x: 500,
    y: 500,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 20,
    team: 1,
    level: 1,
    score: 0,
    health: 100,
    maxHealth: 100,
    opacity: 1,
    barrelShots: [],
    spawnProtected: false,
    ...overrides,
  };
}

export function snapshot(
  overrides: Omit<Partial<SnapshotPayload>, 'match'> & { match?: MatchState | undefined } = {},
): SnapshotPayload {
  const { match: state, ...rest } = overrides;
  const matchState = Object.hasOwn(overrides, 'match') ? state : match();
  return {
    tick: 60,
    ackSeq: 50,
    self: {
      playerId: 1,
      entityId: 10,
      alive: true,
      classId: 'tank',
      level: 1,
      score: 0,
      levelProgress: 0,
      statPoints: 0,
      stats: emptyStatLevels(),
      statCaps: emptyStatLevels(),
      classChoices: [],
      view: 900,
      respawnTick: null,
    },
    entities: [tank()],
    ...(matchState ? { match: matchState } : {}),
    ...rest,
  };
}

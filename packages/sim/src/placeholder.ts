import {
  STARTING_CLASS,
  emptyStatLevels,
  getClassDefinition,
  DEFAULT_STAT_CAP,
  type PlayerCommand,
  type PlayerId,
  type PlayerInput,
  type SnapshotPayload,
  type StatLevels,
  type TankState,
  type TeamId,
} from '@diep-fried/shared';
import { MODE_RULES, type ModeContext } from './modes';
import { Rng } from './rng';
import type {
  PlayerProfile,
  SimEvent,
  Simulation,
  SimulationFactory,
  SimulationOptions,
} from './simulation';

/**
 * Simulation provisoire du jalon 1 : fait apparaître un tank immobile par joueur et
 * applique seulement l'orientation de visée. Elle existe pour faire tourner le serveur et
 * le client de bout en bout ; elle sera remplacée par la simulation complète (jalon 2)
 * derrière la même interface `Simulation`. Aucune règle de gameplay n'est définie ici.
 */

const TANK_RADIUS = 25;
const PLACEHOLDER_HEALTH = 50;
const PLACEHOLDER_VIEW = 900;

interface PlaceholderTank {
  id: number;
  x: number;
  y: number;
  angle: number;
}

interface PlayerSlot {
  profile: PlayerProfile;
  team: TeamId;
  input: PlayerInput | null;
  appliedSeq: number;
  tank: PlaceholderTank | null;
}

export const createPlaceholderSimulation: SimulationFactory = (options) =>
  new PlaceholderSimulation(options);

class PlaceholderSimulation implements Simulation {
  readonly config;
  private currentTick = 0;
  private nextEntityId = 1;
  private readonly rng: Rng;
  private readonly players = new Map<PlayerId, PlayerSlot>();
  private readonly statCaps: StatLevels;

  constructor({ config, seed }: SimulationOptions) {
    this.config = config;
    this.rng = new Rng(seed);
    const caps = emptyStatLevels();
    for (const stat of Object.keys(caps) as (keyof StatLevels)[]) caps[stat] = DEFAULT_STAT_CAP;
    this.statCaps = caps;
  }

  get tick(): number {
    return this.currentTick;
  }

  private get rules() {
    return MODE_RULES[this.config.mode];
  }

  private get context(): ModeContext {
    return { config: this.config, rng: this.rng, tick: this.currentTick };
  }

  addPlayer(playerId: PlayerId, profile: PlayerProfile): void {
    if (this.players.has(playerId)) return;
    const team = this.rules.assignTeam(this.context, playerId);
    this.players.set(playerId, { profile, team, input: null, appliedSeq: 0, tank: null });
  }

  removePlayer(playerId: PlayerId): void {
    this.players.delete(playerId);
  }

  setInput(playerId: PlayerId, input: PlayerInput): void {
    const slot = this.players.get(playerId);
    if (!slot || (slot.input && input.seq <= slot.input.seq)) return;
    slot.input = input;
  }

  queueCommand(_playerId: PlayerId, _command: PlayerCommand): void {
    // Aucune commande n'a d'effet dans la simulation provisoire.
  }

  step(): SimEvent[] {
    const events: SimEvent[] = [];
    this.currentTick += 1;
    for (const [playerId, slot] of this.players) {
      if (!slot.tank) {
        const at = this.rules.spawnPoint(this.context, slot.team, TANK_RADIUS);
        slot.tank = { id: this.nextEntityId++, x: at.x, y: at.y, angle: 0 };
        events.push({ type: 'spawn', playerId });
      }
      if (slot.input) {
        const { aim, seq } = slot.input;
        if (aim.x !== 0 || aim.y !== 0) slot.tank.angle = Math.atan2(aim.y, aim.x);
        slot.appliedSeq = seq;
      }
    }
    return events;
  }

  snapshotFor(playerId: PlayerId): SnapshotPayload | undefined {
    const slot = this.players.get(playerId);
    if (!slot) return undefined;
    const entities: TankState[] = [];
    for (const [id, other] of this.players) {
      if (other.tank) entities.push(this.tankState(id, other, other.tank));
    }
    return {
      tick: this.currentTick,
      ackSeq: slot.appliedSeq,
      self: {
        playerId,
        entityId: slot.tank?.id ?? null,
        alive: slot.tank !== null,
        classId: STARTING_CLASS,
        level: this.config.progression.startLevel,
        score: 0,
        levelProgress: 0,
        statPoints: 0,
        stats: emptyStatLevels(),
        statCaps: { ...this.statCaps },
        classChoices: [],
        view: PLACEHOLDER_VIEW,
        respawnTick: null,
      },
      entities,
    };
  }

  private tankState(playerId: PlayerId, slot: PlayerSlot, tank: PlaceholderTank): TankState {
    const barrels = getClassDefinition(STARTING_CLASS)?.barrels.length ?? 0;
    return {
      kind: 'tank',
      id: tank.id,
      x: tank.x,
      y: tank.y,
      vx: 0,
      vy: 0,
      angle: tank.angle,
      radius: TANK_RADIUS,
      team: slot.team,
      playerId,
      name: slot.profile.name,
      classId: STARTING_CLASS,
      level: this.config.progression.startLevel,
      score: 0,
      health: PLACEHOLDER_HEALTH,
      maxHealth: PLACEHOLDER_HEALTH,
      opacity: 1,
      barrelShots: new Array<number>(barrels).fill(-1),
      spawnProtected: false,
    };
  }
}

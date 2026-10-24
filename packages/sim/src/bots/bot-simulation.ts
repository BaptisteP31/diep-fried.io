import type {
  BotDifficulty,
  EntityState,
  ModeConfig,
  PlayerCommand,
  PlayerId,
  PlayerInput,
  Rect,
  SnapshotPayload,
  TeamId,
  Tick,
} from '@diep-fried/shared';
import { Rng } from '../rng';
import type {
  PlayerProfile,
  SimEvent,
  Simulation,
  SimulationFactory,
  SimulationOptions,
} from '../simulation';
import { createSimulation } from '../world';
import { BotBrain } from './bot-brain';
import { getObstaclesForTeam, NavGrid } from './bot-navigation';

export const BOT_ID_BASE = 900_000;
export const MAX_BOT_COUNT = 12;

export const BOT_NAMES = [
  '[BOT] Alpha',
  '[BOT] Bravo',
  '[BOT] Charlie',
  '[BOT] Delta',
  '[BOT] Echo',
  '[BOT] Foxtrot',
  '[BOT] Golf',
  '[BOT] Hotel',
  '[BOT] India',
  '[BOT] Juliet',
  '[BOT] Kilo',
  '[BOT] Lima',
] as const;

interface BotSlot {
  id: PlayerId;
  index: number;
  name: string;
  brain: BotBrain;
}

export class BotSimulation implements Simulation {
  private readonly underlying: Simulation;
  private readonly humanPlayers = new Set<PlayerId>();
  private readonly allBots: BotSlot[] = [];
  private readonly activeBots = new Map<PlayerId, BotSlot>();
  private readonly navGrids = new Map<TeamId, NavGrid>();
  private readonly difficulty: BotDifficulty;
  private readonly configuredBotCount: number;

  constructor(options: SimulationOptions) {
    this.underlying = createSimulation(options);
    this.configuredBotCount = this.config.bots ? Math.max(0, this.config.bots.count) : 0;
    this.difficulty = this.config.bots?.difficulty ?? 'normal';

    const rootRng = new Rng((options.seed ^ 0x6a09e667) >>> 0);
    for (let i = 0; i < MAX_BOT_COUNT; i++) {
      const botId = BOT_ID_BASE + i + 1;
      const botName = BOT_NAMES[i] ?? `[BOT] ${i + 1}`;
      const brainRng = new Rng(rootRng.int(0, 2 ** 31 - 1));
      const brain = new BotBrain(botId, i, this.difficulty, brainRng);
      this.allBots.push({
        id: botId,
        index: i,
        name: botName,
        brain,
      });
    }
  }

  get config(): ModeConfig {
    return this.underlying.config;
  }

  get tick(): Tick {
    return this.underlying.tick;
  }

  addPlayer(playerId: PlayerId, profile: PlayerProfile): void {
    const isNew = !this.humanPlayers.has(playerId);
    if (isNew) {
      this.humanPlayers.add(playerId);
      this.underlying.addPlayer(playerId, profile);
      this.synchronizeBotPopulation();
    }
  }

  removePlayer(playerId: PlayerId): void {
    if (this.humanPlayers.has(playerId)) {
      this.humanPlayers.delete(playerId);
      this.underlying.removePlayer(playerId);
      this.synchronizeBotPopulation();
    } else if (this.activeBots.has(playerId)) {
      this.activeBots.delete(playerId);
      this.underlying.removePlayer(playerId);
    }
  }

  setInput(playerId: PlayerId, input: PlayerInput): void {
    this.underlying.setInput(playerId, input);
  }

  queueCommand(playerId: PlayerId, command: PlayerCommand): void {
    this.underlying.queueCommand(playerId, command);
  }

  snapshotFor(playerId: PlayerId): SnapshotPayload | undefined {
    return this.underlying.snapshotFor(playerId);
  }

  step(): SimEvent[] {
    if (this.configuredBotCount > 0 && this.activeBots.size > 0) {
      for (const bot of this.activeBots.values()) {
        const snapshot = this.underlying.snapshotFor(bot.id);
        const botTeam =
          snapshot?.entities.find((e: EntityState) => e.id === snapshot.self.entityId)?.team ?? 0;
        const obstacles = this.getObstacles(botTeam);
        const navGrid = this.getNavGrid(botTeam, obstacles);

        const input = bot.brain.step(
          snapshot,
          this.config,
          obstacles,
          navGrid,
          (cmd: PlayerCommand) => this.underlying.queueCommand(bot.id, cmd),
        );
        this.underlying.setInput(bot.id, input);
      }
    }

    return this.underlying.step();
  }

  private synchronizeBotPopulation(): void {
    if (this.configuredBotCount <= 0) {
      this.removeAllBots();
      return;
    }

    // When the last human is removed, clean up all bots so room does not stay artificially alive
    if (this.humanPlayers.size === 0) {
      this.removeAllBots();
      return;
    }

    // Humans have priority: slots up to maxPlayers
    const targetBotCount = Math.min(
      this.configuredBotCount,
      Math.max(0, this.config.maxPlayers - this.humanPlayers.size),
    );

    // Shrink if humans took slots
    while (this.activeBots.size > targetBotCount) {
      const activeList = [...this.activeBots.values()];
      const botToRemove = activeList[activeList.length - 1]!;
      this.activeBots.delete(botToRemove.id);
      this.underlying.removePlayer(botToRemove.id);
    }

    // Expand if humans left or on initial spawn
    while (this.activeBots.size < targetBotCount) {
      const nextBot = this.allBots[this.activeBots.size];
      if (!nextBot) break;
      this.activeBots.set(nextBot.id, nextBot);
      this.underlying.addPlayer(nextBot.id, { name: nextBot.name });
    }
  }

  private removeAllBots(): void {
    for (const bot of this.activeBots.values()) {
      this.underlying.removePlayer(bot.id);
    }
    this.activeBots.clear();
  }

  private getObstacles(team: TeamId): Rect[] {
    return getObstaclesForTeam(this.config, team);
  }

  private getNavGrid(team: TeamId, obstacles: readonly Rect[]): NavGrid {
    let grid = this.navGrids.get(team);
    if (!grid) {
      grid = new NavGrid(this.config.arena, obstacles);
      this.navGrids.set(team, grid);
    }
    return grid;
  }
}

export const createBotSimulation: SimulationFactory = (options: SimulationOptions): Simulation => {
  return new BotSimulation(options);
};

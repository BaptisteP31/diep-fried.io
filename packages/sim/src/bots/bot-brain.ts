import type {
  BotDifficulty,
  EntityState,
  ModeConfig,
  PlayerCommand,
  PlayerId,
  PlayerInput,
  Rect,
  SnapshotPayload,
  TankState,
  Vec2,
} from '@diep-fried/shared';
import { Rng } from '../rng';
import { BOT_BUILDS, type BuildArchetype } from './bot-builds';
import { NavGrid, steerAroundObstacles } from './bot-navigation';

interface DifficultyProfile {
  aimSmoothing: number;
  dispersionMax: number;
  fireAngleThreshold: number;
  fleeHealthThreshold: number;
}

const DIFFICULTY_PROFILES: Record<BotDifficulty, DifficultyProfile> = {
  easy: {
    aimSmoothing: 0.35,
    dispersionMax: 0.22,
    fireAngleThreshold: 0.5,
    fleeHealthThreshold: 0.25,
  },
  normal: {
    aimSmoothing: 0.65,
    dispersionMax: 0.09,
    fireAngleThreshold: 0.35,
    fleeHealthThreshold: 0.35,
  },
  hard: {
    aimSmoothing: 0.95,
    dispersionMax: 0.02,
    fireAngleThreshold: 0.2,
    fleeHealthThreshold: 0.4,
  },
};

export class BotBrain {
  readonly build: BuildArchetype;
  private readonly profile: DifficultyProfile;
  private seq = 0;
  private lastThinkTick = -1;

  private currentMove: Vec2 = { x: 0, y: 0 };
  private currentAim: Vec2 = { x: 100, y: 0 };
  private currentFire = false;
  private aimAngle = 0;

  private wanderTarget: Vec2 | null = null;
  private wanderExpiresTick = 0;

  private waypoints: Vec2[] = [];
  private currentDestination: Vec2 | null = null;

  private lastX = 0;
  private lastY = 0;
  private stuckTicks = 0;
  private unstickUntilTick = 0;
  private unstickMove: Vec2 = { x: 0, y: 0 };

  constructor(
    readonly botId: PlayerId,
    readonly botIndex: number,
    readonly difficulty: BotDifficulty,
    private readonly rng: Rng,
  ) {
    this.build = BOT_BUILDS[botIndex % BOT_BUILDS.length]!;
    this.profile = DIFFICULTY_PROFILES[difficulty];
  }

  get currentSeq(): number {
    return this.seq;
  }

  step(
    snapshot: SnapshotPayload | undefined,
    config: ModeConfig,
    obstacles: readonly Rect[],
    navGrid: NavGrid,
    queueCommand: (command: PlayerCommand) => void,
  ): PlayerInput {
    this.seq++;

    if (!snapshot) {
      return {
        seq: this.seq,
        move: { x: 0, y: 0 },
        aim: { x: 100, y: 0 },
        fire: false,
        alt: false,
      };
    }

    // Thinking frequency: 5-10Hz (every 4 ticks at 30Hz), staggered across bots
    const thinkInterval = 4;
    const isThinkTick =
      this.lastThinkTick === -1 || (snapshot.tick + this.botIndex) % thinkInterval === 0;

    if (isThinkTick) {
      this.lastThinkTick = snapshot.tick;
      this.think(snapshot, config, obstacles, navGrid, queueCommand);
    }

    return {
      seq: this.seq,
      move: this.currentMove,
      aim: this.currentAim,
      fire: this.currentFire,
      alt: false,
    };
  }

  private think(
    snapshot: SnapshotPayload,
    config: ModeConfig,
    obstacles: readonly Rect[],
    navGrid: NavGrid,
    queueCommand: (command: PlayerCommand) => void,
  ): void {
    // 1. Check if dead or spectator
    if (!snapshot.self.alive) {
      this.currentMove = { x: 0, y: 0 };
      this.currentFire = false;
      this.waypoints = [];
      this.currentDestination = null;

      // In Survival mode, spectators wait for the next round
      if (snapshot.self.spectator) {
        return;
      }

      // Respawn when allowed
      if (snapshot.self.respawnTick !== null && snapshot.tick >= snapshot.self.respawnTick) {
        queueCommand({ type: 'respawn' });
      }
      return;
    }

    // 2. Spend stat points and choose class upgrades
    this.handleUpgrades(snapshot, queueCommand);

    // 3. Find bot tank
    const selfTank = snapshot.entities.find(
      (e): e is TankState => e.id === snapshot.self.entityId && e.kind === 'tank',
    );
    if (!selfTank) return;

    const selfPos = { x: selfTank.x, y: selfTank.y };
    const botTeam = selfTank.team;
    const healthRatio = selfTank.health / Math.max(1, selfTank.maxHealth);

    // 4. Stuck detection & unsticking
    const moved = Math.hypot(selfTank.x - this.lastX, selfTank.y - this.lastY);
    this.lastX = selfTank.x;
    this.lastY = selfTank.y;

    if (moved < 6 && (this.currentMove.x !== 0 || this.currentMove.y !== 0)) {
      this.stuckTicks += 4;
      if (this.stuckTicks >= 20) {
        this.unstickUntilTick = snapshot.tick + 24;
        const escAngle = this.rng.range(-Math.PI, Math.PI);
        this.unstickMove = { x: Math.cos(escAngle), y: Math.sin(escAngle) };
        this.waypoints = [];
        this.currentDestination = null;
        this.wanderTarget = null;
        this.stuckTicks = 0;
      }
    } else {
      this.stuckTicks = 0;
    }

    if (snapshot.tick < this.unstickUntilTick) {
      this.currentMove = this.unstickMove;
      this.currentFire = false;
      return;
    }

    // 5. Categorize visible entities
    const enemies: TankState[] = [];
    const hostileProjectiles: EntityState[] = [];
    const bosses: TankState[] = [];
    const shapes: EntityState[] = [];

    for (const entity of snapshot.entities) {
      if (entity.id === selfTank.id) continue;

      if (entity.kind === 'tank') {
        const isEnemy = botTeam === 0 || entity.team !== botTeam;
        if (isEnemy) {
          if (entity.playerId === null && entity.radius > 40) {
            bosses.push(entity);
          } else {
            enemies.push(entity);
          }
        }
      } else if (entity.kind === 'projectile') {
        const isHostile = botTeam === 0 || entity.team !== botTeam;
        if (isHostile && (entity.family === 'drone' || entity.family === 'minion')) {
          hostileProjectiles.push(entity);
        }
      } else if (entity.kind === 'shape') {
        shapes.push(entity);
      }
    }

    // 6. Objectives & Combat targets
    let destination: Vec2 | null = null;
    let combatTarget: EntityState | null = null;
    let isFleeing = false;

    // Flee condition: low HP with nearby threats, or low level near boss
    if (
      healthRatio < this.profile.fleeHealthThreshold &&
      (enemies.length > 0 || hostileProjectiles.length > 0 || bosses.length > 0)
    ) {
      isFleeing = true;
      let threatX = 0;
      let threatY = 0;
      let count = 0;
      let closestThreat: EntityState | null = null;
      let closestDist = Infinity;

      for (const t of [...enemies, ...hostileProjectiles, ...bosses]) {
        threatX += t.x;
        threatY += t.y;
        count++;
        const d = Math.hypot(t.x - selfPos.x, t.y - selfPos.y);
        if (d < closestDist) {
          closestDist = d;
          closestThreat = t;
        }
      }

      threatX /= count;
      threatY /= count;
      combatTarget = closestThreat;

      // If team mode, retreat towards team base
      const friendlyBase = config.map.zones.find((z) => z.kind === 'base' && z.team === botTeam);
      if (friendlyBase) {
        destination = {
          x: friendlyBase.area.x + friendlyBase.area.width / 2,
          y: friendlyBase.area.y + friendlyBase.area.height / 2,
        };
      } else {
        // Run away from threat centroid
        const awayDx = selfPos.x - threatX;
        const awayDy = selfPos.y - threatY;
        const awayLen = Math.hypot(awayDx, awayDy) || 1;
        destination = {
          x: Math.max(
            100,
            Math.min(config.arena.width - 100, selfPos.x + (awayDx / awayLen) * 400),
          ),
          y: Math.max(
            100,
            Math.min(config.arena.height - 100, selfPos.y + (awayDy / awayLen) * 400),
          ),
        };
      }
    }

    // If not fleeing, evaluate Mode Objectives
    if (!isFleeing && snapshot.match && snapshot.match.phase === 'playing') {
      // Survival safezone
      if (snapshot.match.safeZone) {
        const safe = snapshot.match.safeZone;
        const d = Math.hypot(selfPos.x - safe.x, selfPos.y - safe.y);
        if (d > safe.radius * 0.8) {
          destination = { x: safe.x, y: safe.y };
        }
      }

      // CTF
      if (!destination && config.mode === 'ctf' && snapshot.match.objectives) {
        const carried = snapshot.match.objectives.find(
          (o) => o.kind === 'flag' && o.flag?.carrierId === this.botId,
        );
        if (carried && carried.flag) {
          destination = { x: carried.flag.homeX, y: carried.flag.homeY };
        } else {
          const droppedHome = snapshot.match.objectives.find(
            (o) => o.kind === 'flag' && o.team === botTeam && o.flag?.status === 'dropped',
          );
          if (droppedHome) {
            destination = { x: droppedHome.x, y: droppedHome.y };
          } else {
            const enemyFlag = snapshot.match.objectives.find(
              (o) => o.kind === 'flag' && o.team !== botTeam,
            );
            if (enemyFlag) {
              destination = { x: enemyFlag.x, y: enemyFlag.y };
            }
          }
        }
      }

      // Domination
      if (!destination && config.mode === 'domination' && snapshot.match.objectives) {
        const enemyDominators = snapshot.match.objectives.filter(
          (o) => o.kind === 'dominator' && o.team !== botTeam,
        );
        if (enemyDominators.length > 0) {
          let closest = enemyDominators[0]!;
          let minDist = Math.hypot(closest.x - selfPos.x, closest.y - selfPos.y);
          for (let i = 1; i < enemyDominators.length; i++) {
            const dom = enemyDominators[i]!;
            const d = Math.hypot(dom.x - selfPos.x, dom.y - selfPos.y);
            if (d < minDist) {
              minDist = d;
              closest = dom;
            }
          }
          destination = { x: closest.x, y: closest.y };

          // Find dominator entity in snapshot
          const domEntity = snapshot.entities.find((e) => e.id === closest.entityId);
          if (domEntity) {
            combatTarget = domEntity;
          }
        }
      }

      // Breakout
      if (!destination && config.mode === 'breakout' && snapshot.match.objectives) {
        const targetTerritories = snapshot.match.objectives.filter(
          (o) => o.kind === 'territory' && o.team !== botTeam,
        );
        if (targetTerritories.length > 0) {
          let closest = targetTerritories[0]!;
          let minDist = Math.hypot(closest.x - selfPos.x, closest.y - selfPos.y);
          for (let i = 1; i < targetTerritories.length; i++) {
            const ter = targetTerritories[i]!;
            const d = Math.hypot(ter.x - selfPos.x, ter.y - selfPos.y);
            if (d < minDist) {
              minDist = d;
              closest = ter;
            }
          }
          destination = { x: closest.x, y: closest.y };
        }
      }
    }

    // 7. Enemy selection for standard combat & farming
    if (!combatTarget) {
      // Prioritize enemy tanks
      if (enemies.length > 0) {
        let bestEnemy = enemies[0]!;
        let bestDist = Math.hypot(bestEnemy.x - selfPos.x, bestEnemy.y - selfPos.y);
        for (let i = 1; i < enemies.length; i++) {
          const enemy = enemies[i]!;
          const d = Math.hypot(enemy.x - selfPos.x, enemy.y - selfPos.y);
          if (d < bestDist) {
            bestDist = d;
            bestEnemy = enemy;
          }
        }
        combatTarget = bestEnemy;
        if (!destination) {
          destination = { x: bestEnemy.x, y: bestEnemy.y };
        }
      } else if (shapes.length > 0) {
        // Farm nearest shape
        let bestShape = shapes[0]!;
        let bestDist = Math.hypot(bestShape.x - selfPos.x, bestShape.y - selfPos.y);
        for (let i = 1; i < shapes.length; i++) {
          const shape = shapes[i]!;
          const d = Math.hypot(shape.x - selfPos.x, shape.y - selfPos.y);
          if (d < bestDist) {
            bestDist = d;
            bestShape = shape;
          }
        }
        combatTarget = bestShape;
        if (!destination) {
          destination = { x: bestShape.x, y: bestShape.y };
        }
      }
    }

    // 8. Wander fallback
    if (!destination) {
      if (
        !this.wanderTarget ||
        snapshot.tick >= this.wanderExpiresTick ||
        Math.hypot(this.wanderTarget.x - selfPos.x, this.wanderTarget.y - selfPos.y) < 80
      ) {
        const margin = 250;
        this.wanderTarget = {
          x: this.rng.range(margin, config.arena.width - margin),
          y: this.rng.range(margin, config.arena.height - margin),
        };
        this.wanderExpiresTick = snapshot.tick + this.rng.int(100, 240);
      }
      destination = this.wanderTarget;
    }

    // 9. Aiming & Firing
    if (combatTarget) {
      const targetDist = Math.hypot(combatTarget.x - selfPos.x, combatTarget.y - selfPos.y);
      const bulletSpeed = 500;
      const leadTime = targetDist / bulletSpeed;
      const leadX = combatTarget.x + combatTarget.vx * leadTime;
      const leadY = combatTarget.y + combatTarget.vy * leadTime;

      const baseAimAngle = Math.atan2(leadY - selfPos.y, leadX - selfPos.x);
      const dispersion = this.rng.range(-this.profile.dispersionMax, this.profile.dispersionMax);
      const targetAimAngle = baseAimAngle + dispersion;

      // Angle smoothing
      let diff = targetAimAngle - this.aimAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      this.aimAngle += diff * this.profile.aimSmoothing;
      this.currentAim = {
        x: Math.cos(this.aimAngle) * Math.max(100, targetDist),
        y: Math.sin(this.aimAngle) * Math.max(100, targetDist),
      };

      const aimError = Math.abs(diff);
      this.currentFire = aimError < this.profile.fireAngleThreshold;
    } else {
      // Aim in move direction
      if (this.currentMove.x !== 0 || this.currentMove.y !== 0) {
        this.aimAngle = Math.atan2(this.currentMove.y, this.currentMove.x);
        this.currentAim = {
          x: Math.cos(this.aimAngle) * 200,
          y: Math.sin(this.aimAngle) * 200,
        };
      }
      this.currentFire = false;
    }

    // 10. Navigation & Movement
    this.navigate(selfTank, destination, obstacles, navGrid, config);
  }

  private navigate(
    selfTank: TankState,
    destination: Vec2,
    obstacles: readonly Rect[],
    navGrid: NavGrid,
    config: ModeConfig,
  ): void {
    const distToDest = Math.hypot(destination.x - selfTank.x, destination.y - selfTank.y);

    // If destination changed significantly, recompute path
    const destChanged =
      !this.currentDestination ||
      Math.hypot(
        destination.x - this.currentDestination.x,
        destination.y - this.currentDestination.y,
      ) > 80;

    if (destChanged || this.waypoints.length === 0) {
      this.currentDestination = destination;
      if (distToDest > 200 && obstacles.length > 0) {
        this.waypoints = navGrid.findWaypoints({ x: selfTank.x, y: selfTank.y }, destination);
      } else {
        this.waypoints = [destination];
      }
    }

    // Advance waypoints if close
    while (this.waypoints.length > 1) {
      const nextWp = this.waypoints[0]!;
      if (Math.hypot(nextWp.x - selfTank.x, nextWp.y - selfTank.y) < 70) {
        this.waypoints.shift();
      } else {
        break;
      }
    }

    const currentWp = this.waypoints[0] ?? destination;
    this.currentMove = steerAroundObstacles(
      { x: selfTank.x, y: selfTank.y, radius: selfTank.radius },
      currentWp,
      obstacles,
      config.arena,
    );
  }

  private handleUpgrades(
    snapshot: SnapshotPayload,
    queueCommand: (command: PlayerCommand) => void,
  ): void {
    // Stat upgrades
    let points = snapshot.self.statPoints;
    if (points > 0) {
      for (const stat of this.build.statOrder) {
        const cur = snapshot.self.stats[stat];
        const cap = snapshot.self.statCaps[stat];
        if (cur < cap) {
          queueCommand({ type: 'upgradeStat', stat });
          points--;
          if (points <= 0) break;
        }
      }
    }

    // Class upgrade
    if (snapshot.self.classChoices && snapshot.self.classChoices.length > 0) {
      const choices = snapshot.self.classChoices;
      for (const pref of this.build.preferredClasses) {
        if (choices.includes(pref)) {
          queueCommand({ type: 'chooseClass', classId: pref });
          break;
        }
      }
    }
  }
}

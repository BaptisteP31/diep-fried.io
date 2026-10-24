import {
  CLASSIC_BOSSES,
  CLASS_DEFINITIONS,
  DEFAULT_STAT_CAP,
  NEUTRAL_TEAM,
  STARTING_CLASS,
  STAT_IDS,
  emptyStatLevels,
  getClassDefinition,
  getSpecialClassDefinition,
  isStatId,
  type BarrelDefinition,
  type ClassDefinition,
  type ClassId,
  type EntityState,
  type PlayerCommand,
  type PlayerId,
  type PlayerInput,
  type MapZone,
  type MatchPhase,
  type MatchResult,
  type MatchState,
  type ObjectiveSite,
  type ObjectiveState,
  type Rect,
  type SpecialClassDefinition,
  type TeamId,
  type ProjectileFamily,
  type ProjectileState,
  type ShapeState,
  type SnapshotPayload,
  type StatLevels,
  type TankState,
} from '@diep-fried/shared';
import {
  AI_BALANCE as AI,
  BALANCE as B,
  OBJECTIVE_BALANCE as O,
  SHAPE_BALANCE,
  pointsForLevel,
  scoreForLevel,
} from './balance';
import { MODE_RULES, type ModeContext } from './modes';
import {
  defaultObjectiveSites,
  dropFlag,
  safeZoneRadius,
  stepFlags,
  stepTerritory,
  type FlagRuntime,
  type TerritoryRuntime,
} from './objectives';
import { Rng } from './rng';
import { circleVsWall, circleVsWalls, resolveCircleVsWall, sweepCircleVsWalls } from './maps';
import { collisionCandidates, contactTime } from './spatial';
import type {
  PlayerProfile,
  SimEvent,
  Simulation,
  SimulationFactory,
  SimulationOptions,
} from './simulation';

interface Motion {
  prevX: number;
  prevY: number;
  lastDamageTick: number;
}
interface Tank extends TankState, Motion {
  nextShots: number[];
  activeBarrels: boolean[];
  idleSince: number;
  protectedUntil: number;
  /** Présent pour les tanks IA (`playerId === null`). */
  ai?: Ai;
}
interface Projectile extends ProjectileState, Motion {
  health: number;
  maxHealth: number;
  damage: number;
  ownerPlayerId: PlayerId;
  ownerName: string;
  expires: number;
  hits: Set<number>;
  nextHits: Map<number, number>;
  autonomous: boolean;
  cruiseSpeed: number;
  secondaryActive: boolean;
  nextSecondary: number;
  missile: BarrelDefinition['missile'];
  /** Drones autoritaires de base : aucun joueur, aucune récompense. */
  base?: MapZone;
}
interface Shape extends ShapeState, Motion {
  reward: number;
  spin: number;
  /** Vitesse de dérive propre ; l'excédent reçu d'une poussée s'amortit. */
  drift: number;
  /** Dégâts de contact par seconde. */
  contact: number;
}
type Body = Tank | Projectile | Shape;
interface Player {
  name: string;
  team: number;
  input: PlayerInput | null;
  receivedSeq: number;
  appliedSeq: number;
  tank: Tank | null;
  initialSpawn: boolean;
  respawnTick: number | null;
  score: number;
  level: number;
  classId: ClassId;
  stats: StatLevels;
  spent: number;
  god: boolean;
  x: number;
  y: number;
  /** Survival : éliminé ou arrivé en cours de round. */
  spectator: boolean;
  /** Entité IA pilotée par `possess` ; le tank du joueur est alors garé hors du monde. */
  possessing: Ai | null;
  parked: Tank | null;
}
interface Attacker {
  playerId: PlayerId | null;
  name: string;
  team: TeamId;
}
/**
 * Entité IA : un tank ordinaire de classe spéciale, piloté par une fiche joueur synthétique
 * (stats, intention) hors de `players`. Ses projectiles portent la clé négative `key`.
 */
interface Ai {
  key: number;
  def: SpecialClassDefinition;
  pilot: Player;
  tank: Tank;
  /** Point fixe (Dominator) ou d'ancrage (Mothership). */
  anchor: { x: number; y: number } | null;
  objective: Objective | null;
  possessedBy: PlayerId | null;
  /** Mémoire bornée : une cible, sa dernière position vue, un point d'errance. */
  targetId: number | null;
  lastSeen: number;
  lastX: number;
  lastY: number;
  wanderX: number;
  wanderY: number;
  nextWander: number;
}
interface Objective {
  id: number;
  site: ObjectiveSite;
  team: TeamId;
  ai: Ai | null;
  flag: FlagRuntime | null;
  territory: TerritoryRuntime | null;
}
interface Match {
  phase: MatchPhase;
  round: number;
  phaseTick: number;
  endTick: number | null;
  result: MatchResult | null;
  scores: Map<TeamId, number>;
  objectives: Objective[];
  pointClock: number;
}

export const createSimulation: SimulationFactory = (options) => new World(options);

class World implements Simulation {
  readonly config;
  private currentTick = 0;
  private nextId = 1;
  private readonly rng: Rng;
  private readonly players = new Map<PlayerId, Player>();
  private readonly bodies = new Map<number, Body>();
  private readonly projectileCounts = new Map<number, Record<ProjectileFamily, number>>();
  private readonly obstacleCache = new Map<number, Rect[]>();
  private readonly teamSizes = new Map<number, number>();
  private commands: { playerId: PlayerId; command: PlayerCommand }[] = [];
  private events: SimEvent[] = [];
  /** Flux séparé (nid, variantes rares, IA, boss) : la séquence historique de `rng` est intacte. */
  private readonly aux: Rng;
  private readonly ais = new Map<number, Ai>();
  private readonly match: Match | null;
  private defendersReady = false;
  private objectivesReady = false;
  private nextBossTick: number;
  private bossRotation = 0;

  constructor({ config, seed }: SimulationOptions) {
    // La configuration d'un salon et les objets des snapshots ne sont jamais partagés.
    this.config = JSON.parse(JSON.stringify(config)) as typeof config;
    this.rng = new Rng(seed);
    this.aux = new Rng((seed ^ 0x5bd1e995) >>> 0);
    this.match =
      MODE_RULES[this.config.mode].objective && this.config.match
        ? {
            phase: 'waiting',
            round: 0,
            phaseTick: 0,
            endTick: null,
            result: null,
            scores: new Map(),
            objectives: [],
            pointClock: 0,
          }
        : null;
    this.nextBossTick = this.config.bosses?.enabled ? this.config.bosses.firstSpawnTicks : Infinity;
  }

  get tick(): number {
    return this.currentTick;
  }

  private get context(): ModeContext {
    return { config: this.config, rng: this.rng, tick: this.tick, teamSizes: this.teamSizes };
  }

  private get rule() {
    return MODE_RULES[this.config.mode].objective;
  }

  /** Clé de propriétaire des projectiles : identifiant joueur, ou clé négative d'une IA. */
  private ownerKey(tank: Tank): number {
    return tank.ai ? tank.ai.key : tank.playerId!;
  }

  /** Fiche pilote (joueur humain ou IA) d'une clé de propriétaire. */
  private pilotOf(key: number): Player | undefined {
    return key >= 0 ? this.players.get(key) : this.ais.get(key)?.pilot;
  }

  private pilotOfTank(tank: Tank): Player {
    return tank.ai ? tank.ai.pilot : this.players.get(tank.playerId!)!;
  }

  /** Joueur crédité des XP : propriétaire humain, ou pilote humain d'une IA possédée. */
  private credit(key: number): PlayerId | null {
    return key >= 0 ? key : (this.ais.get(key)?.possessedBy ?? null);
  }

  /** Objectifs IA invulnérables et inactifs hors phase `playing` (attente, podium). */
  private aiShielded(ai: Ai): boolean {
    return ai.def.role !== 'boss' && this.match !== null && this.match.phase !== 'playing';
  }

  private isDeclaredTeam(team: TeamId): boolean {
    return this.config.teams.some((definition) => definition.id === team);
  }

  private definition(player: Player): ClassDefinition {
    return getClassDefinition(player.classId)!;
  }

  private caps(player: Player): StatLevels {
    const caps = emptyStatLevels();
    for (const stat of STAT_IDS)
      caps[stat] = this.definition(player).statCaps?.[stat] ?? DEFAULT_STAT_CAP;
    return caps;
  }

  private choices(player: Player): ClassId[] {
    return this.definition(player).upgradesTo.filter((id) => {
      const definition = getClassDefinition(id);
      return definition !== undefined && definition.level <= player.level;
    });
  }

  private levelForScore(score: number): number {
    let level = 1;
    while (level < this.config.progression.maxLevel && score >= scoreForLevel(level + 1)) level++;
    return level;
  }

  addPlayer(playerId: PlayerId, { name }: PlayerProfile): void {
    if (this.players.has(playerId)) return;
    // Un join ne ressuscite pas un camp vide de Tag pendant le round.
    let context = this.context;
    if (this.rule === 'conversion' && this.match?.phase === 'playing') {
      const active = this.config.teams.filter((team) => (this.teamSizes.get(team.id) ?? 0) > 0);
      if (active.length) context = { ...context, config: { ...this.config, teams: active } };
    }
    const level = Math.max(
      1,
      Math.min(this.config.progression.maxLevel, this.config.progression.startLevel),
    );
    this.players.set(playerId, {
      name,
      team: MODE_RULES[this.config.mode].assignTeam(context, playerId),
      input: null,
      receivedSeq: 0,
      appliedSeq: 0,
      tank: null,
      initialSpawn: true,
      respawnTick: null,
      score: scoreForLevel(level),
      level,
      classId: STARTING_CLASS,
      stats: emptyStatLevels(),
      spent: 0,
      god: false,
      x: this.config.arena.width / 2,
      y: this.config.arena.height / 2,
      spectator: false,
      possessing: null,
      parked: null,
    });
    const player = this.players.get(playerId)!;
    const team = player.team;
    this.teamSizes.set(team, (this.teamSizes.get(team) ?? 0) + 1);
    // Survival : un arrivant en cours de round regarde jusqu'au round suivant.
    if (this.rule === 'survival' && this.match?.phase === 'playing') {
      player.spectator = true;
      player.initialSpawn = false;
    }
  }

  removePlayer(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    if (player?.possessing) this.release(player.possessing);
    if (player?.tank) {
      this.dropCarriedFlag(playerId, player.tank);
      this.removeBody(player.tank);
    }
    if (player) {
      const remaining = (this.teamSizes.get(player.team) ?? 1) - 1;
      if (remaining > 0) this.teamSizes.set(player.team, remaining);
      else this.teamSizes.delete(player.team);
      this.obstacleCache.delete(player.team);
    }
    this.players.delete(playerId);
    for (const body of this.bodies.values()) {
      if (body.kind === 'projectile' && body.ownerPlayerId === playerId) this.removeBody(body);
    }
    this.commands = this.commands.filter((entry) => entry.playerId !== playerId);
  }

  setInput(playerId: PlayerId, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player || input.seq <= player.receivedSeq) return;
    player.receivedSeq = input.seq;
    player.input = { ...input, move: { ...input.move }, aim: { ...input.aim } };
  }

  queueCommand(playerId: PlayerId, command: PlayerCommand): void {
    if (this.players.has(playerId)) this.commands.push({ playerId, command: { ...command } });
  }

  private maxHealth(player: Player): number {
    return (
      (B.health +
        (player.level - 1) * B.healthPerLevel +
        player.stats.maxHealth * B.healthPerStat) *
      (this.definition(player).bodyHealth ?? 1)
    );
  }

  private syncTank(player: Player): void {
    const tank = player.tank;
    if (!tank || tank.health <= 0) return;
    const maxHealth = this.maxHealth(player);
    tank.health = Math.max(1, tank.health + maxHealth - tank.maxHealth);
    tank.maxHealth = maxHealth;
    tank.level = player.level;
    tank.score = player.score;
    tank.classId = player.classId;
  }

  private reward(playerId: PlayerId | null, score: number): void {
    if (playerId === null) return;
    const player = this.players.get(playerId);
    if (!player) return;
    player.score += score;
    const level = this.levelForScore(player.score);
    while (player.level < level) {
      player.level++;
      this.events.push({ type: 'levelUp', playerId, level: player.level });
    }
    this.syncTank(player);
  }

  private spawn(playerId: PlayerId, player: Player, respawn: boolean): void {
    const radius = Math.min(
      B.tankRadius,
      this.config.arena.width / 2,
      this.config.arena.height / 2,
    );
    const at = this.spawnPoint(radius, player.team);
    if (!at) return;
    if (respawn) {
      player.god = false;
      player.score = Math.floor(player.score * this.config.progression.scoreKeptOnDeath);
      player.level = this.levelForScore(player.score);
      player.classId = STARTING_CLASS;
      player.stats = emptyStatLevels();
      player.spent = 0;
      player.input = null;
    }
    const definition = this.definition(player);
    const tank: Tank = {
      kind: 'tank',
      id: this.nextId++,
      playerId,
      name: player.name,
      team: player.team,
      ...at,
      prevX: at.x,
      prevY: at.y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius,
      classId: player.classId,
      level: player.level,
      score: player.score,
      health: this.maxHealth(player),
      maxHealth: this.maxHealth(player),
      opacity: 1,
      barrelShots: definition.barrels.map(() => -1),
      nextShots: definition.barrels.map(() => 0),
      activeBarrels: definition.barrels.map(() => false),
      idleSince: this.tick,
      barrelAngles: definition.barrels.map((b) => b.angle),
      protectedUntil: this.tick + Math.ceil(B.spawnProtection * this.config.tickRate),
      spawnProtected: true,
      lastDamageTick: this.tick,
    };
    player.tank = tank;
    player.initialSpawn = false;
    player.respawnTick = null;
    player.x = at.x;
    player.y = at.y;
    this.bodies.set(tank.id, tank);
    this.events.push({ type: 'spawn', playerId });
  }

  /** Les murs et bases sont exclus sans exception, même si l'arène est saturée. */
  private spawnPoint(radius: number, team: number): { x: number; y: number } | undefined {
    let best: { x: number; y: number } | undefined;
    let bestGap = -Infinity;
    const blocked = this.obstacles(team);
    const consider = (at: { x: number; y: number }): boolean => {
      if (circleVsWalls(at.x, at.y, radius, blocked)) return false;
      let gap = Infinity;
      for (const body of this.bodies.values()) {
        if (body.kind === 'projectile') continue;
        gap = Math.min(gap, Math.hypot(at.x - body.x, at.y - body.y) - radius - body.radius);
      }
      if (gap >= 0 && gap > bestGap) {
        best = at;
        bestGap = gap;
      }
      return gap >= 100;
    };
    for (let attempt = 0; attempt < 128; attempt++) {
      const at = MODE_RULES[this.config.mode].spawnPoint(this.context, team, radius);
      if (consider(at)) return at;
      if (attempt === 31 && best) return best;
    }
    if (best) return best;
    // Repli déterministe dans la zone d'apparition, jamais sur un mur.
    const area = this.config.map.zones.find((z) => z.kind === 'spawn' && z.team === team)?.area ?? {
      x: 0,
      y: 0,
      ...this.config.arena,
    };
    const stride = Math.max(8, radius);
    for (let y = area.y + radius; y <= area.y + area.height - radius; y += stride)
      for (let x = area.x + radius; x <= area.x + area.width - radius; x += stride)
        if (consider({ x, y })) return best;
    return best;
  }

  private changeClass(player: Player, classId: ClassId): void {
    player.classId = classId;
    const tank = player.tank!;
    const barrels = this.definition(player).barrels;
    tank.barrelShots = barrels.map(() => -1);
    tank.nextShots = barrels.map(() => this.tick / this.config.tickRate);
    tank.activeBarrels = barrels.map(() => false);
    tank.barrelAngles = barrels.map((b) => tank.angle + b.angle);
    delete tank.cameraOffset;
    tank.idleSince = this.tick;
    tank.opacity = 1;
    const caps = this.caps(player);
    for (const stat of STAT_IDS) {
      const refund = Math.max(0, player.stats[stat] - caps[stat]);
      player.stats[stat] -= refund;
      player.spent -= refund;
    }
    this.cleanupControlled(tank.id);
    this.syncTank(player);
  }

  private sandboxCommand(playerId: PlayerId, player: Player, action: string): void {
    if (!this.config.sandbox.cheats || !player.tank) return;
    switch (action) {
      case 'levelUp': {
        const level = Math.min(45, this.config.progression.maxLevel, player.level + 1);
        if (level > player.level)
          this.reward(playerId, Math.max(0, scoreForLevel(level) - player.score));
        break;
      }
      case 'cycleClass': {
        const catalog = Object.keys(CLASS_DEFINITIONS);
        this.changeClass(player, catalog[(catalog.indexOf(player.classId) + 1) % catalog.length]!);
        break;
      }
      case 'selfDestruct':
        this.destroy(player.tank, { playerId, name: player.name, team: player.team });
        break;
      case 'toggleGod':
        player.god = !player.god;
        break;
      case 'summonBoss': {
        const pool = this.bossPool();
        this.spawnBoss(pool[this.bossRotation++ % pool.length]!, player.tank);
        break;
      }
    }
  }

  private applyCommands(): void {
    const commands = this.commands;
    this.commands = [];
    for (const { playerId, command } of commands) {
      const player = this.players.get(playerId);
      if (!player) continue;
      if (command.type === 'sandbox') {
        this.sandboxCommand(playerId, player, command.action);
      } else if (command.type === 'possess') {
        this.possess(playerId, player);
      } else if (command.type === 'respawn') {
        if (
          !player.tank &&
          !player.possessing &&
          !player.spectator &&
          player.respawnTick !== null &&
          this.tick >= player.respawnTick
        ) {
          this.spawn(playerId, player, true);
        }
      } else if (player.tank && command.type === 'upgradeStat') {
        if (!isStatId(command.stat) || player.spent >= pointsForLevel(player.level)) continue;
        if (player.stats[command.stat] >= this.caps(player)[command.stat]) continue;
        player.stats[command.stat]++;
        player.spent++;
        this.syncTank(player);
      } else if (
        player.tank &&
        command.type === 'chooseClass' &&
        this.choices(player).includes(command.classId)
      ) {
        this.changeClass(player, command.classId);
      }
    }
  }

  step(): SimEvent[] {
    this.currentTick++;
    this.events = [];
    // Objectifs posés avant les premiers spawns : ceux-ci les évitent.
    if (this.match && !this.objectivesReady) this.createObjectives();
    for (const [id, player] of this.players) {
      if (player.initialSpawn && !player.spectator) this.spawn(id, player, false);
      if (player.input) player.appliedSeq = player.input.seq;
    }
    this.applyCommands();
    this.populateBaseDefenders();
    this.updateBosses();
    const dt = 1 / this.config.tickRate;
    for (const ai of this.ais.values()) this.think(ai);
    for (const player of this.players.values()) this.prepareTank(player, dt);
    for (const ai of this.ais.values()) this.prepareTank(ai.pilot, dt);
    this.prepareProjectiles(dt);
    const decay = Math.exp(-B.friction * dt);
    for (const body of this.bodies.values()) {
      if (body.kind === 'projectile' && body.expires <= this.tick) this.expireProjectile(body);
      else if (body.kind === 'shape') {
        // Sans frottement, une forme poussée garderait indéfiniment la vitesse d'un tank.
        const speed = Math.hypot(body.vx, body.vy);
        if (speed > body.drift) {
          const scale = (body.drift + (speed - body.drift) * decay) / speed;
          body.vx *= scale;
          body.vy *= scale;
        }
      }
    }
    this.prepareCrashers();
    // Les corps lents sont sous-échantillonnés à <= 8 unités ; les balles sont balayées
    // sans limite de vitesse. La borne évite un coût non borné sur une config aberrante.
    let maxTravel = 0;
    for (const body of this.bodies.values()) {
      if (body.kind !== 'projectile')
        maxTravel = Math.max(maxTravel, Math.hypot(body.vx, body.vy) * dt);
    }
    const substeps = Math.min(32, Math.max(1, Math.ceil(maxTravel / B.bodyStepDistance)));
    for (let i = 0; i < substeps; i++) this.integrate(dt / substeps);
    for (const player of this.players.values()) {
      const tank = player.tank;
      if (!tank) continue;
      if (this.tick - tank.lastDamageTick >= B.regenDelay * this.config.tickRate) {
        tank.health = Math.min(
          tank.maxHealth,
          tank.health + (B.regen + player.stats.healthRegen * B.regenPerStat) * dt,
        );
      }
      player.x = tank.x;
      player.y = tank.y;
    }
    for (const ai of this.ais.values()) {
      const tank = ai.tank;
      if (ai.def.role === 'dominator' && ai.anchor) {
        // Forteresse fixe : ni recul, ni poussée.
        tank.x = ai.anchor.x;
        tank.y = ai.anchor.y;
        tank.vx = 0;
        tank.vy = 0;
      }
      if (this.tick - tank.lastDamageTick >= B.regenDelay * this.config.tickRate)
        tank.health = Math.min(
          tank.maxHealth,
          tank.health + (B.regen + ai.pilot.stats.healthRegen * B.regenPerStat) * dt,
        );
      if (ai.possessedBy !== null) {
        const pilot = this.players.get(ai.possessedBy);
        if (pilot) {
          pilot.x = tank.x;
          pilot.y = tank.y;
        }
      }
    }
    this.updateMatch(dt);
    this.populateShapes();
    return this.events;
  }

  private prepareTank(player: Player, dt: number): void {
    const tank = player.tank;
    if (!tank) return;
    const input = player.input;
    const definition = this.definition(player);
    // Sanctuaire de base pour les joueurs ; objectifs IA protégés hors phase de jeu.
    const shielded = player.god || (tank.ai ? this.aiShielded(tank.ai) : this.inOwnBase(tank));
    tank.spawnProtected = this.tick < tank.protectedUntil || shielded;
    if (tank.ai && this.aiShielded(tank.ai)) {
      tank.vx = tank.vy = 0;
      tank.activeBarrels.fill(false);
      return;
    }
    if (input && (input.aim.x !== 0 || input.aim.y !== 0))
      tank.angle = Math.atan2(input.aim.y, input.aim.x);
    const move = input?.move ?? { x: 0, y: 0 };
    const norm = Math.max(1, Math.hypot(move.x, move.y));
    const speed = B.speed * definition.speed * (1 + player.stats.movementSpeed * B.speedPerStat);
    // Solution exacte du frottement visqueux : vitesse cible et accélération cohérentes à tout tickRate.
    const decay = Math.exp(-B.friction * dt);
    tank.vx = tank.vx * decay + ((speed * move.x) / norm) * (1 - decay);
    tank.vy = tank.vy * decay + ((speed * move.y) / norm) * (1 - decay);
    if (Math.hypot(tank.vx, tank.vy) < B.stopSpeed) {
      tank.vx = 0;
      tank.vy = 0;
    }
    const now = this.tick / this.config.tickRate;
    if (input?.fire || input?.alt) {
      tank.spawnProtected = shielded;
      tank.protectedUntil = this.tick;
    }
    let manualShot = false;
    definition.barrels.forEach((barrel, index) => {
      const controlled = barrel.projectile === 'drone' || barrel.projectile === 'minion';
      const target = barrel.auto ? this.nearestTarget(tank, B.autoRange) : undefined;
      const active =
        !barrel.conversionOnly &&
        (barrel.auto ? target !== undefined : controlled || !!input?.fire);
      const angle = target
        ? Math.atan2(target.y - tank.y, target.x - tank.x)
        : tank.angle + barrel.angle;
      tank.barrelAngles![index] = angle;
      const period = B.reload * barrel.reload * B.reloadPerStat ** player.stats.reload;
      if (
        this.shotDue(tank.nextShots, tank.activeBarrels, index, active, barrel.delay, period, now)
      ) {
        if (this.launch(tank, player, barrel, angle)) {
          tank.barrelShots[index] = this.tick;
          if (!controlled) {
            tank.spawnProtected = shielded;
            tank.protectedUntil = this.tick;
            if (!barrel.auto) manualShot = true;
          }
        }
      }
    });
    if (definition.stealth) {
      if (
        Math.hypot(tank.vx, tank.vy) > 0.5 ||
        move.x ||
        move.y ||
        manualShot ||
        tank.lastDamageTick === this.tick - 1
      )
        tank.idleSince = this.tick;
      const idle = (this.tick - tank.idleSince) / this.config.tickRate;
      tank.opacity = Math.max(
        0,
        Math.min(1, 1 - (idle - definition.stealth.delay) / definition.stealth.fade),
      );
    }
    if (definition.altCameraDistance !== undefined) {
      const distance = input?.alt ? definition.altCameraDistance : 0;
      tank.cameraOffset = {
        x: Math.cos(tank.angle) * distance,
        y: Math.sin(tank.angle) * distance,
      };
    }
  }

  /** Échéances en secondes, indépendantes du tick : même alternance que les armes simples. */
  private shotDue(
    next: number[],
    active: boolean[],
    index: number,
    firing: boolean,
    delay: number,
    period: number,
    now: number,
  ): boolean {
    if (!firing) {
      active[index] = false;
      return false;
    }
    if (!active[index]) next[index] = Math.max(next[index] ?? now, now + delay * period);
    active[index] = true;
    if (now + 1e-9 < next[index]!) return false;
    next[index] = Math.max(next[index]! + period, now);
    return true;
  }

  private droneLimit(player: Player): number {
    const def = this.definition(player);
    return (def.droneLimit ?? 0) + (def.dronesPerReload ?? 0) * player.stats.reload;
  }

  private controlled(body: Projectile): boolean {
    return body.family === 'drone' || body.family === 'minion';
  }

  private removeBody(body: Body): void {
    if (!this.bodies.delete(body.id) || body.kind !== 'projectile') return;
    const counts = this.projectileCounts.get(body.ownerPlayerId)!;
    counts[body.family]--;
    if (Object.values(counts).every((count) => count === 0))
      this.projectileCounts.delete(body.ownerPlayerId);
  }

  private cleanupControlled(ownerId: number): void {
    for (const body of this.bodies.values())
      if (body.kind === 'projectile' && body.ownerId === ownerId && this.controlled(body))
        this.removeBody(body);
  }

  private canLaunch(ownerPlayerId: PlayerId, family: ProjectileFamily, player: Player): boolean {
    const counts = this.projectileCounts.get(ownerPlayerId);
    if (!counts) return true;
    if (Object.values(counts).reduce((a, b) => a + b, 0) >= B.projectilesPerOwner) return false;
    if (family === 'drone' || family === 'minion')
      return counts.drone + counts.minion < this.droneLimit(player);
    return (
      counts[family] <
      (family === 'trap'
        ? B.trapsPerOwner
        : family === 'missile'
          ? B.missilesPerOwner
          : B.projectilesPerOwner)
    );
  }

  private addProjectile(body: Projectile): void {
    let counts = this.projectileCounts.get(body.ownerPlayerId);
    if (!counts) {
      counts = { bullet: 0, drone: 0, minion: 0, trap: 0, missile: 0 };
      this.projectileCounts.set(body.ownerPlayerId, counts);
    }
    counts[body.family]++;
    this.bodies.set(body.id, body);
  }

  private launch(
    source: Tank | Projectile,
    player: Player,
    barrel: BarrelDefinition,
    angle: number,
  ): boolean {
    const ownerId = source.kind === 'tank' ? source.id : source.ownerId;
    const ownerPlayerId = source.kind === 'tank' ? this.ownerKey(source) : source.ownerPlayerId;
    let fired = false;
    for (let pellet = 0; pellet < (barrel.pellets ?? 1); pellet++) {
      if (!this.canLaunch(ownerPlayerId, barrel.projectile, player)) break;
      const shotAngle = angle + this.rng.range(-barrel.spread, barrel.spread);
      const speed =
        B.bulletSpeed * (1 + B.bulletSpeedPerStat * player.stats.bulletSpeed) * barrel.speed;
      const x =
        source.x +
        source.radius * (Math.cos(angle) * barrel.length - Math.sin(angle) * barrel.offset);
      const y =
        source.y +
        source.radius * (Math.sin(angle) * barrel.length + Math.cos(angle) * barrel.offset);
      const health =
        (B.bulletHealth + B.bulletHealthPerStat * player.stats.bulletPenetration) *
        barrel.penetration;
      const persistent = barrel.projectile === 'drone' || barrel.projectile === 'minion';
      const body: Projectile = {
        kind: 'projectile',
        family: barrel.projectile,
        id: this.nextId++,
        team: source.team,
        ownerId,
        ownerPlayerId,
        ownerName: source.kind === 'tank' ? source.name : source.ownerName,
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(shotAngle) * speed,
        vy: Math.sin(shotAngle) * speed,
        angle: shotAngle,
        radius: barrel.radius ?? B.bulletRadius * Math.sqrt(barrel.width / 0.84),
        health,
        maxHealth: health,
        damage:
          (B.bulletDamage + B.bulletDamagePerStat * player.stats.bulletDamage) * barrel.damage,
        expires:
          this.tick +
          Math.ceil(
            (barrel.lifetime ?? (persistent ? B.droneLifetime : B.bulletLifetime)) *
              this.config.tickRate,
          ),
        hits: new Set(),
        nextHits: new Map(),
        lastDamageTick: this.tick,
        secondaryActive: false,
        autonomous: barrel.autonomous ?? false,
        cruiseSpeed: speed,
        missile: barrel.missile,
        nextSecondary: this.tick / this.config.tickRate + B.secondaryReload,
        ...(barrel.projectile !== 'bullet'
          ? {
              bodyShape:
                barrel.bodyShape ??
                (barrel.projectile === 'drone' || barrel.projectile === 'trap'
                  ? ('triangle' as const)
                  : barrel.projectile === 'minion'
                    ? ('square' as const)
                    : ('circle' as const)),
              classId:
                source.kind === 'projectile' ? (source.classId ?? player.classId) : player.classId,
            }
          : {}),
        ...(barrel.projectile === 'missile' || barrel.projectile === 'minion'
          ? { barrelShots: [-1, -1] }
          : {}),
      };
      const mouth = sweepCircleVsWalls(
        source.x,
        source.y,
        x,
        y,
        body.radius,
        this.obstacles(body.team),
      );
      if (mouth.hit) {
        body.x = mouth.contactX + mouth.normalX * 1e-6;
        body.y = mouth.contactY + mouth.normalY * 1e-6;
        body.prevX = body.x;
        body.prevY = body.y;
      }
      if (persistent) this.bound(body);
      if (!this.outside(body)) {
        this.addProjectile(body);
        fired = true;
      }
    }
    if (fired) {
      source.vx -= Math.cos(angle) * B.recoil * barrel.recoil;
      source.vy -= Math.sin(angle) * B.recoil * barrel.recoil;
    }
    return fired;
  }

  private nearestTarget(source: Tank | Projectile, range: number): Tank | Shape | undefined {
    let best: Tank | Shape | undefined;
    let distance = range * range;
    for (const body of this.bodies.values()) {
      if (body.kind === 'projectile' || !this.canDamage(source, body)) continue;
      if (body.kind === 'tank' && body.opacity < 0.15) continue;
      if (!this.lineOfSight(source, body)) continue;
      const d = (body.x - source.x) ** 2 + (body.y - source.y) ** 2;
      if (d < distance || (d === distance && body.id < (best?.id ?? Infinity))) {
        best = body;
        distance = d;
      }
    }
    return best;
  }

  private prepareProjectiles(dt: number): void {
    // Copie : les tirs secondaires créés ici ne peuvent pas se reproduire dans le même tick.
    for (const body of [...this.bodies.values()]) {
      if (body.kind !== 'projectile' || body.expires <= this.tick) continue;
      for (const [id, deadline] of body.nextHits)
        if (deadline <= this.tick) body.nextHits.delete(id);
      if (body.base) {
        this.prepareBaseDefender(body, dt);
        continue;
      }
      const player = this.pilotOf(body.ownerPlayerId);
      if (!player) {
        this.removeBody(body);
        continue;
      }
      if (this.controlled(body)) {
        const owner = player.tank;
        if (!owner || owner.id !== body.ownerId) {
          this.removeBody(body);
          continue;
        }
        const input = player.input;
        const target = this.nearestTarget(body, B.autoRange);
        const orbit = body.id * 2.399963229728653;
        let x = owner.x + Math.cos(orbit) * B.droneOrbit;
        let y = owner.y + Math.sin(orbit) * B.droneOrbit;
        if (!body.autonomous && (input?.fire || input?.alt)) {
          x = owner.x + input.aim.x;
          y = owner.y + input.aim.y;
          if (input.alt) {
            const dx = body.x === x && body.y === y ? Math.cos(orbit) : body.x - x;
            const dy = body.x === x && body.y === y ? Math.sin(orbit) : body.y - y;
            const length = Math.hypot(dx, dy) || 1;
            x = body.x + (dx / length) * B.droneLeash;
            y = body.y + (dy / length) * B.droneLeash;
          }
        } else if (target) {
          x = target.x;
          y = target.y;
        }
        // La portée de contrôle est bornée, même si aim vient d'un appelant sans codec.
        const dxOwner = x - owner.x;
        const dyOwner = y - owner.y;
        const leash = Math.max(1, Math.hypot(dxOwner, dyOwner) / B.droneLeash);
        x = owner.x + dxOwner / leash;
        y = owner.y + dyOwner / leash;
        const dx = x - body.x;
        const dy = y - body.y;
        const distance = Math.hypot(dx, dy);
        const speed = Math.min(body.cruiseSpeed, distance * B.droneSteering);
        const decay = Math.exp(-B.droneSteering * dt);
        body.vx = body.vx * decay + (dx / (distance || 1)) * speed * (1 - decay);
        body.vy = body.vy * decay + (dy / (distance || 1)) * speed * (1 - decay);
        if (distance > 1) body.angle = Math.atan2(dy, dx);
        if (body.family === 'minion') {
          const firing = target ?? (input?.fire && !input.alt ? { x, y } : undefined);
          if (firing && !this.protectedDrone(body)) {
            body.angle = Math.atan2(firing.y - body.y, firing.x - body.x);
            this.secondary(body, player, body.angle, [0]);
          } else body.secondaryActive = false;
        }
      } else if (body.family === 'trap') {
        const decay = Math.exp(-B.trapFriction * dt);
        body.vx *= decay;
        body.vy *= decay;
      } else if (body.family === 'missile') {
        if (body.missile === 'glider') {
          body.angle += B.gliderTurn * dt;
          body.vx = Math.cos(body.angle) * body.cruiseSpeed;
          body.vy = Math.sin(body.angle) * body.cruiseSpeed;
        } else if (body.missile === 'rocketeer') {
          const speed = Math.min(
            body.cruiseSpeed * 2.5,
            Math.hypot(body.vx, body.vy) + B.missileAcceleration * dt,
          );
          body.vx = Math.cos(body.angle) * speed;
          body.vy = Math.sin(body.angle) * speed;
        }
        if (body.missile !== 'firework')
          this.secondary(
            body,
            player,
            body.angle,
            body.missile === 'skimmer' ? [Math.PI - 0.55, Math.PI + 0.55] : [Math.PI],
          );
      }
    }
  }

  private secondary(body: Projectile, player: Player, angle: number, offsets: number[]): void {
    const now = this.tick / this.config.tickRate;
    if (!body.secondaryActive) body.nextSecondary = Math.max(now, body.nextSecondary);
    body.secondaryActive = true;
    if (now + 1e-9 < body.nextSecondary) return;
    body.nextSecondary = Math.max(
      now,
      body.nextSecondary + B.secondaryReload * B.reloadPerStat ** player.stats.reload,
    );
    offsets.forEach((offset, index) => {
      if (this.launch(body, player, B.secondaryBarrel, angle + offset))
        body.barrelShots![index] = this.tick;
    });
  }

  private expireProjectile(body: Projectile): void {
    this.removeBody(body);
    if (body.missile !== 'firework') return;
    const player = this.pilotOf(body.ownerPlayerId);
    if (!player) return;
    for (let i = 0; i < B.fireworkFragments; i++)
      this.launch(body, player, B.fragmentBarrel, (i * Math.PI * 2) / B.fireworkFragments);
  }

  /** Conversion atomique : un carré donne exactement un drone et une récompense. */
  private convertSquare(source: Tank | Projectile, target: Body): boolean {
    if (target.kind !== 'shape' || target.shape !== 'square' || !this.canDamage(source, target))
      return false;
    const playerId = source.kind === 'tank' ? this.ownerKey(source) : source.ownerPlayerId;
    const player = this.pilotOf(playerId);
    if (!player?.tank || player.classId !== 'necromancer') return false;
    const owner = player.tank;
    if (source.kind === 'projectile' && (source.ownerId !== owner.id || source.family !== 'drone'))
      return false;
    if (!this.canLaunch(playerId, 'drone', player)) return false;
    this.removeBody(target);
    const barrel = this.definition(player).barrels[0]!;
    const health =
      (B.bulletHealth + B.bulletHealthPerStat * player.stats.bulletPenetration) *
      barrel.penetration;
    const body: Projectile = {
      kind: 'projectile',
      family: 'drone',
      id: this.nextId++,
      ownerId: owner.id,
      ownerPlayerId: playerId,
      ownerName: player.name,
      team: owner.team,
      x: target.x,
      y: target.y,
      prevX: target.x,
      prevY: target.y,
      vx: target.vx,
      vy: target.vy,
      angle: target.angle,
      radius: target.radius,
      health,
      maxHealth: health,
      damage: (B.bulletDamage + B.bulletDamagePerStat * player.stats.bulletDamage) * barrel.damage,
      expires: this.tick + Math.ceil(B.droneLifetime * this.config.tickRate),
      hits: new Set(),
      nextHits: new Map(),
      lastDamageTick: this.tick,
      secondaryActive: false,
      autonomous: false,
      cruiseSpeed:
        B.bulletSpeed * barrel.speed * (1 + B.bulletSpeedPerStat * player.stats.bulletSpeed),
      missile: undefined,
      nextSecondary: Infinity,
      bodyShape: 'square',
      classId: 'necromancer',
    };
    this.addProjectile(body);
    this.reward(playerId, target.reward);
    return true;
  }

  private obstacles(team: number): Rect[] {
    let walls = this.obstacleCache.get(team);
    if (!walls) {
      walls = [
        ...this.config.map.walls,
        ...this.config.map.zones
          .filter((z) => z.kind === 'base' && z.team !== team)
          .map((z) => z.area),
      ];
      this.obstacleCache.set(team, walls);
    }
    return walls;
  }

  private inOwnBase(body: Body): boolean {
    return this.config.map.zones.some(
      ({ kind, team, area: a }) =>
        kind === 'base' &&
        team === body.team &&
        body.x - body.radius >= a.x &&
        body.y - body.radius >= a.y &&
        body.x + body.radius <= a.x + a.width &&
        body.y + body.radius <= a.y + a.height,
    );
  }

  private lineOfSight(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return !sweepCircleVsWalls(a.x, a.y, b.x, b.y, 0.001, this.config.map.walls).hit;
  }

  /** Mouvement balayé et glissement ; les formes rebondissent, les autres s'arrêtent sur la normale. */
  private moveSolid(body: Body, x: number, y: number): void {
    const walls = this.obstacles(body.team);
    let fromX = body.x;
    let fromY = body.y;
    let dx = x - fromX;
    let dy = y - fromY;
    for (let i = 0; i < 4; i++) {
      const hit = sweepCircleVsWalls(fromX, fromY, fromX + dx, fromY + dy, body.radius, walls);
      if (!hit.hit) {
        fromX += dx;
        fromY += dy;
        break;
      }
      fromX = hit.contactX + hit.normalX * 1e-6;
      fromY = hit.contactY + hit.normalY * 1e-6;
      const normalSpeed = body.vx * hit.normalX + body.vy * hit.normalY;
      if (normalSpeed < 0) {
        const factor = body.kind === 'shape' ? 2 : 1;
        body.vx -= factor * normalSpeed * hit.normalX;
        body.vy -= factor * normalSpeed * hit.normalY;
      }
      dx *= 1 - hit.time;
      dy *= 1 - hit.time;
      const inward = Math.min(0, dx * hit.normalX + dy * hit.normalY);
      dx -= inward * hit.normalX;
      dy -= inward * hit.normalY;
      if (Math.hypot(dx, dy) < 1e-6) break;
    }
    body.x = fromX;
    body.y = fromY;
    // Corrige aussi les chevauchements dus à une séparation entre corps.
    for (let i = 0; i < 4; i++)
      for (const wall of walls)
        if (circleVsWall(body, wall)) {
          const at = resolveCircleVsWall(body.x, body.y, body.radius, wall);
          body.x = at.x;
          body.y = at.y;
        }
  }

  private defenderAnchor(base: MapZone, index: number): { x: number; y: number } {
    const a = base.area;
    if (a.height === this.config.arena.height)
      return {
        x: a.x === 0 ? a.x + a.width - 35 : a.x + 35,
        y: a.y + (a.height * (index + 0.5)) / 4,
      };
    return { x: a.x + (index % 2 ? a.width - 35 : 35), y: a.y + (index < 2 ? 35 : a.height - 35) };
  }

  private populateBaseDefenders(): void {
    if (this.defendersReady) return;
    this.defendersReady = true;
    for (const base of this.config.map.zones.filter((z) => z.kind === 'base'))
      for (let i = 0; i < 4; i++) {
        const at = this.defenderAnchor(base, i);
        const id = this.nextId++;
        this.addProjectile({
          kind: 'projectile',
          family: 'drone',
          id,
          ownerId: id,
          ownerPlayerId: -base.team,
          ownerName: 'Défense de base',
          team: base.team,
          ...at,
          prevX: at.x,
          prevY: at.y,
          vx: 0,
          vy: 0,
          angle: 0,
          radius: 18,
          health: 1000,
          maxHealth: 1000,
          damage: 120,
          expires: Infinity,
          hits: new Set(),
          nextHits: new Map(),
          lastDamageTick: this.tick,
          autonomous: true,
          cruiseSpeed: 500,
          secondaryActive: false,
          nextSecondary: Infinity,
          missile: undefined,
          base,
        });
      }
  }

  private prepareBaseDefender(body: Projectile, dt: number): void {
    const base = body.base!;
    let target: Tank | undefined;
    let distance = Infinity;
    for (const other of this.bodies.values()) {
      if (
        other.kind !== 'tank' ||
        !this.canDamage(body, other) ||
        other.opacity < 0.15 ||
        !circleVsWall(other.x, other.y, 220, base.area) ||
        !this.lineOfSight(body, other)
      )
        continue;
      const d = Math.hypot(other.x - body.x, other.y - body.y);
      if (d < distance) {
        target = other;
        distance = d;
      }
    }
    // L'identifiant est stable ; chaque base dispose de quatre points de garde.
    const index = [...this.bodies.values()]
      .filter((b) => b.kind === 'projectile' && b.base === base)
      .findIndex((b) => b.id === body.id);
    const at = target ?? this.defenderAnchor(base, index);
    const dx = at.x - body.x;
    const dy = at.y - body.y;
    const length = Math.hypot(dx, dy);
    const speed = Math.min(body.cruiseSpeed, length * B.droneSteering);
    const decay = Math.exp(-B.droneSteering * dt);
    body.vx = body.vx * decay + (dx / (length || 1)) * speed * (1 - decay);
    body.vy = body.vy * decay + (dy / (length || 1)) * speed * (1 - decay);
    if (length > 1) body.angle = Math.atan2(dy, dx);
  }

  private integrate(dt: number): void {
    const bodies = [...this.bodies.values()];
    const wallHits = new Map<number, ReturnType<typeof sweepCircleVsWalls>>();
    for (const body of bodies) {
      body.prevX = body.x;
      body.prevY = body.y;
      const x = body.x + body.vx * dt;
      const y = body.y + body.vy * dt;
      if (body.kind !== 'projectile' || this.controlled(body) || body.family === 'trap')
        this.moveSolid(body, x, y);
      else {
        const hit = sweepCircleVsWalls(
          body.x,
          body.y,
          x,
          y,
          body.radius,
          this.obstacles(body.team),
        );
        if (hit.hit) wallHits.set(body.id, hit);
        body.x = x;
        body.y = y;
      }
      if (body.kind === 'shape') body.angle += body.spin * dt;
      if (body.kind !== 'projectile') this.bound(body);
    }
    const contacts: { a: Body; b: Body; time: number }[] = [];
    for (const [a, b] of collisionCandidates(
      bodies,
      B.gridSize,
      (a, b) => (a.kind !== 'projectile' && b.kind !== 'projectile') || this.canDamage(a, b),
    )) {
      const time = contactTime(a, b);
      if (
        time !== null &&
        time < (wallHits.get(a.id)?.time ?? Infinity) &&
        time < (wallHits.get(b.id)?.time ?? Infinity) &&
        this.lineOfSight(
          { x: a.prevX + (a.x - a.prevX) * time, y: a.prevY + (a.y - a.prevY) * time },
          { x: b.prevX + (b.x - b.prevX) * time, y: b.prevY + (b.y - b.prevY) * time },
        )
      )
        contacts.push({ a, b, time });
    }
    // Un tir rapide atteint la première cible physique, pas la première insérée dans la map.
    contacts.sort((a, b) => a.time - b.time || a.a.id - b.a.id || a.b.id - b.b.id);
    for (const { a, b, time } of contacts) {
      if (!this.bodies.has(a.id) || !this.bodies.has(b.id)) continue;
      if (a.kind === 'projectile') this.hitProjectile(a, b, time);
      else if (b.kind === 'projectile') this.hitProjectile(b, a, time);
      else {
        if (
          (a.kind === 'tank' && this.convertSquare(a, b)) ||
          (b.kind === 'tank' && this.convertSquare(b, a))
        )
          continue;
        this.separate(a, b, time);
        if (!this.canDamage(a, b)) continue;
        const damageA = this.contactDamage(a) * dt;
        const damageB = this.contactDamage(b) * dt;
        // Les deux coups sont consommés avant les récompenses : un niveau gagné ne
        // peut pas sauver rétroactivement un tank déjà mort du même contact.
        const deadA = this.hurt(a, damageB);
        const deadB = this.hurt(b, damageA);
        if (deadA) this.destroy(a, this.attacker(b));
        if (deadB) this.destroy(b, this.attacker(a));
      }
    }
    for (const body of this.bodies.values()) {
      if (body.kind === 'projectile') {
        const wall = wallHits.get(body.id);
        if (wall) {
          body.x = wall.contactX;
          body.y = wall.contactY;
          this.expireProjectile(body);
          continue;
        }
        if (this.controlled(body) && !body.base) {
          const owner = this.pilotOf(body.ownerPlayerId)?.tank;
          if (owner) {
            const dx = body.x - owner.x;
            const dy = body.y - owner.y;
            const distance = Math.hypot(dx, dy);
            if (distance > B.droneLeash) {
              this.moveSolid(
                body,
                owner.x + (dx / distance) * B.droneLeash,
                owner.y + (dy / distance) * B.droneLeash,
              );
              const outward = (body.vx * dx + body.vy * dy) / distance;
              if (outward > 0) {
                body.vx -= (outward * dx) / distance;
                body.vy -= (outward * dy) / distance;
              }
            }
          }
          this.bound(body);
        } else if (body.family === 'trap' || body.base) this.bound(body);
        else if (this.outside(body)) this.expireProjectile(body);
      } else this.bound(body);
    }
  }

  private canDamage(a: Body, b: Body): boolean {
    // Podium : plus aucun dégât, donc ni XP ni objectif après la victoire.
    if (this.match?.phase === 'finished') return false;
    // Les tirs déjà en vol d'un objectif deviennent aussi inoffensifs en attente.
    for (const body of [a, b]) {
      if (body.kind !== 'projectile' || body.base) continue;
      const ai = this.ais.get(body.ownerPlayerId);
      if (ai && this.aiShielded(ai)) return false;
    }
    if ((a.kind === 'tank' && a.spawnProtected) || (b.kind === 'tank' && b.spawnProtected))
      return false;
    // Produire des drones ne révèle pas Manager ; spawn/god interdisent leurs
    // échanges de dégâts, mais la protection de base dépend de l'unité elle-même.
    if (this.protectedDrone(a) || this.protectedDrone(b)) return false;
    if (a.kind === 'projectile' && b.kind === 'tank' && a.ownerPlayerId === this.ownerKey(b))
      return false;
    if (b.kind === 'projectile' && a.kind === 'tank' && b.ownerPlayerId === this.ownerKey(a))
      return false;
    if (a.kind === 'projectile' && b.kind === 'projectile' && a.ownerPlayerId === b.ownerPlayerId)
      return false;
    if (a.kind === 'shape' && b.kind === 'shape') return false;
    // Les formes neutres n'usent pas les objectifs et boss (ni l'inverse par contact).
    if (
      (a.kind === 'shape' && b.kind === 'tank' && b.ai) ||
      (b.kind === 'shape' && a.kind === 'tank' && a.ai)
    )
      return false;
    return MODE_RULES[this.config.mode].canDamage(this.context, a.team, b.team);
  }

  private protectedDrone(body: Body): boolean {
    if (body.kind !== 'projectile' || !this.controlled(body)) return false;
    const player = this.pilotOf(body.ownerPlayerId);
    const owner = player?.tank;
    if (!player || !owner || owner.id !== body.ownerId) return false;
    return (
      this.inOwnBase(body) ||
      this.tick < owner.protectedUntil ||
      player.god ||
      !!(owner.ai && this.aiShielded(owner.ai))
    );
  }

  private hitProjectile(bullet: Projectile, target: Body, time: number): void {
    if (!this.canDamage(bullet, target)) return;
    if (this.convertSquare(bullet, target)) return;
    const repeat = this.controlled(bullet) || bullet.family === 'trap';
    if (repeat ? (bullet.nextHits.get(target.id) ?? 0) > this.tick : bullet.hits.has(target.id))
      return;
    if (repeat)
      bullet.nextHits.set(target.id, this.tick + Math.ceil(B.contactReload * this.config.tickRate));
    else bullet.hits.add(target.id);
    if (target.kind === 'projectile') {
      const targetRepeat = this.controlled(target) || target.family === 'trap';
      if (
        targetRepeat
          ? (target.nextHits.get(bullet.id) ?? 0) > this.tick
          : target.hits.has(bullet.id)
      )
        return;
      if (targetRepeat)
        target.nextHits.set(
          bullet.id,
          this.tick + Math.ceil(B.contactReload * this.config.tickRate),
        );
      else target.hits.add(bullet.id);
      // Consommer les deux coups avant les destructions (explosion éventuelle comprise).
      const deadA = this.hurt(bullet, target.damage);
      const deadB = this.hurt(target, bullet.damage);
      if (deadA) {
        this.placeExplosion(bullet, time);
        this.destroy(bullet, this.attacker(target));
      }
      if (deadB) {
        this.placeExplosion(target, time);
        this.destroy(target, this.attacker(bullet));
      }
    } else {
      const resistance =
        target.kind === 'tank' ? 14 + this.pilotOfTank(target).stats.bodyDamage * 3 : 8;
      this.damage(target, bullet.damage, this.attacker(bullet));
      if (bullet.missile === 'firework') {
        this.placeExplosion(bullet, time);
        this.destroy(bullet, this.attacker(target));
      } else this.damage(bullet, resistance, this.attacker(target));
    }
  }

  private placeExplosion(body: Projectile, time: number): void {
    if (body.missile !== 'firework') return;
    body.x = body.prevX + (body.x - body.prevX) * time;
    body.y = body.prevY + (body.y - body.prevY) * time;
  }

  private contactDamage(body: Tank | Shape): number {
    return body.kind === 'tank'
      ? (B.bodyDamage + this.pilotOfTank(body).stats.bodyDamage * B.bodyDamagePerStat) *
          (getClassDefinition(body.classId)!.bodyDamage ?? 1)
      : body.contact;
  }

  private attacker(body: Body): Attacker {
    if (body.kind === 'projectile')
      return {
        playerId: body.base ? null : this.credit(body.ownerPlayerId),
        name: body.ownerName,
        team: body.team,
      };
    if (body.kind === 'tank')
      return {
        playerId: body.ai ? body.ai.possessedBy : body.playerId,
        name: body.name,
        team: body.team,
      };
    return { playerId: null, name: body.shape, team: NEUTRAL_TEAM };
  }

  private hurt(body: Body, amount: number): boolean {
    if (body.health <= 0 || !this.bodies.has(body.id)) return false;
    if (body.kind === 'projectile' && body.base) return false;
    if (body.kind === 'tank' && body.ai && this.aiShielded(body.ai)) return false;
    if (
      body.kind === 'tank' &&
      !body.ai &&
      (this.players.get(body.playerId!)?.god || this.inOwnBase(body))
    )
      return false;
    body.health = Math.max(0, body.health - amount);
    body.lastDamageTick = this.tick;
    if (body.kind === 'tank') {
      body.opacity = 1;
      body.idleSince = this.tick;
    }
    return body.health === 0;
  }

  private damage(body: Body, amount: number, attacker: Attacker): void {
    if (this.hurt(body, amount)) this.destroy(body, attacker);
  }

  private destroy(body: Body, attacker: Attacker): void {
    if (body.kind === 'projectile') {
      this.expireProjectile(body);
      return;
    }
    if (body.kind === 'tank' && body.ai) {
      this.destroyAi(body.ai, attacker);
      return;
    }
    this.removeBody(body);
    if (body.kind === 'shape') this.reward(attacker.playerId, body.reward);
    else if (body.kind === 'tank') {
      const playerId = body.playerId!;
      const player = this.players.get(playerId)!;
      this.cleanupControlled(body.id);
      player.tank = null;
      player.god = false;
      player.x = body.x;
      player.y = body.y;
      player.input = null;
      player.respawnTick = this.tick + this.config.respawn.delayTicks;
      this.events.push({
        type: 'death',
        death: {
          playerId,
          tick: this.tick,
          killerName: attacker.name,
          score: body.score,
          level: body.level,
          classId: body.classId,
          respawnTick: player.respawnTick,
        },
      });
      if (attacker.playerId !== playerId)
        this.reward(attacker.playerId, 100 + Math.floor(body.score * 0.25));
      this.afterPlayerDeath(playerId, player, attacker, body);
    }
  }

  private separate(a: Tank | Shape, b: Tank | Shape, time: number): void {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    const radii = a.radius + b.radius;
    if (distance > radii && time > 0) {
      // Revenir au premier contact pour un corps ayant traversé l'autre à faible tickRate.
      a.x = a.prevX + (a.x - a.prevX) * time;
      a.y = a.prevY + (a.y - a.prevY) * time;
      b.x = b.prevX + (b.x - b.prevX) * time;
      b.y = b.prevY + (b.y - b.prevY) * time;
      dx = b.x - a.x;
      dy = b.y - a.y;
      distance = Math.hypot(dx, dy);
    }
    const nx = distance > 1e-9 ? dx / distance : a.id < b.id ? 1 : -1;
    const ny = distance > 1e-9 ? dy / distance : 0;
    const penetration = Math.max(0, radii - distance);
    const massA = a.kind === 'tank' ? (getClassDefinition(a.classId)!.mass ?? 1) : 1;
    const massB = b.kind === 'tank' ? (getClassDefinition(b.classId)!.mass ?? 1) : 1;
    const shareA = massB / (massA + massB);
    const shareB = massA / (massA + massB);
    a.x -= nx * penetration * shareA;
    a.y -= ny * penetration * shareA;
    b.x += nx * penetration * shareB;
    b.y += ny * penetration * shareB;
    const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (approach > 0) {
      a.vx -= nx * approach * shareA;
      a.vy -= ny * approach * shareA;
      b.vx += nx * approach * shareB;
      b.vy += ny * approach * shareB;
    }
    const ax = a.x,
      ay = a.y,
      bx = b.x,
      by = b.y;
    a.x = a.prevX;
    a.y = a.prevY;
    b.x = b.prevX;
    b.y = b.prevY;
    this.moveSolid(a, ax, ay);
    this.moveSolid(b, bx, by);
    this.bound(a);
    this.bound(b);
  }

  private bound(body: Body): void {
    const { width, height } = this.config.arena;
    const bounce = body.kind === 'shape' ? -1 : 0;
    if (body.x < body.radius) {
      body.x = body.radius;
      if (body.vx < 0) body.vx = bounce === 0 ? 0 : -body.vx;
    }
    if (body.x > width - body.radius) {
      body.x = width - body.radius;
      if (body.vx > 0) body.vx = bounce === 0 ? 0 : -body.vx;
    }
    if (body.y < body.radius) {
      body.y = body.radius;
      if (body.vy < 0) body.vy = bounce === 0 ? 0 : -body.vy;
    }
    if (body.y > height - body.radius) {
      body.y = height - body.radius;
      if (body.vy > 0) body.vy = bounce === 0 ? 0 : -body.vy;
    }
  }

  private outside(body: Body): boolean {
    return (
      body.x - body.radius < 0 ||
      body.y - body.radius < 0 ||
      body.x + body.radius > this.config.arena.width ||
      body.y + body.radius > this.config.arena.height
    );
  }

  private populateShapes(): void {
    let count = 0;
    for (const body of this.bodies.values())
      if (body.kind === 'shape' && body.shape !== 'alphaPentagon' && body.shape !== 'crasher')
        count++;
    for (; count < this.config.shapes.targetCount; count++) {
      const roll = this.rng.next();
      const shape = roll < 0.65 ? 'square' : roll < 0.9 ? 'triangle' : 'pentagon';
      const health = shape === 'square' ? 10 : shape === 'triangle' ? 30 : 100;
      const radius = Math.min(
        shape === 'square' ? 16 : shape === 'triangle' ? 20 : 30,
        this.config.arena.width / 2,
        this.config.arena.height / 2,
      );
      const at = this.spawnPoint(radius, NEUTRAL_TEAM);
      if (!at) break;
      const direction = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(12, 28);
      const body: Shape = {
        kind: 'shape',
        id: this.nextId++,
        shape,
        shiny: false,
        team: NEUTRAL_TEAM,
        ...at,
        prevX: at.x,
        prevY: at.y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        angle: this.rng.range(0, Math.PI * 2),
        radius,
        health,
        maxHealth: health,
        reward: shape === 'square' ? 10 : shape === 'triangle' ? 25 : 130,
        spin: this.rng.range(-0.6, 0.6),
        drift: speed,
        contact: 12,
        lastDamageTick: this.tick,
      };
      // Tirage sur le flux auxiliaire : sans variante rare, la séquence historique est inchangée.
      const shinyChance = this.config.shapes.shinyChance ?? 0;
      if (shinyChance > 0 && this.aux.next() < shinyChance) {
        const shiny = SHAPE_BALANCE.shiny[shape];
        body.shiny = true;
        body.health = body.maxHealth = shiny.health;
        body.reward = shiny.reward;
      }
      this.bodies.set(body.id, body);
    }
    this.populateNest();
  }

  // ---------------------------------------------------------------- IA : Dominators, Mothership, boss

  private *tanks(): Iterable<Tank> {
    for (const player of this.players.values()) if (player.tank) yield player.tank;
    for (const ai of this.ais.values()) yield ai.tank;
  }

  private createAi(
    classId: ClassId,
    team: TeamId,
    at: { x: number; y: number },
    anchored: boolean,
  ): Ai {
    const def = getSpecialClassDefinition(classId)!;
    const id = this.nextId++;
    const stats = emptyStatLevels();
    for (const stat of STAT_IDS) stats[stat] = def.stats[stat] ?? 0;
    const pilot: Player = {
      name: def.name,
      team,
      input: null,
      receivedSeq: 0,
      appliedSeq: 0,
      tank: null,
      initialSpawn: false,
      respawnTick: null,
      score: def.reward,
      level: def.level,
      classId: def.id,
      stats,
      spent: 0,
      god: false,
      x: at.x,
      y: at.y,
      spectator: false,
      possessing: null,
      parked: null,
    };
    const tank: Tank = {
      kind: 'tank',
      id,
      playerId: null,
      name: def.name,
      team,
      x: at.x,
      y: at.y,
      prevX: at.x,
      prevY: at.y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: Math.min(def.radius, this.config.arena.width / 2, this.config.arena.height / 2),
      classId: def.id,
      level: def.level,
      score: def.reward,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      opacity: 1,
      barrelShots: def.barrels.map(() => -1),
      nextShots: def.barrels.map(() => 0),
      activeBarrels: def.barrels.map(() => false),
      idleSince: this.tick,
      barrelAngles: def.barrels.map((b) => b.angle),
      protectedUntil: this.tick,
      spawnProtected: false,
      lastDamageTick: this.tick,
    };
    const ai: Ai = {
      key: -(1000 + id),
      def,
      pilot,
      tank,
      anchor: anchored ? { x: at.x, y: at.y } : null,
      objective: null,
      possessedBy: null,
      targetId: null,
      lastSeen: -Infinity,
      lastX: at.x,
      lastY: at.y,
      wanderX: at.x,
      wanderY: at.y,
      nextWander: this.tick,
    };
    tank.ai = ai;
    pilot.tank = tank;
    this.ais.set(ai.key, ai);
    this.bodies.set(id, tank);
    return ai;
  }

  /** Retire tous les projectiles d'une clé de propriétaire (IA détruite ou capturée). */
  private removeOwned(key: number): void {
    for (const body of this.bodies.values())
      if (body.kind === 'projectile' && body.ownerPlayerId === key) this.removeBody(body);
  }

  private removeAi(ai: Ai): void {
    if (ai.possessedBy !== null) this.release(ai);
    this.ais.delete(ai.key);
    this.bodies.delete(ai.tank.id);
    this.removeOwned(ai.key);
  }

  /**
   * Dominator : neutre détruit par un camp déclaré => ce camp ; détenu détruit par un autre camp
   * => neutre. Santé restaurée, tirs en vol retirés, pilote éjecté. Les autres IA disparaissent.
   */
  private destroyAi(ai: Ai, attacker: Attacker): void {
    const tank = ai.tank;
    const objective = ai.objective;
    if (ai.def.role === 'dominator') {
      const to =
        tank.team === NEUTRAL_TEAM && this.isDeclaredTeam(attacker.team)
          ? attacker.team
          : NEUTRAL_TEAM;
      if (ai.possessedBy !== null) this.release(ai);
      this.removeOwned(ai.key);
      tank.team = ai.pilot.team = to;
      tank.health = tank.maxHealth;
      tank.lastDamageTick = this.tick;
      ai.targetId = null;
      if (objective) {
        objective.team = to;
        this.events.push({
          type: 'objective',
          objectiveId: objective.id,
          kind: 'dominator',
          action: to === NEUTRAL_TEAM ? 'neutralized' : 'captured',
          team: to === NEUTRAL_TEAM ? attacker.team : to,
          playerId: attacker.playerId,
        });
      }
      this.reward(attacker.playerId, ai.def.reward);
      return;
    }
    this.removeAi(ai);
    if (objective) {
      objective.ai = null;
      this.events.push({
        type: 'objective',
        objectiveId: objective.id,
        kind: objective.site.kind,
        action: 'destroyed',
        team: objective.team,
        playerId: attacker.playerId,
      });
    } else
      this.events.push({
        type: 'boss',
        action: 'death',
        entityId: tank.id,
        classId: tank.classId,
        killerPlayerId: attacker.playerId,
      });
    this.reward(attacker.playerId, ai.def.reward);
  }

  /** Commande `possess` (touche H) : bascule entre son tank et l'objectif allié le plus proche. */
  private possess(playerId: PlayerId, player: Player): void {
    if (player.possessing) {
      this.release(player.possessing);
      return;
    }
    const tank = player.tank;
    if (!tank || !this.match || this.match.phase === 'finished') return;
    if (this.rule !== 'dominators' && this.rule !== 'mothership') return;
    let best: Ai | undefined;
    let bestGap = Infinity;
    for (const ai of this.ais.values()) {
      if (ai.def.role === 'boss' || ai.possessedBy !== null || ai.tank.team !== player.team)
        continue;
      const gap = Math.hypot(ai.tank.x - tank.x, ai.tank.y - tank.y) - ai.tank.radius - tank.radius;
      if (gap <= O.possessRange && gap < bestGap) {
        best = ai;
        bestGap = gap;
      }
    }
    if (!best) return;
    this.cleanupControlled(tank.id);
    this.dropCarriedFlag(playerId, tank);
    this.bodies.delete(tank.id);
    player.parked = tank;
    player.tank = null;
    player.possessing = best;
    best.possessedBy = playerId;
    best.pilot.input = null;
    this.events.push({ type: 'possess', playerId, entityId: best.tank.id });
  }

  /** Rend le tank garé, posé au contact de l'objectif sans traverser de mur. */
  private release(ai: Ai): void {
    const playerId = ai.possessedBy;
    if (playerId === null) return;
    ai.possessedBy = null;
    ai.pilot.input = null;
    const player = this.players.get(playerId);
    if (!player || player.possessing !== ai || !player.parked) return;
    const tank = player.parked;
    player.parked = null;
    player.possessing = null;
    const source = ai.tank;
    const dx = tank.x - source.x;
    const dy = tank.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const distance = source.radius + tank.radius + 4;
    tank.x = source.x;
    tank.y = source.y;
    this.moveSolid(tank, source.x + (dx / length) * distance, source.y + (dy / length) * distance);
    this.bound(tank);
    tank.prevX = tank.x;
    tank.prevY = tank.y;
    tank.vx = 0;
    tank.vy = 0;
    tank.protectedUntil = this.tick;
    player.tank = tank;
    player.x = tank.x;
    player.y = tank.y;
    this.bodies.set(tank.id, tank);
    this.syncTank(player);
    this.events.push({ type: 'possess', playerId, entityId: null });
  }

  /** Cible collante : conservée tant que visible et à portée, sinon la plus proche. */
  private aiTarget(ai: Ai, range: number): Tank | undefined {
    const self = ai.tank;
    const valid = (other: Tank): boolean =>
      other !== self &&
      this.bodies.has(other.id) &&
      other.opacity >= 0.15 &&
      Math.hypot(other.x - self.x, other.y - self.y) <= range + other.radius &&
      this.canDamage(self, other) &&
      this.lineOfSight(self, other);
    const current = ai.targetId !== null ? this.bodies.get(ai.targetId) : undefined;
    let target = current?.kind === 'tank' && valid(current) ? current : undefined;
    if (!target) {
      let best = Infinity;
      for (const other of this.tanks()) {
        if (!valid(other)) continue;
        const d = Math.hypot(other.x - self.x, other.y - self.y);
        if (d < best || (d === best && other.id < target!.id)) {
          target = other;
          best = d;
        }
      }
    }
    if (target) {
      ai.targetId = target.id;
      ai.lastSeen = this.tick;
      ai.lastX = target.x;
      ai.lastY = target.y;
    }
    return target;
  }

  private wander(ai: Ai): { x: number; y: number } {
    const tank = ai.tank;
    if (
      this.tick >= ai.nextWander ||
      Math.hypot(ai.wanderX - tank.x, ai.wanderY - tank.y) < tank.radius
    ) {
      const { width, height } = this.config.arena;
      const nest = this.config.shapes.nest;
      if (ai.def.id === 'guardian-of-the-pentagons' && nest && nest.radius > 0) {
        const angle = this.aux.range(0, Math.PI * 2);
        const r = nest.radius * Math.sqrt(this.aux.next());
        ai.wanderX = width / 2 + Math.cos(angle) * r;
        ai.wanderY = height / 2 + Math.sin(angle) * r;
      } else {
        const mx = Math.min(tank.radius * 2, width / 2);
        const my = Math.min(tank.radius * 2, height / 2);
        ai.wanderX = this.aux.range(mx, width - mx);
        ai.wanderY = this.aux.range(my, height - my);
      }
      ai.nextWander = this.tick + Math.ceil(AI.wanderSeconds * this.config.tickRate);
    }
    return { x: ai.wanderX, y: ai.wanderY };
  }

  /**
   * Décision d'une IA, traduite en `PlayerInput` synthétique : mêmes canons, drones et physique
   * que les joueurs. Pas de pathfinding : déplacement direct, glissement le long des murs.
   */
  private think(ai: Ai): void {
    const tank = ai.tank;
    if (this.aiShielded(ai)) {
      ai.pilot.input = null;
      ai.targetId = null;
      return;
    }
    if (ai.possessedBy !== null) {
      const input = this.players.get(ai.possessedBy)?.input;
      ai.pilot.input = input ? { ...input, move: { ...input.move }, aim: { ...input.aim } } : null;
      return;
    }
    const role = ai.def.role;
    const idle =
      this.aiShielded(ai) ||
      this.match?.phase === 'finished' ||
      (role === 'dominator' && tank.team === NEUTRAL_TEAM);
    const target = idle
      ? undefined
      : this.aiTarget(ai, role === 'dominator' ? AI.dominatorRange : AI.aggroRange);
    const remembered =
      !target &&
      !idle &&
      ai.targetId !== null &&
      this.tick - ai.lastSeen <= AI.memorySeconds * this.config.tickRate;
    if (!target && !remembered) ai.targetId = null;
    const goal = target ?? (remembered ? { x: ai.lastX, y: ai.lastY } : undefined);
    let destination: { x: number; y: number } | undefined;
    if (role === 'mothership') {
      const anchor = ai.anchor ?? { x: tank.x, y: tank.y };
      destination = anchor;
      if (goal) {
        const dx = goal.x - anchor.x;
        const dy = goal.y - anchor.y;
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(AI.mothershipLeash, Math.max(0, d - AI.standoff));
        destination = { x: anchor.x + (dx / d) * reach, y: anchor.y + (dy / d) * reach };
      }
    } else if (role === 'boss') {
      if (!goal) destination = idle ? undefined : this.wander(ai);
      else if (ai.def.id === 'fallen-booster') destination = goal;
      else {
        const dx = goal.x - tank.x;
        const dy = goal.y - tank.y;
        const d = Math.hypot(dx, dy) || 1;
        // Distance de combat : approcher, ou reculer si la cible colle au boss.
        if (d > AI.standoff) destination = goal;
        else if (d < AI.standoff * 0.6)
          destination = { x: tank.x - (dx / d) * AI.standoff, y: tank.y - (dy / d) * AI.standoff };
      }
    }
    let move = { x: 0, y: 0 };
    if (destination) {
      const dx = destination.x - tank.x;
      const dy = destination.y - tank.y;
      const d = Math.hypot(dx, dy);
      if (d > 10) move = { x: dx / d, y: dy / d };
    }
    const look = goal ?? (move.x || move.y ? destination : undefined);
    const aim =
      look && (look.x !== tank.x || look.y !== tank.y)
        ? { x: look.x - tank.x, y: look.y - tank.y }
        : (ai.pilot.input?.aim ?? { x: Math.cos(tank.angle), y: Math.sin(tank.angle) });
    ai.pilot.input = { seq: 0, move, aim, fire: goal !== undefined, alt: false };
  }

  // ---------------------------------------------------------------- boss et nid

  private bossPool(): ClassId[] {
    const pool = (this.config.bosses?.pool ?? []).filter(
      (id) => getSpecialClassDefinition(id)?.role === 'boss',
    );
    return pool.length ? pool : [...CLASSIC_BOSSES];
  }

  private bossCount(): number {
    let count = 0;
    for (const ai of this.ais.values()) if (ai.def.role === 'boss') count++;
    return count;
  }

  /** Horloge d'apparition : une tentative par échéance, jamais de rattrapage. */
  private updateBosses(): void {
    const bosses = this.config.bosses;
    if (!bosses?.enabled || this.tick < this.nextBossTick) return;
    this.nextBossTick = this.tick + Math.max(1, Math.floor(bosses.intervalTicks));
    if (this.match && this.match.phase !== 'playing') return;
    if (this.bossCount() >= Math.min(bosses.maxAlive, AI.maxBosses)) return;
    const pool = this.bossPool();
    this.spawnBoss(pool[this.bossRotation++ % pool.length]!);
  }

  private spawnBoss(classId: ClassId, near?: { x: number; y: number }): void {
    if (this.bossCount() >= AI.maxBosses) return;
    const def = getSpecialClassDefinition(classId);
    if (def?.role !== 'boss') return;
    const { width, height } = this.config.arena;
    const nest = this.config.shapes.nest;
    const radius = Math.min(def.radius, width / 2, height / 2);
    const at = this.freePoint(radius, () => {
      const angle = this.aux.range(0, Math.PI * 2);
      if (near) return { x: near.x + Math.cos(angle) * 600, y: near.y + Math.sin(angle) * 600 };
      if (classId === 'guardian-of-the-pentagons' && nest && nest.radius > 0) {
        const r = nest.radius * Math.sqrt(this.aux.next());
        return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
      }
      // Bord d'arène : les autres boss arrivent de l'extérieur, comme le propose le catalogue.
      const t = this.aux.next();
      const inset = radius + 150;
      switch (this.aux.int(0, 3)) {
        case 0:
          return { x: t * width, y: inset };
        case 1:
          return { x: width - inset, y: t * height };
        case 2:
          return { x: t * width, y: height - inset };
        default:
          return { x: inset, y: t * height };
      }
    });
    if (!at) return;
    const ai = this.createAi(classId, NEUTRAL_TEAM, at, false);
    this.events.push({
      type: 'boss',
      action: 'spawn',
      entityId: ai.tank.id,
      classId,
      killerPlayerId: null,
    });
  }

  /** Point libre (murs, bases, corps) tiré sur le flux auxiliaire ; 32 essais au plus. */
  private freePoint(
    radius: number,
    candidate: () => { x: number; y: number },
  ): { x: number; y: number } | undefined {
    const { width, height } = this.config.arena;
    const blocked = this.obstacles(NEUTRAL_TEAM);
    let best: { x: number; y: number } | undefined;
    let bestGap = -Infinity;
    const solids = [...this.bodies.values()].filter((body) => body.kind !== 'projectile');
    for (let attempt = 0; attempt < 32; attempt++) {
      const raw = candidate();
      const at = {
        x: Math.max(radius, Math.min(width - radius, raw.x)),
        y: Math.max(radius, Math.min(height - radius, raw.y)),
      };
      if (circleVsWalls(at.x, at.y, radius, blocked)) continue;
      let gap = Infinity;
      for (const body of solids)
        gap = Math.min(gap, Math.hypot(at.x - body.x, at.y - body.y) - radius - body.radius);
      if (gap >= 50) return at;
      if (gap >= 0 && gap > bestGap) {
        best = at;
        bestGap = gap;
      }
    }
    return best;
  }

  /** Nid central : Alpha Pentagons et Crashers proportionnels à `targetCount`. */
  private populateNest(): void {
    const nest = this.config.shapes.nest;
    if (!nest || nest.radius <= 0) return;
    const total = this.config.shapes.targetCount;
    const wanted = {
      alphaPentagon: Math.round(total * nest.alphaShare),
      crasher: Math.round(total * nest.crasherShare),
    };
    if (wanted.alphaPentagon === 0 && wanted.crasher === 0) return;
    const have = { alphaPentagon: 0, crasher: 0 };
    for (const body of this.bodies.values())
      if (body.kind === 'shape' && (body.shape === 'alphaPentagon' || body.shape === 'crasher'))
        have[body.shape]++;
    const { width, height } = this.config.arena;
    for (const shape of ['alphaPentagon', 'crasher'] as const) {
      const stats = SHAPE_BALANCE[shape];
      const radius = Math.min(stats.radius, width / 2, height / 2);
      for (let count = have[shape]; count < wanted[shape]; count++) {
        const at = this.freePoint(radius, () => {
          const angle = this.aux.range(0, Math.PI * 2);
          const r = nest.radius * Math.sqrt(this.aux.next());
          return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
        });
        if (!at) break;
        const direction = this.aux.range(0, Math.PI * 2);
        const speed = shape === 'crasher' ? this.aux.range(20, 40) : this.aux.range(4, 10);
        const body: Shape = {
          kind: 'shape',
          id: this.nextId++,
          shape,
          shiny: false,
          team: NEUTRAL_TEAM,
          ...at,
          prevX: at.x,
          prevY: at.y,
          vx: Math.cos(direction) * speed,
          vy: Math.sin(direction) * speed,
          angle: this.aux.range(0, Math.PI * 2),
          radius,
          health: stats.health,
          maxHealth: stats.health,
          reward: stats.reward,
          spin: this.aux.range(-0.3, 0.3),
          drift: speed,
          contact: shape === 'crasher' ? AI.crasherContact : AI.alphaContact,
          lastDamageTick: this.tick,
        };
        this.bodies.set(body.id, body);
      }
    }
  }

  /** Crashers : chargent le tank hostile visible le plus proche près du nid, puis y reviennent. */
  private prepareCrashers(): void {
    const nest = this.config.shapes.nest;
    if (!nest || nest.radius <= 0) return;
    const cx = this.config.arena.width / 2;
    const cy = this.config.arena.height / 2;
    const leash = nest.radius + AI.crasherNestMargin;
    for (const body of this.bodies.values()) {
      if (body.kind !== 'shape' || body.shape !== 'crasher') continue;
      let target: Tank | undefined;
      let best = AI.crasherAggro ** 2;
      for (const tank of this.tanks()) {
        if (tank.opacity < 0.15 || Math.hypot(tank.x - cx, tank.y - cy) > leash) continue;
        const d = (tank.x - body.x) ** 2 + (tank.y - body.y) ** 2;
        if (d < best && this.canDamage(body, tank) && this.lineOfSight(body, tank)) {
          best = d;
          target = tank;
        }
      }
      const goal =
        target ?? (Math.hypot(body.x - cx, body.y - cy) > nest.radius ? { x: cx, y: cy } : null);
      if (!goal) continue;
      const dx = goal.x - body.x;
      const dy = goal.y - body.y;
      const length = Math.hypot(dx, dy) || 1;
      const speed = target ? AI.crasherSpeed : body.drift;
      body.vx = (dx / length) * speed;
      body.vy = (dy / length) * speed;
    }
  }

  // ---------------------------------------------------------------- rounds et objectifs

  private get flagReturnTicks(): number {
    return Math.ceil(O.flagReturnSeconds * this.config.tickRate);
  }

  private createObjectives(): void {
    const match = this.match!;
    this.objectivesReady = true;
    const sites = this.config.map.objectives ?? defaultObjectiveSites(this.config);
    match.objectives = sites.map((site, id) => {
      const objective: Objective = {
        id,
        site,
        team: site.team,
        ai: null,
        flag: null,
        territory: null,
      };
      if (site.kind === 'dominator' || site.kind === 'mothership') {
        const fallback = site.kind === 'mothership' ? 'mothership' : 'dominator-gunner';
        const classId =
          site.classId && getSpecialClassDefinition(site.classId) ? site.classId : fallback;
        const ai = this.createAi(classId, site.team, site, true);
        ai.objective = objective;
        objective.ai = ai;
      } else if (site.kind === 'flag')
        objective.flag = {
          id,
          team: site.team,
          homeX: site.x,
          homeY: site.y,
          x: site.x,
          y: site.y,
          status: 'home',
          carrier: null,
          returnTick: null,
        };
      else
        objective.territory = {
          team: site.team,
          capturingTeam: NEUTRAL_TEAM,
          progress: 0,
          contested: false,
        };
      return objective;
    });
  }

  private dropCarriedFlag(playerId: PlayerId, at: { x: number; y: number }): void {
    for (const objective of this.match?.objectives ?? []) {
      const flag = objective.flag;
      if (flag?.status !== 'carried' || flag.carrier !== playerId) continue;
      dropFlag(flag, at, this.tick, this.flagReturnTicks);
      this.events.push({
        type: 'objective',
        objectiveId: flag.id,
        kind: 'flag',
        action: 'drop',
        team: flag.team,
        playerId,
      });
    }
  }

  private afterPlayerDeath(playerId: PlayerId, player: Player, attacker: Attacker, at: Tank): void {
    this.dropCarriedFlag(playerId, at);
    if (this.match?.phase !== 'playing') return;
    // Tag : le tué rejoint le camp déclaré de son tueur (formes et suicide exclus).
    if (
      this.rule === 'conversion' &&
      attacker.team !== player.team &&
      this.isDeclaredTeam(attacker.team)
    ) {
      const remaining = (this.teamSizes.get(player.team) ?? 1) - 1;
      if (remaining > 0) this.teamSizes.set(player.team, remaining);
      else this.teamSizes.delete(player.team);
      this.teamSizes.set(attacker.team, (this.teamSizes.get(attacker.team) ?? 0) + 1);
      player.team = attacker.team;
      this.events.push({ type: 'teamChange', playerId, team: attacker.team });
    }
    // Survival : éliminé jusqu'au round suivant, aucune réapparition acceptée.
    if (this.rule === 'survival') {
      player.spectator = true;
      player.respawnTick = null;
    }
  }

  private setPhase(phase: MatchPhase, endTick: number | null): void {
    const match = this.match!;
    if (phase === 'waiting') {
      for (const [id, player] of this.players) this.dropCarriedFlag(id, player.tank ?? player);
    }
    match.phase = phase;
    match.phaseTick = this.tick;
    match.endTick = endTick;
    if (phase !== 'finished') match.result = null;
    this.events.push({
      type: 'matchPhase',
      phase,
      round: match.round,
      result: match.result ? { ...match.result } : null,
    });
  }

  /** Victoire unique par round : ignorée hors phase `playing`. */
  private finish(
    team: TeamId | null,
    reason: MatchResult['reason'],
    winner?: { playerId: PlayerId; name: string },
  ): void {
    const match = this.match!;
    if (match.phase !== 'playing') return;
    match.result = {
      team,
      playerId: winner?.playerId ?? null,
      name: winner?.name ?? this.config.teams.find((t) => t.id === team)?.name ?? null,
      reason,
      tick: this.tick,
    };
    this.setPhase('finished', this.tick + Math.max(1, this.config.match!.restartDelayTicks));
  }

  /** Limite de temps : meilleur score de camp, égalité sinon. */
  private finishByScore(reason: MatchResult['reason'] = 'timeLimit'): void {
    const match = this.match!;
    let best: TeamId | null = null;
    let bestScore = -Infinity;
    for (const { id } of this.config.teams) {
      const score = match.scores.get(id) ?? 0;
      if (score > bestScore) {
        best = id;
        bestScore = score;
      } else if (score === bestScore) best = null;
    }
    this.finish(best, reason);
  }

  private startRound(): void {
    const match = this.match!;
    this.resetRound();
    match.round++;
    const limit = this.config.match!.timeLimitTicks;
    this.setPhase('playing', limit > 0 ? this.tick + limit : null);
  }

  /**
   * Nouveau round sûr : joueurs connectés conservés, scores remis au niveau de départ, tous les
   * projectiles et IA retirés (y compris gardes de base, recréés), objectifs neufs. La
   * configuration (carte, objectifs) est inchangée : celle de `room.joined` reste valable.
   */
  private resetRound(): void {
    const match = this.match!;
    for (const player of this.players.values()) {
      player.possessing = null;
      player.parked = null;
    }
    for (const body of [...this.bodies.values()])
      if (body.kind !== 'shape') this.bodies.delete(body.id);
    this.projectileCounts.clear();
    this.ais.clear();
    this.obstacleCache.clear();
    if (this.rule === 'conversion') {
      // Tag : camps rééquilibrés dans l'ordre des identifiants.
      this.teamSizes.clear();
      for (const id of [...this.players.keys()].sort((a, b) => a - b)) {
        const player = this.players.get(id)!;
        player.team = MODE_RULES[this.config.mode].assignTeam(this.context, id);
        this.teamSizes.set(player.team, (this.teamSizes.get(player.team) ?? 0) + 1);
      }
    }
    const level = Math.max(
      1,
      Math.min(this.config.progression.maxLevel, this.config.progression.startLevel),
    );
    for (const player of this.players.values()) {
      player.tank = null;
      player.initialSpawn = true;
      player.respawnTick = null;
      player.score = scoreForLevel(level);
      player.level = level;
      player.classId = STARTING_CLASS;
      player.stats = emptyStatLevels();
      player.spent = 0;
      player.god = false;
      player.spectator = false;
      player.input = null;
    }
    match.scores = new Map(this.config.teams.map((team) => [team.id, 0]));
    match.result = null;
    match.pointClock = 0;
    if (this.config.bosses?.enabled)
      this.nextBossTick = this.tick + this.config.bosses.firstSpawnTicks;
    this.defendersReady = false;
    this.populateBaseDefenders();
    this.createObjectives();
    for (const [id, player] of this.players) this.spawn(id, player, false);
  }

  private updateMatch(dt: number): void {
    const match = this.match;
    if (!match) return;
    const config = this.config.match!;
    const enough = this.players.size >= Math.max(1, config.minPlayers);
    if (match.phase === 'waiting') {
      if (enough) this.startRound();
      return;
    }
    if (match.phase === 'finished') {
      if (this.tick < match.endTick!) return;
      if (enough) this.startRound();
      else {
        this.resetRound();
        this.setPhase('waiting', null);
      }
      return;
    }
    // Survival se termine par élimination ; les autres modes attendent de nouveaux joueurs.
    if (!enough && this.rule !== 'survival') {
      this.setPhase('waiting', null);
      return;
    }
    switch (this.rule) {
      case 'dominators': {
        const owners = match.objectives
          .filter((o) => o.ai?.def.role === 'dominator')
          .map((o) => o.team);
        for (const { id } of this.config.teams)
          match.scores.set(id, owners.filter((team) => team === id).length);
        if (
          owners.length > 0 &&
          owners.every((team) => team === owners[0]) &&
          this.isDeclaredTeam(owners[0]!)
        )
          this.finish(owners[0]!, 'dominators');
        break;
      }
      case 'conversion': {
        for (const { id } of this.config.teams) match.scores.set(id, this.teamSizes.get(id) ?? 0);
        const populated = this.config.teams.filter(
          (team) => (this.teamSizes.get(team.id) ?? 0) > 0,
        );
        if (populated.length === 1) this.finish(populated[0]!.id, 'conversion');
        break;
      }
      case 'flags':
        this.updateFlags();
        break;
      case 'territories':
        this.updateTerritories(dt);
        break;
      case 'survival':
        this.updateSurvival(dt);
        break;
      case 'mothership': {
        const alive = new Set<TeamId>();
        for (const objective of match.objectives) {
          if (objective.site.kind !== 'mothership') continue;
          const tank = objective.ai?.tank;
          match.scores.set(objective.team, tank ? Math.ceil(tank.health) : 0);
          if (tank) alive.add(objective.team);
        }
        if (alive.size <= 1) this.finish(alive.size ? [...alive][0]! : null, 'mothership');
        break;
      }
    }
    if (match.phase === 'playing' && match.endTick !== null && this.tick >= match.endTick) {
      if (this.rule === 'survival') this.finish(null, 'timeLimit');
      else this.finishByScore();
    }
  }

  private updateFlags(): void {
    const match = this.match!;
    const flags = match.objectives.flatMap((o) => (o.flag ? [o.flag] : []));
    const alive = [...this.players]
      .filter(([, player]) => player.tank)
      .sort(([a], [b]) => a - b)
      .map(([playerId, player]) => ({
        playerId,
        team: player.team,
        x: player.tank!.x,
        y: player.tank!.y,
        radius: player.tank!.radius,
      }));
    const events = stepFlags(
      flags,
      alive,
      (id) => this.players.get(id),
      this.tick,
      this.flagReturnTicks,
    );
    for (const event of events) {
      if (event.action === 'score')
        match.scores.set(event.team, (match.scores.get(event.team) ?? 0) + 1);
      this.events.push({
        type: 'objective',
        objectiveId: event.flag.id,
        kind: 'flag',
        action: event.action,
        team: event.team,
        playerId: event.playerId,
      });
    }
    const limit = this.config.match!.scoreLimit;
    if (limit <= 0) return;
    for (const { id } of this.config.teams)
      if ((match.scores.get(id) ?? 0) >= limit) return this.finish(id, 'flags');
  }

  private updateTerritories(dt: number): void {
    const match = this.match!;
    const territories = match.objectives.filter((o) => o.territory);
    for (const objective of territories) {
      const present = new Set<TeamId>();
      for (const player of this.players.values()) {
        const tank = player.tank;
        if (!tank || !this.isDeclaredTeam(tank.team)) continue;
        if (
          Math.hypot(tank.x - objective.site.x, tank.y - objective.site.y) <= objective.site.radius
        )
          present.add(tank.team);
      }
      if (stepTerritory(objective.territory!, present, dt)) {
        objective.team = objective.territory!.team;
        this.events.push({
          type: 'objective',
          objectiveId: objective.id,
          kind: 'territory',
          action: 'captured',
          team: objective.team,
          playerId: null,
        });
      }
    }
    // Compteur entier de ticks : un point par seconde et par territoire, sans dérive flottante.
    if (++match.pointClock >= this.config.tickRate) {
      match.pointClock = 0;
      for (const objective of territories)
        if (this.isDeclaredTeam(objective.team))
          match.scores.set(
            objective.team,
            (match.scores.get(objective.team) ?? 0) + O.territoryPointsPerSecond,
          );
    }
    const owner = territories[0]?.team;
    if (
      owner !== undefined &&
      this.isDeclaredTeam(owner) &&
      territories.every((objective) => objective.team === owner)
    )
      return this.finish(owner, 'territories');
    const limit = this.config.match!.scoreLimit;
    if (limit > 0 && this.config.teams.some(({ id }) => (match.scores.get(id) ?? 0) >= limit))
      this.finishByScore('territories');
  }

  private updateSurvival(dt: number): void {
    const match = this.match!;
    const radius = safeZoneRadius(this.config, this.tick - match.phaseTick);
    const cx = this.config.arena.width / 2;
    const cy = this.config.arena.height / 2;
    const dps = this.config.match!.shrink?.damagePerSecond ?? 0;
    if (dps > 0)
      for (const player of this.players.values()) {
        const tank = player.tank;
        if (tank && Math.hypot(tank.x - cx, tank.y - cy) > radius)
          this.damage(tank, dps * dt, { playerId: null, name: 'Zone', team: NEUTRAL_TEAM });
      }
    const survivors = [...this.players].filter(([, player]) => !player.spectator);
    if (survivors.length > 1) return;
    const [winner] = survivors;
    this.finish(
      winner ? winner[1].team : null,
      'lastSurvivor',
      winner ? { playerId: winner[0], name: winner[1].name } : undefined,
    );
  }

  private objectiveState(
    objective: Objective,
    hiddenEnemy: (body: Body | undefined) => boolean,
  ): ObjectiveState {
    const base = {
      id: objective.id,
      kind: objective.site.kind,
      radius: objective.site.radius,
      team: objective.team,
    };
    const { flag, territory } = objective;
    if (flag) {
      const hidden =
        flag.carrier !== null && hiddenEnemy(this.players.get(flag.carrier)?.tank ?? undefined);
      return {
        ...base,
        x: hidden ? flag.homeX : flag.x,
        y: hidden ? flag.homeY : flag.y,
        entityId: null,
        progress: flag.status === 'home' ? 1 : 0,
        flag: {
          status: flag.status,
          carrierId: hidden ? null : flag.carrier,
          homeX: flag.homeX,
          homeY: flag.homeY,
          returnTick: flag.returnTick,
          ...(hidden ? { positionHidden: true } : {}),
        },
      };
    }
    if (territory)
      return {
        ...base,
        x: objective.site.x,
        y: objective.site.y,
        entityId: null,
        progress: territory.progress,
        capturingTeam: territory.capturingTeam,
        contested: territory.contested,
      };
    const tank = objective.ai?.tank;
    const maxHealth =
      tank?.maxHealth ??
      getSpecialClassDefinition(objective.site.classId ?? 'mothership')?.maxHealth ??
      1;
    return {
      ...base,
      x: tank?.x ?? objective.site.x,
      y: tank?.y ?? objective.site.y,
      entityId: tank?.id ?? null,
      progress: tank ? tank.health / tank.maxHealth : 0,
      health: tank?.health ?? 0,
      maxHealth,
      possessedBy: objective.ai?.possessedBy ?? null,
    };
  }

  private matchState(hiddenEnemy: (body: Body | undefined) => boolean): MatchState | undefined {
    const match = this.match;
    if (!match) return undefined;
    const state: MatchState = {
      phase: match.phase,
      round: match.round,
      phaseTick: match.phaseTick,
      endTick: match.endTick,
      minPlayers: this.config.match!.minPlayers,
      players: this.players.size,
      result: match.result ? { ...match.result } : null,
      scores: this.config.teams.map((team) => ({
        team: team.id,
        score: match.scores.get(team.id) ?? 0,
        players: this.teamSizes.get(team.id) ?? 0,
      })),
      objectives: match.objectives.map((objective) => this.objectiveState(objective, hiddenEnemy)),
    };
    if (this.rule === 'survival') {
      state.survivors = [...this.players]
        .filter(([, player]) => !player.spectator)
        .map(([id]) => id)
        .sort((a, b) => a - b);
      state.safeZone = {
        x: this.config.arena.width / 2,
        y: this.config.arena.height / 2,
        radius: safeZoneRadius(
          this.config,
          match.phase === 'playing' ? this.tick - match.phaseTick : 0,
        ),
      };
    }
    return state;
  }

  snapshotFor(playerId: PlayerId): SnapshotPayload | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;
    const definition = this.definition(player);
    const piloted = player.possessing?.tank;
    const view = B.view * (piloted ? player.possessing!.def.view : definition.view);
    const entities: EntityState[] = [];
    const viewed = piloted ?? player.tank;
    const x = (viewed?.x ?? player.x) + (viewed?.cameraOffset?.x ?? 0);
    const y = (viewed?.y ?? player.y) + (viewed?.cameraOffset?.y ?? 0);
    const hiddenEnemy = (body: Body | undefined): boolean =>
      body?.kind === 'tank' &&
      body.opacity === 0 &&
      body.playerId !== playerId &&
      (body.team === NEUTRAL_TEAM || body.team !== player.team);
    for (const body of this.bodies.values()) {
      if (hiddenEnemy(body)) continue;
      const extent = view + B.viewMargin + body.radius;
      if (Math.abs(body.x - x) > extent || Math.abs(body.y - y) > extent) continue;
      const base = {
        id: body.id,
        x: body.x,
        y: body.y,
        vx: body.vx,
        vy: body.vy,
        angle: body.angle,
        radius: body.radius,
        team: body.team,
      };
      if (body.kind === 'tank')
        entities.push({
          ...base,
          kind: 'tank',
          playerId: body.playerId,
          name: body.name,
          classId: body.classId,
          level: body.level,
          score: body.score,
          health: body.health,
          maxHealth: body.maxHealth,
          opacity: body.opacity,
          barrelShots: [...body.barrelShots],
          ...(body.barrelAngles && getClassDefinition(body.classId)!.barrels.some((b) => b.auto)
            ? { barrelAngles: [...body.barrelAngles] }
            : {}),
          ...(body.cameraOffset ? { cameraOffset: { ...body.cameraOffset } } : {}),
          spawnProtected: body.spawnProtected,
        });
      else if (body.kind === 'shape')
        entities.push({
          ...base,
          kind: 'shape',
          shape: body.shape,
          shiny: body.shiny,
          health: body.health,
          maxHealth: body.maxHealth,
        });
      else
        entities.push({
          ...base,
          kind: 'projectile',
          family: body.family,
          ...(body.bodyShape ? { bodyShape: body.bodyShape } : {}),
          ...(body.classId ? { classId: body.classId } : {}),
          ...(body.barrelShots ? { barrelShots: [...body.barrelShots] } : {}),
          // 0 ne désigne aucun corps : ne pas divulguer le tank masqué via ses drones.
          ownerId: hiddenEnemy(this.bodies.get(body.ownerId)) ? 0 : body.ownerId,
          health: body.health,
          maxHealth: body.maxHealth,
        });
    }
    const floor = scoreForLevel(player.level);
    const ceiling = scoreForLevel(player.level + 1);
    const match = this.matchState(hiddenEnemy);
    return {
      tick: this.tick,
      ackSeq: player.appliedSeq,
      self: {
        playerId,
        entityId: viewed?.id ?? null,
        alive: viewed !== null && viewed !== undefined,
        classId: player.classId,
        level: player.level,
        score: player.score,
        levelProgress:
          player.level >= this.config.progression.maxLevel
            ? 1
            : Math.max(0, Math.min(1, (player.score - floor) / (ceiling - floor))),
        statPoints: pointsForLevel(player.level) - player.spent,
        stats: { ...player.stats },
        statCaps: this.caps(player),
        classChoices: player.tank ? this.choices(player) : [],
        view,
        respawnTick: player.respawnTick,
        ...(player.spectator ? { spectator: true } : {}),
        ...(piloted ? { possessing: piloted.id } : {}),
      },
      entities,
      leaderboard: [...this.players.entries()]
        .sort(([idA, a], [idB, b]) => b.score - a.score || idA - idB)
        .slice(0, 10)
        .map(([id, other]) => ({
          playerId: id,
          name: other.name,
          score: other.score,
          classId: other.classId,
        })),
      ...(match ? { match } : {}),
    };
  }
}

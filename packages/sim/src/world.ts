import {
  DEFAULT_STAT_CAP,
  NEUTRAL_TEAM,
  STARTING_CLASS,
  STAT_IDS,
  emptyStatLevels,
  getClassDefinition,
  isStatId,
  type ClassDefinition,
  type ClassId,
  type EntityState,
  type PlayerCommand,
  type PlayerId,
  type PlayerInput,
  type ProjectileState,
  type ShapeState,
  type SnapshotPayload,
  type StatLevels,
  type TankState,
} from '@diep-fried/shared';
import { BALANCE as B, pointsForLevel, scoreForLevel } from './balance';
import { MODE_RULES, type ModeContext } from './modes';
import { Rng } from './rng';
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
  playerId: PlayerId;
  nextShots: number[];
  triggering: boolean;
  protectedUntil: number;
}
interface Bullet extends ProjectileState, Motion {
  health: number;
  maxHealth: number;
  damage: number;
  ownerPlayerId: PlayerId;
  ownerName: string;
  expires: number;
  hits: Set<number>;
}
interface Shape extends ShapeState, Motion {
  reward: number;
  spin: number;
  /** Vitesse de dérive propre ; l'excédent reçu d'une poussée s'amortit. */
  drift: number;
}
type Body = Tank | Bullet | Shape;
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
  x: number;
  y: number;
}
interface Attacker {
  playerId: PlayerId | null;
  name: string;
}

export const createSimulation: SimulationFactory = (options) => new World(options);

class World implements Simulation {
  readonly config;
  private currentTick = 0;
  private nextId = 1;
  private readonly rng: Rng;
  private readonly players = new Map<PlayerId, Player>();
  private readonly bodies = new Map<number, Body>();
  private commands: { playerId: PlayerId; command: PlayerCommand }[] = [];
  private events: SimEvent[] = [];

  constructor({ config, seed }: SimulationOptions) {
    // La configuration d'un salon et les objets des snapshots ne sont jamais partagés.
    this.config = JSON.parse(JSON.stringify(config)) as typeof config;
    this.rng = new Rng(seed);
  }

  get tick(): number {
    return this.currentTick;
  }

  private get context(): ModeContext {
    return { config: this.config, rng: this.rng, tick: this.tick };
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
    const level = Math.max(
      1,
      Math.min(this.config.progression.maxLevel, this.config.progression.startLevel),
    );
    this.players.set(playerId, {
      name,
      team: MODE_RULES[this.config.mode].assignTeam(this.context, playerId),
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
      x: this.config.arena.width / 2,
      y: this.config.arena.height / 2,
    });
  }

  removePlayer(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    if (player?.tank) this.bodies.delete(player.tank.id);
    this.players.delete(playerId);
    for (const body of this.bodies.values()) {
      if (body.kind === 'projectile' && body.ownerPlayerId === playerId)
        this.bodies.delete(body.id);
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
      B.health + (player.level - 1) * B.healthPerLevel + player.stats.maxHealth * B.healthPerStat
    );
  }

  private syncTank(player: Player): void {
    const tank = player.tank;
    if (!tank || tank.health <= 0) return;
    const maxHealth = this.maxHealth(player);
    tank.health += maxHealth - tank.maxHealth;
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
    if (respawn) {
      player.score = Math.floor(player.score * this.config.progression.scoreKeptOnDeath);
      player.level = this.levelForScore(player.score);
      player.classId = STARTING_CLASS;
      player.stats = emptyStatLevels();
      player.spent = 0;
      player.input = null;
    }
    const radius = Math.min(
      B.tankRadius,
      this.config.arena.width / 2,
      this.config.arena.height / 2,
    );
    const at = this.spawnPoint(radius, player.team);
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
      triggering: false,
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

  /** Choisit le premier emplacement libre, sinon le moins encombré après 32 essais. */
  private spawnPoint(radius: number, team: number): { x: number; y: number } {
    let best = { x: this.config.arena.width / 2, y: this.config.arena.height / 2 };
    let bestGap = -Infinity;
    for (let attempt = 0; attempt < 32; attempt++) {
      const at = MODE_RULES[this.config.mode].spawnPoint(this.context, team, radius);
      let gap = Infinity;
      for (const body of this.bodies.values()) {
        if (body.kind === 'projectile') continue;
        gap = Math.min(gap, Math.hypot(at.x - body.x, at.y - body.y) - radius - body.radius);
      }
      if (gap > bestGap) {
        best = at;
        bestGap = gap;
      }
      if (gap >= 100) return at;
    }
    return best;
  }

  private applyCommands(): void {
    const commands = this.commands;
    this.commands = [];
    for (const { playerId, command } of commands) {
      const player = this.players.get(playerId);
      if (!player) continue;
      if (command.type === 'respawn') {
        if (!player.tank && player.respawnTick !== null && this.tick >= player.respawnTick) {
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
        player.classId = command.classId;
        const tank = player.tank;
        tank.barrelShots = this.definition(player).barrels.map(() => -1);
        tank.nextShots = this.definition(player).barrels.map(
          () => this.tick / this.config.tickRate,
        );
        tank.triggering = false;
        this.syncTank(player);
      }
    }
  }

  step(): SimEvent[] {
    this.currentTick++;
    this.events = [];
    for (const [id, player] of this.players) {
      if (player.initialSpawn) this.spawn(id, player, false);
      if (player.input) player.appliedSeq = player.input.seq;
    }
    this.applyCommands();
    const dt = 1 / this.config.tickRate;
    for (const player of this.players.values()) this.prepareTank(player, dt);
    const decay = Math.exp(-B.friction * dt);
    for (const body of this.bodies.values()) {
      if (body.kind === 'projectile' && body.expires <= this.tick) this.bodies.delete(body.id);
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
    this.populateShapes();
    return this.events;
  }

  private prepareTank(player: Player, dt: number): void {
    const tank = player.tank;
    if (!tank) return;
    const input = player.input;
    const definition = this.definition(player);
    tank.spawnProtected = this.tick < tank.protectedUntil;
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
    if (input?.fire) {
      tank.spawnProtected = false;
      tank.protectedUntil = this.tick;
      definition.barrels.forEach((barrel, index) => {
        if (barrel.projectile !== 'bullet') return;
        const period = B.reload * barrel.reload * B.reloadPerStat ** player.stats.reload;
        if (!tank.triggering)
          tank.nextShots[index] = Math.max(tank.nextShots[index]!, now + barrel.delay * period);
        if (now + 1e-9 < tank.nextShots[index]!) return;
        // Échéancier fractionnaire : la cadence moyenne suit la période exacte au lieu d'être
        // arrondie au tick, au plus un tir par tick. Pas de rattrapage après relâchement.
        tank.nextShots[index] = Math.max(tank.nextShots[index]! + period, now);
        tank.barrelShots[index] = this.tick;
        const angle = tank.angle + barrel.angle;
        const shotAngle = angle + this.rng.range(-barrel.spread, barrel.spread);
        const speed =
          B.bulletSpeed * (1 + B.bulletSpeedPerStat * player.stats.bulletSpeed) * barrel.speed;
        const x =
          tank.x +
          tank.radius * (Math.cos(angle) * barrel.length - Math.sin(angle) * barrel.offset);
        const y =
          tank.y +
          tank.radius * (Math.sin(angle) * barrel.length + Math.cos(angle) * barrel.offset);
        const health =
          (B.bulletHealth + B.bulletHealthPerStat * player.stats.bulletPenetration) *
          barrel.penetration;
        const bullet: Bullet = {
          kind: 'projectile',
          family: 'bullet',
          id: this.nextId++,
          team: tank.team,
          ownerId: tank.id,
          ownerPlayerId: tank.playerId,
          ownerName: tank.name,
          x,
          y,
          prevX: x,
          prevY: y,
          vx: Math.cos(shotAngle) * speed,
          vy: Math.sin(shotAngle) * speed,
          angle: shotAngle,
          radius: B.bulletRadius * Math.sqrt(barrel.width / 0.84),
          health,
          maxHealth: health,
          damage:
            (B.bulletDamage + B.bulletDamagePerStat * player.stats.bulletDamage) * barrel.damage,
          expires: this.tick + Math.ceil(B.bulletLifetime * this.config.tickRate),
          hits: new Set(),
          lastDamageTick: this.tick,
        };
        if (!this.outside(bullet)) this.bodies.set(bullet.id, bullet);
        tank.vx -= Math.cos(angle) * B.recoil * barrel.recoil;
        tank.vy -= Math.sin(angle) * B.recoil * barrel.recoil;
      });
      tank.triggering = true;
    } else tank.triggering = false;
  }

  private integrate(dt: number): void {
    const bodies = [...this.bodies.values()];
    for (const body of bodies) {
      body.prevX = body.x;
      body.prevY = body.y;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      if (body.kind === 'shape') body.angle += body.spin * dt;
      if (body.kind !== 'projectile') this.bound(body);
    }
    const contacts: { a: Body; b: Body; time: number }[] = [];
    for (const [a, b] of collisionCandidates(bodies, B.gridSize)) {
      const time = contactTime(a, b);
      if (time !== null) contacts.push({ a, b, time });
    }
    // Un tir rapide atteint la première cible physique, pas la première insérée dans la map.
    contacts.sort((a, b) => a.time - b.time || a.a.id - b.a.id || a.b.id - b.b.id);
    for (const { a, b, time } of contacts) {
      if (!this.bodies.has(a.id) || !this.bodies.has(b.id)) continue;
      if (a.kind === 'projectile') this.hitBullet(a, b);
      else if (b.kind === 'projectile') this.hitBullet(b, a);
      else {
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
        if (this.outside(body)) this.bodies.delete(body.id);
      } else this.bound(body);
    }
  }

  private canDamage(a: Body, b: Body): boolean {
    if ((a.kind === 'tank' && a.spawnProtected) || (b.kind === 'tank' && b.spawnProtected))
      return false;
    if (a.kind === 'projectile' && b.kind === 'tank' && a.ownerPlayerId === b.playerId)
      return false;
    if (b.kind === 'projectile' && a.kind === 'tank' && b.ownerPlayerId === a.playerId)
      return false;
    if (a.kind === 'projectile' && b.kind === 'projectile' && a.ownerPlayerId === b.ownerPlayerId)
      return false;
    if (a.kind === 'shape' && b.kind === 'shape') return false;
    return MODE_RULES[this.config.mode].canDamage(this.context, a.team, b.team);
  }

  private hitBullet(bullet: Bullet, target: Body): void {
    if (!this.canDamage(bullet, target) || bullet.hits.has(target.id)) return;
    bullet.hits.add(target.id);
    if (target.kind === 'projectile') {
      if (target.hits.has(bullet.id)) return;
      target.hits.add(bullet.id);
      this.damage(bullet, target.damage, this.attacker(target));
      this.damage(target, bullet.damage, this.attacker(bullet));
    } else {
      // Chaque balle n'applique qu'un impact par cible. Pénétration = réserve consommée,
      // indépendante des dégâts ; évite les dégâts multipliés par le nombre de sous-pas.
      const resistance =
        target.kind === 'tank' ? 14 + this.players.get(target.playerId)!.stats.bodyDamage * 3 : 8;
      this.damage(target, bullet.damage, this.attacker(bullet));
      this.damage(bullet, resistance, this.attacker(target));
    }
  }

  private contactDamage(body: Tank | Shape): number {
    return body.kind === 'tank'
      ? B.bodyDamage + this.players.get(body.playerId)!.stats.bodyDamage * B.bodyDamagePerStat
      : 12;
  }

  private attacker(body: Body): Attacker {
    if (body.kind === 'projectile') return { playerId: body.ownerPlayerId, name: body.ownerName };
    if (body.kind === 'tank') return { playerId: body.playerId, name: body.name };
    return { playerId: null, name: body.shape };
  }

  private hurt(body: Body, amount: number): boolean {
    if (body.health <= 0 || !this.bodies.has(body.id)) return false;
    body.health = Math.max(0, body.health - amount);
    body.lastDamageTick = this.tick;
    return body.health === 0;
  }

  private damage(body: Body, amount: number, attacker: Attacker): void {
    if (this.hurt(body, amount)) this.destroy(body, attacker);
  }

  private destroy(body: Body, attacker: Attacker): void {
    this.bodies.delete(body.id);
    if (body.kind === 'shape') this.reward(attacker.playerId, body.reward);
    else if (body.kind === 'tank') {
      const player = this.players.get(body.playerId)!;
      player.tank = null;
      player.x = body.x;
      player.y = body.y;
      player.input = null;
      player.respawnTick = this.tick + this.config.respawn.delayTicks;
      this.events.push({
        type: 'death',
        death: {
          playerId: body.playerId,
          tick: this.tick,
          killerName: attacker.name,
          score: body.score,
          level: body.level,
          classId: body.classId,
          respawnTick: player.respawnTick,
        },
      });
      if (attacker.playerId !== body.playerId)
        this.reward(attacker.playerId, 100 + Math.floor(body.score * 0.25));
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
    a.x -= (nx * penetration) / 2;
    a.y -= (ny * penetration) / 2;
    b.x += (nx * penetration) / 2;
    b.y += (ny * penetration) / 2;
    const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (approach > 0) {
      a.vx -= (nx * approach) / 2;
      a.vy -= (ny * approach) / 2;
      b.vx += (nx * approach) / 2;
      b.vy += (ny * approach) / 2;
    }
    this.bound(a);
    this.bound(b);
  }

  private bound(body: Tank | Shape): void {
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
    for (const body of this.bodies.values()) if (body.kind === 'shape') count++;
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
        lastDamageTick: this.tick,
      };
      this.bodies.set(body.id, body);
    }
  }

  snapshotFor(playerId: PlayerId): SnapshotPayload | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;
    const definition = this.definition(player);
    const view = B.view * definition.view;
    const entities: EntityState[] = [];
    const x = player.tank?.x ?? player.x;
    const y = player.tank?.y ?? player.y;
    for (const body of this.bodies.values()) {
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
          ownerId: body.ownerId,
          health: body.health,
          maxHealth: body.maxHealth,
        });
    }
    const floor = scoreForLevel(player.level);
    const ceiling = scoreForLevel(player.level + 1);
    return {
      tick: this.tick,
      ackSeq: player.appliedSeq,
      self: {
        playerId,
        entityId: player.tank?.id ?? null,
        alive: player.tank !== null,
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
    };
  }
}

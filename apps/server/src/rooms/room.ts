import { randomBytes } from 'node:crypto';
import type {
  ModeConfig,
  PlayerCommand,
  PlayerId,
  PlayerInput,
  RoomCode,
  ServerMessage,
} from '@diep-fried/shared';
import { FixedStepClock, type Simulation, type SimulationFactory } from '@diep-fried/sim';

/** Ce que le salon sait d'une connexion : de quoi lui écrire. */
export interface RoomMember {
  name: string;
  /** `droppable` : le message peut être abandonné si le client est en retard (snapshots). */
  send(message: ServerMessage, droppable?: boolean): void;
}

interface Seat {
  member: RoomMember;
  resumeToken: string;
}

/**
 * Un salon : une simulation, ses joueurs et sa boucle temps réel.
 * Le salon traduit entre transport et simulation ; il ne contient aucune règle de jeu.
 */
export class Room {
  private readonly sim: Simulation;
  private readonly clock: FixedStepClock;
  private readonly seats = new Map<PlayerId, Seat>();
  private nextPlayerId = 1;
  private timer: NodeJS.Timeout | null = null;
  private lastTime = 0;
  /** Horodatage (ms) depuis lequel le salon est vide, `null` s'il est occupé. */
  emptySince: number | null;

  constructor(
    readonly code: RoomCode,
    readonly config: ModeConfig,
    simulationFactory: SimulationFactory,
    seed: number,
  ) {
    this.sim = simulationFactory({ config, seed });
    this.clock = new FixedStepClock(config.tickRate);
    this.emptySince = performance.now();
  }

  get playerCount(): number {
    return this.seats.size;
  }

  get isFull(): boolean {
    return this.seats.size >= this.config.maxPlayers;
  }

  get tick(): number {
    return this.sim.tick;
  }

  /** Ajoute un joueur ; renvoie son identifiant et son jeton de reprise, ou `null` si plein. */
  join(member: RoomMember): { playerId: PlayerId; resumeToken: string } | null {
    if (this.isFull) return null;
    const playerId = this.nextPlayerId++;
    const resumeToken = randomBytes(18).toString('base64url');
    this.seats.set(playerId, { member, resumeToken });
    this.sim.addPlayer(playerId, { name: member.name });
    this.emptySince = null;
    this.broadcast({ t: 'notice', text: `${member.name} a rejoint la partie` });
    return { playerId, resumeToken };
  }

  leave(playerId: PlayerId): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    this.seats.delete(playerId);
    this.sim.removePlayer(playerId);
    if (this.seats.size === 0) this.emptySince = performance.now();
    this.broadcast({ t: 'notice', text: `${seat.member.name} a quitté la partie` });
  }

  setInput(playerId: PlayerId, input: PlayerInput): void {
    this.sim.setInput(playerId, input);
  }

  queueCommand(playerId: PlayerId, command: PlayerCommand): void {
    this.sim.queueCommand(playerId, command);
  }

  start(): void {
    if (this.timer) return;
    this.lastTime = performance.now();
    this.timer = setInterval(() => this.update(), this.clock.stepMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private update(): void {
    const now = performance.now();
    const steps = this.clock.advance(now - this.lastTime);
    this.lastTime = now;
    for (let i = 0; i < steps; i++) this.step();
  }

  private step(): void {
    for (const event of this.sim.step()) {
      if (event.type === 'death') {
        this.seats.get(event.death.playerId)?.member.send({ t: 'death', ...event.death });
      }
    }
    if (this.sim.tick % this.config.snapshotInterval !== 0) return;
    for (const [playerId, seat] of this.seats) {
      const snapshot = this.sim.snapshotFor(playerId);
      if (snapshot) seat.member.send({ t: 'snapshot', ...snapshot }, true);
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const seat of this.seats.values()) seat.member.send(message);
  }
}

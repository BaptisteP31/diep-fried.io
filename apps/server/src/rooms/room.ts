import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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
  end(reason: 'closed' | 'kicked'): void;
}

interface Seat {
  member: RoomMember | null;
  name: string;
  tokenHash: Buffer;
  expiresAt: number | null;
  // Séquence interne monotone durant toute la vie du joueur ; séquence client par connexion.
  simSeq: number;
  clientSeq: number;
  acknowledgements: Map<number, number>;
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
    private readonly resumeGraceMs = 15_000,
  ) {
    this.sim = simulationFactory({ config, seed });
    this.clock = new FixedStepClock(config.tickRate);
    this.emptySince = performance.now();
  }

  get playerCount(): number {
    return this.seats.size;
  }

  get totalDroppedMs(): number {
    return this.clock.totalDroppedMs;
  }

  get isFull(): boolean {
    return this.seats.size >= this.config.maxPlayers;
  }

  get tick(): number {
    return this.sim.tick;
  }

  /** Ajoute un joueur ; renvoie son identifiant et son jeton de reprise, ou `null` si plein. */
  join(member: RoomMember): { playerId: PlayerId; resumeToken: string } | null {
    this.expireSeats();
    if (this.isFull) return null;
    const playerId = this.nextPlayerId++;
    const resumeToken = randomBytes(32).toString('base64url');
    this.seats.set(playerId, {
      member,
      name: member.name,
      tokenHash: hashToken(resumeToken),
      expiresAt: null,
      simSeq: 0,
      clientSeq: -1,
      acknowledgements: new Map(),
    });
    this.sim.addPlayer(playerId, { name: member.name });
    this.emptySince = null;
    this.broadcast({ t: 'notice', text: `${member.name} a rejoint la partie` });
    return { playerId, resumeToken };
  }

  /** Jeton bearer : hash conservé en mémoire, comparaison à temps constant, aucun fallback. */
  resume(member: RoomMember, token: string): { playerId: PlayerId; resumeToken: string } | null {
    this.expireSeats();
    const tokenHash = hashToken(token);
    for (const [playerId, seat] of this.seats) {
      if (!timingSafeEqual(seat.tokenHash, tokenHash)) continue;
      const previous = seat.member;
      // Révoquer l'ancienne session avant de la fermer : son événement close ne touche plus ce siège.
      seat.member = member;
      seat.expiresAt = null;
      seat.clientSeq = -1;
      seat.acknowledgements.clear();
      this.neutralize(playerId, seat);
      previous?.end('kicked');
      return { playerId, resumeToken: token };
    }
    return null;
  }

  leave(playerId: PlayerId, member: RoomMember): void {
    const seat = this.seats.get(playerId);
    if (seat?.member === member) this.removeSeat(playerId, seat);
  }

  disconnect(playerId: PlayerId, member: RoomMember): void {
    const seat = this.seats.get(playerId);
    if (!seat || seat.member !== member) return;
    seat.member = null;
    seat.expiresAt = performance.now() + this.resumeGraceMs;
    this.neutralize(playerId, seat);
    this.expireSeats();
  }

  setInput(playerId: PlayerId, member: RoomMember, input: PlayerInput): void {
    const seat = this.seats.get(playerId);
    if (!seat || seat.member !== member || input.seq <= seat.clientSeq) return;
    seat.clientSeq = input.seq;
    const seq = ++seat.simSeq;
    seat.acknowledgements.set(seq, input.seq);
    this.sim.setInput(playerId, { ...input, seq });
  }

  queueCommand(playerId: PlayerId, member: RoomMember, command: PlayerCommand): void {
    if (this.seats.get(playerId)?.member === member) this.sim.queueCommand(playerId, command);
  }

  private neutralize(playerId: PlayerId, seat: Seat): void {
    this.sim.setInput(playerId, {
      seq: ++seat.simSeq,
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      fire: false,
      alt: false,
    });
  }

  private expireSeats(): void {
    const now = performance.now();
    for (const [playerId, seat] of this.seats) {
      if (seat.expiresAt !== null && now >= seat.expiresAt) this.removeSeat(playerId, seat);
    }
  }

  private removeSeat(playerId: PlayerId, seat: Seat): void {
    this.seats.delete(playerId);
    this.sim.removePlayer(playerId);
    if (this.seats.size === 0) this.emptySince = performance.now();
    this.broadcast({ t: 'notice', text: `${seat.name} a quitté la partie` });
  }

  start(): void {
    if (this.timer) return;
    this.lastTime = performance.now();
    this.timer = setInterval(() => this.update(), this.clock.stepMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const [playerId, seat] of this.seats) {
      seat.member?.end('closed');
      this.sim.removePlayer(playerId);
    }
    this.seats.clear();
  }

  private update(): void {
    this.expireSeats();
    const now = performance.now();
    const steps = this.clock.advance(now - this.lastTime);
    this.lastTime = now;
    for (let i = 0; i < steps; i++) this.step();
  }

  private step(): void {
    for (const event of this.sim.step()) {
      if (event.type === 'death') {
        this.seats.get(event.death.playerId)?.member?.send({ t: 'death', ...event.death });
      }
    }
    if (this.sim.tick % this.config.snapshotInterval !== 0) return;
    for (const [playerId, seat] of this.seats) {
      if (!seat.member) continue;
      const snapshot = this.sim.snapshotFor(playerId);
      if (snapshot) {
        const ackSeq = seat.acknowledgements.get(snapshot.ackSeq) ?? 0;
        // Conserver l'acquittement courant pour les snapshots suivants, purger les anciens.
        for (const seq of seat.acknowledgements.keys()) {
          if (seq < snapshot.ackSeq) seat.acknowledgements.delete(seq);
        }
        seat.member.send({ t: 'snapshot', ...snapshot, ackSeq }, true);
      }
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const seat of this.seats.values()) seat.member?.send(message);
  }
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

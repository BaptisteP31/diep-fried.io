import { randomInt } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  resolveModeConfig,
  type ModeId,
  type RoomCode,
  type RoomOptions,
} from '@diep-fried/shared';
import type { SimulationFactory } from '@diep-fried/sim';
import { Room } from './room';

export class RoomManager {
  private readonly rooms = new Map<RoomCode, Room>();
  private retiredDroppedMs = 0;
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly options: {
      maxRooms: number;
      emptyRoomTtlMs: number;
      simulationFactory: SimulationFactory;
      resumeGraceMs: number;
    },
  ) {
    this.sweeper = setInterval(() => this.closeExpiredRooms(), 5_000);
    this.sweeper.unref();
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get totalDroppedMs(): number {
    let total = this.retiredDroppedMs;
    for (const room of this.rooms.values()) total += room.totalDroppedMs;
    return total;
  }

  get playerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.playerCount;
    return total;
  }

  /** Crée et démarre un salon, ou renvoie `null` si la limite de salons est atteinte. */
  create(mode: ModeId, options: RoomOptions): Room | null {
    if (this.rooms.size >= this.options.maxRooms) return null;
    const code = this.uniqueCode();
    const room = new Room(
      code,
      resolveModeConfig(mode, options),
      this.options.simulationFactory,
      randomInt(2 ** 32),
      this.options.resumeGraceMs,
    );
    this.rooms.set(code, room);
    room.start();
    return room;
  }

  get(code: RoomCode): Room | undefined {
    return this.rooms.get(code);
  }

  closeAll(): void {
    for (const room of this.rooms.values()) {
      room.stop();
      this.retiredDroppedMs += room.totalDroppedMs;
    }
    this.rooms.clear();
    clearInterval(this.sweeper);
  }

  private closeExpiredRooms(): void {
    const now = performance.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince >= this.options.emptyRoomTtlMs) {
        room.stop();
        this.retiredDroppedMs += room.totalDroppedMs;
        this.rooms.delete(code);
      }
    }
  }

  private uniqueCode(): RoomCode {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}

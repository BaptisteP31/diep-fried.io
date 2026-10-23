import type { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  encodeMessage,
  type ClientMessage,
  type ErrorCode,
  type PlayerId,
  type ServerMessage,
} from '@diep-fried/shared';
import type { Room } from '../rooms/room';
import type { RoomManager } from '../rooms/room-manager';

/** Au-delà de ce volume en attente d'envoi, les messages abandonnables sont sautés. */
const MAX_BUFFERED_BYTES = 256 * 1024;
const DEFAULT_NAME = 'Sans nom';

type SessionState =
  { phase: 'handshake' } | { phase: 'lobby' } | { phase: 'room'; room: Room; playerId: PlayerId };

/**
 * Cycle de vie d'une connexion : poignée de main, salle d'attente, salon.
 * Valide et route les messages ; ne connaît pas les règles du jeu.
 */
export class Session {
  private state: SessionState = { phase: 'handshake' };

  constructor(
    private readonly socket: WebSocket,
    private readonly rooms: RoomManager,
    private readonly serverVersion: string,
  ) {
    socket.on('message', (data, isBinary) => {
      if (isBinary) return this.error('bad_message', 'message binaire non supporté', true);
      this.handle(data.toString());
    });
    socket.on('close', () => this.leaveRoom());
  }

  private handle(raw: string): void {
    const decoded = decodeClientMessage(raw);
    if (!decoded.ok) return this.error('bad_message', decoded.error, false);
    const message = decoded.message;
    if (message.t === 'ping') {
      const tick = this.state.phase === 'room' ? this.state.room.tick : null;
      return this.send({ t: 'pong', id: message.id, tick });
    }
    switch (this.state.phase) {
      case 'handshake':
        return this.handleHandshake(message);
      case 'lobby':
        return this.handleLobby(message);
      case 'room':
        return this.handleRoom(message, this.state.room, this.state.playerId);
    }
  }

  private handleHandshake(message: ClientMessage): void {
    if (message.t !== 'hello') return this.error('unexpected_message', 'hello attendu', true);
    if (message.protocol !== PROTOCOL_VERSION) {
      return this.error(
        'protocol_mismatch',
        `protocole ${message.protocol} non supporté, version attendue ${PROTOCOL_VERSION}`,
        true,
      );
    }
    this.state = { phase: 'lobby' };
    this.send({ t: 'welcome', protocol: PROTOCOL_VERSION, server: this.serverVersion });
  }

  private handleLobby(message: ClientMessage): void {
    switch (message.t) {
      case 'room.create': {
        const room = this.rooms.create(message.mode, message.options);
        if (!room) return this.error('server_full', 'nombre maximal de salons atteint', false);
        return this.enterRoom(room, message.name);
      }
      case 'room.join': {
        // `resumeToken` est accepté par le protocole mais la reprise n'est pas encore implémentée.
        const room = this.rooms.get(message.code);
        if (!room) return this.error('room_not_found', `salon ${message.code} introuvable`, false);
        return this.enterRoom(room, message.name);
      }
      default:
        return this.error('unexpected_message', `${message.t} reçu hors salon`, false);
    }
  }

  private handleRoom(message: ClientMessage, room: Room, playerId: PlayerId): void {
    switch (message.t) {
      case 'input':
        return room.setInput(playerId, message.input);
      case 'command':
        return room.queueCommand(playerId, message.command);
      case 'room.leave':
        this.leaveRoom();
        this.state = { phase: 'lobby' };
        return this.send({ t: 'room.left', reason: 'requested' });
      default:
        return this.error('unexpected_message', `${message.t} reçu en salon`, false);
    }
  }

  private enterRoom(room: Room, requestedName: string): void {
    const name = requestedName || DEFAULT_NAME;
    const seat = room.join({ name, send: (message, droppable) => this.send(message, droppable) });
    if (!seat) return this.error('room_full', `salon ${room.code} complet`, false);
    this.state = { phase: 'room', room, playerId: seat.playerId };
    this.send({
      t: 'room.joined',
      code: room.code,
      playerId: seat.playerId,
      config: room.config,
      resumeToken: seat.resumeToken,
    });
  }

  private leaveRoom(): void {
    if (this.state.phase !== 'room') return;
    this.state.room.leave(this.state.playerId);
    this.state = { phase: 'lobby' };
  }

  private send(message: ServerMessage, droppable = false): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    if (droppable && this.socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
    this.socket.send(encodeMessage(message));
  }

  private error(code: ErrorCode, message: string, fatal: boolean): void {
    this.send({ t: 'error', code, message, fatal });
    if (fatal) this.socket.close(1008, code);
  }
}

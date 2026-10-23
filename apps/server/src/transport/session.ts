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
import type { Room, RoomMember } from '../rooms/room';
import type { NetworkConfig } from '../config';
import type { NetworkMetrics } from './metrics';
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
  private member: RoomMember | null = null;
  private closing = false;
  private closeTimer: NodeJS.Timeout | null = null;
  private tokens: number;
  private lastRefill = performance.now();

  constructor(
    private readonly socket: WebSocket,
    private readonly rooms: RoomManager,
    private readonly serverVersion: string,
    private readonly limits: NetworkConfig,
    private readonly metrics: NetworkMetrics,
  ) {
    this.tokens = limits.messageBurst;
    socket.on('message', (data, isBinary) => {
      metrics.bytesReceived += Array.isArray(data)
        ? data.reduce((total, part) => total + part.byteLength, 0)
        : data.byteLength;
      if (this.closing) return;
      const now = performance.now();
      this.tokens = Math.min(
        limits.messageBurst,
        this.tokens + ((now - this.lastRefill) * limits.messagesPerSecond) / 1000,
      );
      this.lastRefill = now;
      if (this.tokens < 1) {
        metrics.rateLimited++;
        return this.error('rate_limited', 'trop de messages', true);
      }
      this.tokens--;
      if (isBinary) return this.error('bad_message', 'message binaire non supporté', true);
      this.handle(data.toString());
    });
    // ws émet error avant close pour les trames invalides et dépassements de maxPayload.
    socket.on('error', () => {});
    socket.on('close', () => {
      this.closing = true;
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.leaveRoom(true);
    });
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
        const room = this.rooms.get(message.code);
        if (!room) return this.error('room_not_found', `salon ${message.code} introuvable`, false);
        return this.enterRoom(room, message.name, message.resumeToken);
      }
      default:
        return this.error('unexpected_message', `${message.t} reçu hors salon`, false);
    }
  }

  private handleRoom(message: ClientMessage, room: Room, playerId: PlayerId): void {
    switch (message.t) {
      case 'input':
        if (this.member) room.setInput(playerId, this.member, message.input);
        return;
      case 'command':
        if (this.member) room.queueCommand(playerId, this.member, message.command);
        return;
      case 'room.leave':
        this.leaveRoom();
        this.state = { phase: 'lobby' };
        return this.send({ t: 'room.left', reason: 'requested' });
      default:
        return this.error('unexpected_message', `${message.t} reçu en salon`, false);
    }
  }

  private enterRoom(room: Room, requestedName: string, resumeToken?: string): void {
    const member: RoomMember = {
      name: requestedName || DEFAULT_NAME,
      send: (message, droppable) => this.send(message, droppable),
      end: (reason) => {
        this.state = { phase: 'lobby' };
        this.member = null;
        this.send({ t: 'room.left', reason });
        if (reason === 'kicked') this.closeSocket(1008, 'session replaced');
      },
    };
    const seat = resumeToken === undefined ? room.join(member) : room.resume(member, resumeToken);
    if (!seat) {
      return resumeToken === undefined
        ? this.error('room_full', `salon ${room.code} complet`, false)
        : this.error('bad_message', 'jeton de reprise invalide ou expiré', false);
    }
    this.member = member;
    this.state = { phase: 'room', room, playerId: seat.playerId };
    this.send({
      t: 'room.joined',
      code: room.code,
      playerId: seat.playerId,
      config: room.config,
      resumeToken: seat.resumeToken,
    });
  }

  private leaveRoom(disconnected = false): void {
    if (this.state.phase !== 'room' || !this.member) return;
    const { room, playerId } = this.state;
    if (disconnected) room.disconnect(playerId, this.member);
    else room.leave(playerId, this.member);
    this.state = { phase: 'lobby' };
    this.member = null;
  }

  private send(message: ServerMessage, droppable = false): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    if (droppable && this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.metrics.snapshotsDropped++;
      return;
    }
    const raw = encodeMessage(message);
    this.socket.send(raw, (error) => {
      if (error) return;
      this.metrics.bytesSent += Buffer.byteLength(raw);
      if (message.t === 'snapshot') this.metrics.snapshotsSent++;
    });
  }

  private error(code: ErrorCode, message: string, fatal: boolean): void {
    this.send({ t: 'error', code, message, fatal });
    if (fatal) this.closeSocket(1008, code);
  }

  shutdown(): void {
    this.closeSocket(1001, 'server shutdown');
  }

  private closeSocket(code: number, reason: string): void {
    if (this.closing) return;
    this.closing = true;
    this.socket.close(code, reason);
    this.closeTimer = setTimeout(() => this.socket.terminate(), this.limits.shutdownTimeoutMs);
    this.closeTimer.unref();
  }
}

import type { DeathInfo, PlayerCommand, PlayerInput, SnapshotPayload } from '../model/player';
import type { ModeConfig, ModeId, RoomOptions } from '../model/mode';
import type { PlayerId, Tick } from '../model/ids';
import type { RoomCode } from './limits';

/**
 * Messages échangés sur la WebSocket, discriminés par `t`.
 * Séquence : `hello` -> `welcome`, puis `room.create` ou `room.join` -> `room.joined`,
 * puis flux `input`/`command` montant et `snapshot`/`death`/`notice` descendant.
 */

// ---------------------------------------------------------------- client -> serveur

export interface HelloMessage {
  t: 'hello';
  protocol: number;
  /** Identification libre du client (version de build), pour les journaux. */
  client: string;
}

export interface CreateRoomMessage {
  t: 'room.create';
  name: string;
  mode: ModeId;
  options: RoomOptions;
}

export interface JoinRoomMessage {
  t: 'room.join';
  code: RoomCode;
  name: string;
  /** Jeton reçu dans `room.joined` pour reprendre son joueur après une déconnexion. */
  resumeToken?: string;
}

export interface LeaveRoomMessage {
  t: 'room.leave';
}

export interface InputMessage {
  t: 'input';
  input: PlayerInput;
}

export interface CommandMessage {
  t: 'command';
  command: PlayerCommand;
}

export interface PingMessage {
  t: 'ping';
  id: number;
}

export type ClientMessage =
  | HelloMessage
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | InputMessage
  | CommandMessage
  | PingMessage;

// ---------------------------------------------------------------- serveur -> client

export interface WelcomeMessage {
  t: 'welcome';
  protocol: number;
  /** Identification du serveur (version de build). */
  server: string;
}

export interface RoomJoinedMessage {
  t: 'room.joined';
  code: RoomCode;
  playerId: PlayerId;
  config: ModeConfig;
  /** À conserver par le client pour `JoinRoomMessage.resumeToken`. */
  resumeToken: string;
}

export interface RoomLeftMessage {
  t: 'room.left';
  reason: 'requested' | 'closed' | 'kicked';
}

export interface SnapshotMessage extends SnapshotPayload {
  t: 'snapshot';
}

export interface DeathMessage extends DeathInfo {
  t: 'death';
}

/** Information affichable (arrivée, départ, élimination). */
export interface NoticeMessage {
  t: 'notice';
  text: string;
}

export interface PongMessage {
  t: 'pong';
  id: number;
  /** Tick courant du salon, ou `null` hors salon. */
  tick: Tick | null;
}

export type ErrorCode =
  | 'protocol_mismatch'
  | 'bad_message'
  | 'unexpected_message'
  | 'room_not_found'
  | 'room_full'
  | 'server_full'
  | 'rate_limited';

export interface ErrorMessage {
  t: 'error';
  code: ErrorCode;
  message: string;
  /** Vrai si le serveur ferme la connexion après ce message. */
  fatal: boolean;
}

export type ServerMessage =
  | WelcomeMessage
  | RoomJoinedMessage
  | RoomLeftMessage
  | SnapshotMessage
  | DeathMessage
  | NoticeMessage
  | PongMessage
  | ErrorMessage;

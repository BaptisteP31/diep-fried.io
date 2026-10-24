import { CLASS_ID_PATTERN } from '../model/ids';
import { isModeId, type RoomOptions } from '../model/mode';
import { SANDBOX_ACTIONS, type PlayerCommand, type PlayerInput } from '../model/player';
import { isStatId } from '../model/stats';
import { LIMITS, isRoomCode, sanitizeName } from './limits';
import type { ClientMessage, JoinRoomMessage, ServerMessage } from './messages';

/**
 * Encodage JSON des messages. Le transport ne manipule que ces fonctions : un passage
 * ultérieur à un format binaire (après mesure) ne touchera ni simulation ni rendu.
 *
 * Les messages client sont non fiables : `decodeClientMessage` valide chaque champ et
 * reconstruit un objet propre (champs inconnus ignorés). Les messages serveur sont
 * produits par notre serveur ; le client ne vérifie que l'enveloppe.
 */

export type DecodeResult<T> = { ok: true; message: T } | { ok: false; error: string };

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

export function decodeServerMessage(raw: string): DecodeResult<ServerMessage> {
  const data = parseJson(raw);
  if (!isRecord(data) || typeof data.t !== 'string') return fail('enveloppe invalide');
  return { ok: true, message: data as unknown as ServerMessage };
}

export function decodeClientMessage(raw: string): DecodeResult<ClientMessage> {
  // Garde-fou en unités UTF-16 ; la limite en octets est appliquée par le transport.
  if (raw.length > LIMITS.maxClientMessageBytes) return fail('message trop long');
  const data = parseJson(raw);
  if (!isRecord(data) || typeof data.t !== 'string') return fail('enveloppe invalide');
  try {
    return { ok: true, message: readClientMessage(data) };
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message);
    throw error;
  }
}

function readClientMessage(data: Record<string, unknown>): ClientMessage {
  switch (data.t) {
    case 'hello':
      return {
        t: 'hello',
        protocol: readInteger(data.protocol, 'protocol', 0),
        client: readString(data.client, 'client', 64),
      };
    case 'room.create':
      if (!isModeId(data.mode)) throw new ValidationError('mode inconnu');
      return {
        t: 'room.create',
        name: readName(data.name),
        mode: data.mode,
        options: readRoomOptions(data.options),
      };
    case 'room.join': {
      if (!isRoomCode(data.code)) throw new ValidationError('code de salon invalide');
      const message: JoinRoomMessage = {
        t: 'room.join',
        code: data.code,
        name: readName(data.name),
      };
      if (data.resumeToken !== undefined) {
        message.resumeToken = readString(data.resumeToken, 'resumeToken', 128);
      }
      return message;
    }
    case 'room.leave':
      return { t: 'room.leave' };
    case 'input':
      return { t: 'input', input: readInput(data.input) };
    case 'command':
      return { t: 'command', command: readCommand(data.command) };
    case 'ping':
      return { t: 'ping', id: readInteger(data.id, 'id', 0) };
    default:
      throw new ValidationError(`type de message inconnu`);
  }
}

function readInput(value: unknown): PlayerInput {
  if (!isRecord(value)) throw new ValidationError('input invalide');
  const move = readVec(value.move, 'move');
  const aim = readVec(value.aim, 'aim');
  if (Math.abs(move.x) > 1 || Math.abs(move.y) > 1) throw new ValidationError('move hors bornes');
  if (Math.hypot(aim.x, aim.y) > LIMITS.maxAimDistance)
    throw new ValidationError('aim hors bornes');
  return {
    seq: readInteger(value.seq, 'seq', 0),
    move,
    aim,
    fire: readBoolean(value.fire, 'fire'),
    alt: readBoolean(value.alt, 'alt'),
  };
}

function readCommand(value: unknown): PlayerCommand {
  if (!isRecord(value)) throw new ValidationError('commande invalide');
  switch (value.type) {
    case 'upgradeStat':
      if (!isStatId(value.stat)) throw new ValidationError('statistique inconnue');
      return { type: 'upgradeStat', stat: value.stat };
    case 'chooseClass':
      if (typeof value.classId !== 'string' || !CLASS_ID_PATTERN.test(value.classId)) {
        throw new ValidationError('classe invalide');
      }
      return { type: 'chooseClass', classId: value.classId };
    case 'respawn':
      return { type: 'respawn' };
    case 'sandbox':
      return {
        type: 'sandbox',
        action: readEnum(value.action, 'sandbox.action', SANDBOX_ACTIONS),
      };
    case 'possess':
      return { type: 'possess' };
    default:
      throw new ValidationError('commande inconnue');
  }
}

function readRoomOptions(value: unknown): RoomOptions {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new ValidationError('options invalides');
  const options: RoomOptions = {};
  if (value.maxPlayers !== undefined)
    options.maxPlayers = readInteger(value.maxPlayers, 'maxPlayers', 1);
  if (value.arenaSize !== undefined) {
    options.arenaSize = readEnum(value.arenaSize, 'arenaSize', ['small', 'medium', 'large']);
  }
  if (value.shapeDensity !== undefined) {
    options.shapeDensity = readEnum(value.shapeDensity, 'shapeDensity', ['low', 'normal', 'high']);
  }
  if (value.botCount !== undefined) {
    const botCount = readInteger(value.botCount, 'botCount', 0);
    if (botCount > 12) throw new ValidationError('botCount invalide');
    options.botCount = botCount;
  }
  if (value.botDifficulty !== undefined) {
    options.botDifficulty = readEnum(value.botDifficulty, 'botDifficulty', [
      'easy',
      'normal',
      'hard',
    ]);
  }
  return options;
}

function readName(value: unknown): string {
  // Un nom vide est accepté : le serveur attribue alors un nom par défaut.
  return sanitizeName(readString(value, 'name', 256));
}

// ---------------------------------------------------------------- primitives

class ValidationError extends Error {}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ValidationError(`${field} invalide`);
  }
  return value;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`${field} invalide`);
  return value;
}

function readInteger(value: unknown, field: string, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new ValidationError(`${field} invalide`);
  }
  return value;
}

function readVec(value: unknown, field: string): { x: number; y: number } {
  if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new ValidationError(`${field} invalide`);
  }
  return { x: value.x as number, y: value.y as number };
}

function readEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} invalide`);
  }
  return value as T;
}

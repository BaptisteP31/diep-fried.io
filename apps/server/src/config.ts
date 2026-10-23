import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface NetworkConfig {
  resumeGraceMs: number;
  messagesPerSecond: number;
  messageBurst: number;
  maxConnectionsPerIp: number;
  /** null : même hôte que la requête ; tableau : origines exactes autorisées. */
  allowedOrigins: readonly string[] | null;
  allowNoOrigin: boolean;
  heartbeatIntervalMs: number;
  shutdownTimeoutMs: number;
}

/** Choix d'exploitation à calibrer, indépendants du gameplay. */
export const NETWORK_DEFAULTS: NetworkConfig = {
  resumeGraceMs: 15_000,
  messagesPerSecond: 120,
  messageBurst: 240,
  maxConnectionsPerIp: 16,
  allowedOrigins: null,
  allowNoOrigin: true,
  heartbeatIntervalMs: 15_000,
  shutdownTimeoutMs: 2_000,
};

export interface ServerConfig extends Partial<NetworkConfig> {
  host: string;
  port: number;
  /** Répertoire du client construit, servi en statique ; `null` pour ne servir que l'API. */
  staticDir: string | null;
  maxRooms: number;
  /** Durée de vie d'un salon vide avant fermeture. */
  emptyRoomTtlMs: number;
  /** Identification de build annoncée dans `welcome` et `/healthz`. */
  version: string;
}

/** Même profondeur depuis `src/` (tsx) et `dist/` (bundle) : `apps/client/dist`. */
const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../../client/dist/', import.meta.url));

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const staticDir = env.STATIC_DIR ?? DEFAULT_STATIC_DIR;
  return {
    ...NETWORK_DEFAULTS,
    host: env.HOST ?? '0.0.0.0',
    port: readInt(env.PORT, 8080, 'PORT'),
    staticDir: staticDir !== '' && existsSync(staticDir) ? staticDir : null,
    maxRooms: readInt(env.MAX_ROOMS, 32, 'MAX_ROOMS'),
    emptyRoomTtlMs: readInt(env.EMPTY_ROOM_TTL_MS, 60_000, 'EMPTY_ROOM_TTL_MS'),
    version: env.DIEP_FRIED_VERSION ?? 'dev',
    resumeGraceMs: readInt(env.RESUME_GRACE_MS, NETWORK_DEFAULTS.resumeGraceMs, 'RESUME_GRACE_MS'),
    messagesPerSecond: readPositive(
      env.MESSAGES_PER_SECOND,
      NETWORK_DEFAULTS.messagesPerSecond,
      'MESSAGES_PER_SECOND',
    ),
    messageBurst: readPositive(env.MESSAGE_BURST, NETWORK_DEFAULTS.messageBurst, 'MESSAGE_BURST'),
    maxConnectionsPerIp: readPositive(
      env.MAX_CONNECTIONS_PER_IP,
      NETWORK_DEFAULTS.maxConnectionsPerIp,
      'MAX_CONNECTIONS_PER_IP',
    ),
    allowedOrigins: readOrigins(env.ALLOWED_ORIGINS),
    allowNoOrigin: readBoolean(env.ALLOW_NO_ORIGIN, true, 'ALLOW_NO_ORIGIN'),
    heartbeatIntervalMs: readPositive(
      env.HEARTBEAT_INTERVAL_MS,
      NETWORK_DEFAULTS.heartbeatIntervalMs,
      'HEARTBEAT_INTERVAL_MS',
    ),
    shutdownTimeoutMs: readPositive(
      env.SHUTDOWN_TIMEOUT_MS,
      NETWORK_DEFAULTS.shutdownTimeoutMs,
      'SHUTDOWN_TIMEOUT_MS',
    ),
  };
}

function readPositive(value: string | undefined, fallback: number, name: string): number {
  const result = readInt(value, fallback, name);
  if (result === 0) throw new Error(`${name} doit être supérieur à zéro`);
  return result;
}

function readBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} doit être true ou false`);
}

function readOrigins(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
        throw new Error(`ALLOWED_ORIGINS attend des origines HTTP(S) exactes : ${origin}`);
      }
      return origin;
    });
}

function readInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} doit être un entier positif (reçu « ${value} »)`);
  }
  return parsed;
}

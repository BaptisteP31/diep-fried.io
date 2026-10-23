import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
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
    host: env.HOST ?? '0.0.0.0',
    port: readInt(env.PORT, 8080, 'PORT'),
    staticDir: staticDir !== '' && existsSync(staticDir) ? staticDir : null,
    maxRooms: readInt(env.MAX_ROOMS, 32, 'MAX_ROOMS'),
    emptyRoomTtlMs: readInt(env.EMPTY_ROOM_TTL_MS, 60_000, 'EMPTY_ROOM_TTL_MS'),
    version: env.DIEP_FRIED_VERSION ?? 'dev',
  };
}

function readInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} doit être un entier positif (reçu « ${value} »)`);
  }
  return parsed;
}

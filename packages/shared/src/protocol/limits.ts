/** Bornes de validation partagées par le client (formulaires) et le serveur (contrôle). */
export const LIMITS = {
  /** Taille maximale d'un message client, en octets. */
  maxClientMessageBytes: 4096,
  maxNameLength: 16,
  /** Norme maximale acceptée pour `PlayerInput.aim`. */
  maxAimDistance: 10_000,
} as const;

/** Alphabet des codes de salon : majuscules et chiffres sans caractères ambigus (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export type RoomCode = string;

export function isRoomCode(value: unknown): value is RoomCode {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

/** Normalise une saisie utilisateur de code (casse, espaces). Ne valide pas. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

/** Nettoie un pseudonyme : caractères de contrôle retirés, espaces réduits, longueur bornée. */
export function sanitizeName(input: string): string {
  return Array.from(
    input
      .replace(/\s+/g, ' ')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim(),
  )
    .slice(0, LIMITS.maxNameLength)
    .join('');
}

/**
 * Les huit statistiques améliorables, dans l'ordre des touches 1 à 8.
 * L'ordre est un contrat : il fixe l'index des raccourcis et des tableaux `StatLevels`.
 */
export const STAT_IDS = [
  'healthRegen',
  'maxHealth',
  'bodyDamage',
  'bulletSpeed',
  'bulletPenetration',
  'bulletDamage',
  'reload',
  'movementSpeed',
] as const;

export type StatId = (typeof STAT_IDS)[number];

/** Niveau investi par statistique. */
export type StatLevels = Record<StatId, number>;

export function isStatId(value: unknown): value is StatId {
  return typeof value === 'string' && (STAT_IDS as readonly string[]).includes(value);
}

export function emptyStatLevels(): StatLevels {
  return {
    healthRegen: 0,
    maxHealth: 0,
    bodyDamage: 0,
    bulletSpeed: 0,
    bulletPenetration: 0,
    bulletDamage: 0,
    reload: 0,
    movementSpeed: 0,
  };
}

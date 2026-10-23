/** Coefficients de conception diep-fried.io, à calibrer en partie ; unités seconde/monde. */
export const BALANCE = {
  tankRadius: 25,
  health: 50,
  healthPerLevel: 2,
  healthPerStat: 15,
  speed: 220,
  speedPerStat: 0.08,
  friction: 5,
  stopSpeed: 0.05,
  bodyDamage: 24,
  bodyDamagePerStat: 8,
  regenDelay: 5,
  regen: 1,
  regenPerStat: 0.8,
  spawnProtection: 3,
  reload: 0.5,
  reloadPerStat: 0.9,
  bulletSpeed: 600,
  bulletSpeedPerStat: 0.12,
  bulletDamage: 12,
  bulletDamagePerStat: 3,
  bulletHealth: 14,
  bulletHealthPerStat: 5,
  bulletLifetime: 2.5,
  bulletRadius: 7,
  recoil: 18,
  view: 900,
  viewMargin: 100,
  gridSize: 128,
  bodyStepDistance: 8,
} as const;

/** Courbe originale quadratique : niveau 45 à 23 540 XP (score = XP). */
export function scoreForLevel(level: number): number {
  return Math.round(12 * (level - 1) ** 2 + 7 * (level - 1));
}

/** 27 points aux niveaux 2..28, puis 6 aux niveaux 30,33,36,39,42,45. */
export function pointsForLevel(level: number): number {
  return (
    Math.max(0, Math.min(27, level - 1)) + Math.max(0, Math.floor((Math.min(45, level) - 27) / 3))
  );
}

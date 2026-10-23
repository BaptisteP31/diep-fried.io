import type { BarrelDefinition } from '@diep-fried/shared';

const secondaryBarrel: BarrelDefinition = {
  angle: 0,
  offset: 0,
  length: 1.4,
  width: 0.45,
  delay: 0,
  projectile: 'bullet',
  reload: 1,
  damage: 0.5,
  penetration: 0.65,
  speed: 0.9,
  spread: 0,
  recoil: 0.4,
  lifetime: 1.5,
};

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
  projectilesPerOwner: 512,
  trapsPerOwner: 80,
  missilesPerOwner: 24,
  droneLifetime: 120,
  droneOrbit: 85,
  droneLeash: 1200,
  droneSteering: 6,
  autoRange: 750,
  trapFriction: 4,
  contactReload: 0.35,
  secondaryReload: 0.3,
  gliderTurn: 0.4,
  missileAcceleration: 100,
  fireworkFragments: 16,
  secondaryBarrel,
  fragmentBarrel: { ...secondaryBarrel, damage: 0.8, recoil: 0, lifetime: 1.8 },
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

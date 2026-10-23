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

/**
 * Coefficients **expérimentaux** des modes à objectifs, de l'IA et du nid : conventions de
 * diep-fried.io, sans valeur de référence publique. Unités : secondes et unités monde.
 */
export const OBJECTIVE_BALANCE = {
  /** Distance bord à bord maximale pour `possess`. */
  possessRange: 120,
  /** Drapeau CTF : rayon de prise, et retour automatique d'un drapeau tombé. */
  flagRadius: 40,
  flagReturnSeconds: 30,
  /** Zone de dépôt autour de son propre drapeau à la base. */
  flagCaptureRadius: 120,
  /** Breakout : temps de capture d'un territoire par un seul camp, décroissance sans présence. */
  territoryCaptureSeconds: 8,
  territoryDecayPerSecond: 0.05,
  territoryRadius: 260,
  /** Breakout : points par seconde et par territoire détenu. */
  territoryPointsPerSecond: 1,
} as const;

export const AI_BALANCE = {
  /** Portée d'acquisition des boss et vaisseaux-mères. */
  aggroRange: 1400,
  /** Portée de tir des Dominators. */
  dominatorRange: 950,
  /** Une cible perdue de vue est poursuivie vers sa dernière position pendant ce délai. */
  memorySeconds: 3,
  /** Changement de point d'errance. */
  wanderSeconds: 6,
  /** Fallen Overlord / Mothership : distance de combat conservée. */
  standoff: 420,
  /** Mothership : rayon d'action autour de son point d'ancrage. */
  mothershipLeash: 900,
  /** Bornes dures de population IA. */
  maxBosses: 8,
  /** Crashers : acquisition, vitesse de charge, retour au nid au-delà de cette marge. */
  crasherAggro: 520,
  crasherSpeed: 190,
  crasherNestMargin: 500,
  crasherContact: 24,
  alphaContact: 30,
} as const;

/** Formes du nid et variantes rares : valeurs communautaires du catalogue, à valider. */
export const SHAPE_BALANCE = {
  alphaPentagon: { health: 3000, reward: 3000, radius: 75 },
  crasher: { health: 15, reward: 15, radius: 14 },
  /** Variantes vertes : santé/XP du catalogue (`green-square`...). */
  shiny: {
    square: { health: 1000, reward: 1000 },
    triangle: { health: 3000, reward: 2500 },
    pentagon: { health: 10_000, reward: 13_000 },
  },
} as const;

import type { ClassId } from '../model/ids';
import type { ProjectileFamily } from '../model/entities';
import type { StatLevels } from '../model/stats';

/**
 * Définitions de classes de tanks, partagées par la simulation (comportement) et le client
 * (géométrie du rendu, arbre d'évolution). Toutes les valeurs sont des choix de diep-fried.io,
 * à calibrer ; aucune n'est une mesure du jeu original.
 */

/**
 * Canon, dans le repère local du tank : +x = direction de visée, unités relatives au rayon du corps.
 */
export interface BarrelDefinition {
  /** Décalage angulaire par rapport à la visée, en radians. */
  angle: number;
  /** Décalage latéral (axe y local). */
  offset: number;
  /** Longueur depuis le centre du corps. */
  length: number;
  /** Largeur à la base. */
  width: number;
  /** Largeur à la bouche, si différente (canon évasé ou rétréci). */
  tipWidth?: number;
  /** Fraction du cycle de rechargement avant le premier tir (alternance Twin), 0..1. */
  delay: number;
  projectile: ProjectileFamily;
  /** Multiplicateurs appliqués aux valeurs issues des statistiques ; 1 = référence. */
  reload: number;
  damage: number;
  penetration: number;
  speed: number;
  /** Dispersion aléatoire maximale, en radians. */
  spread: number;
  recoil: number;
  /** Nombre de plombs simultanés (un seul événement de recul/rechargement). */
  pellets?: number;
  /** Canon autonome : cible hostile la plus proche dans la portée. */
  auto?: boolean;
  /** Drone non guidé par la souris (Hybrid, Overtrapper, moitié Battleship). */
  autonomous?: boolean;
  /** Convertit les carrés au contact au lieu de produire des drones. */
  conversionOnly?: boolean;
  /** Réglages de durée/rayon indépendants de la géométrie du canon. */
  lifetime?: number;
  radius?: number;
  missile?: 'skimmer' | 'rocketeer' | 'glider' | 'firework';
}

export interface ClassDefinition {
  id: ClassId;
  name: string;
  /** Niveau requis pour choisir cette classe. */
  level: number;
  upgradesTo: ClassId[];
  barrels: BarrelDefinition[];
  /** Plafonds par statistique ; les absents valent `DEFAULT_STAT_CAP`. */
  statCaps?: Partial<StatLevels>;
  /** Multiplicateur du champ de vision. */
  view: number;
  /** Multiplicateur de vitesse de déplacement. */
  speed: number;
  /** Réservé aux familles à drones : population maximale contrôlée. */
  droneLimit?: number;
  /** Bonus par point de Reload (Necromancer : 14 + 4 × Reload). */
  dronesPerReload?: number;
  bodyHealth?: number;
  bodyDamage?: number;
  /** Masse relative pour les impulsions de contact. */
  mass?: number;
  /** Délai immobile puis durée du fondu, en secondes. */
  stealth?: { delay: number; fade: number };
  /** Décalage caméra demandé par Alt ; contrat de rendu optionnel sur TankState. */
  altCameraDistance?: number;
}

export const DEFAULT_STAT_CAP = 7;

export const STARTING_CLASS: ClassId = 'tank';

// Géométries relatives au rayon ; multiplicateurs de conception, tous calibrables.
const barrel = (patch: Partial<BarrelDefinition> = {}): BarrelDefinition => ({
  angle: 0,
  offset: 0,
  length: 1.9,
  width: 0.84,
  delay: 0,
  projectile: 'bullet',
  reload: 1,
  damage: 1,
  penetration: 1,
  speed: 1,
  spread: 0,
  recoil: 1,
  ...patch,
});
const twin = (angle = 0): BarrelDefinition[] => [
  barrel({ angle, offset: -0.5, width: 0.64, damage: 0.7, recoil: 0.65 }),
  barrel({ angle, offset: 0.5, width: 0.64, damage: 0.7, recoil: 0.65, delay: 0.5 }),
];
const sniper = (patch: Partial<BarrelDefinition> = {}) =>
  barrel({
    length: 2.4,
    reload: 1.6,
    damage: 1.5,
    penetration: 1.4,
    speed: 1.5,
    ...patch,
  });
const machine = (patch: Partial<BarrelDefinition> = {}) =>
  barrel({
    width: 0.65,
    tipWidth: 1.1,
    reload: 0.4,
    damage: 0.6,
    spread: 0.16,
    recoil: 0.45,
    ...patch,
  });
const heavy = (patch: Partial<BarrelDefinition> = {}) =>
  barrel({
    width: 1.7,
    reload: 2.4,
    damage: 5,
    penetration: 3.5,
    speed: 0.75,
    recoil: 5,
    ...patch,
  });
const drone = (angle: number, patch: Partial<BarrelDefinition> = {}) =>
  barrel({
    angle,
    projectile: 'drone',
    width: 1,
    reload: 2,
    damage: 2,
    penetration: 4,
    speed: 0.48,
    recoil: 0,
    ...patch,
  });
const trap = (angle = 0, patch: Partial<BarrelDefinition> = {}) =>
  barrel({
    angle,
    projectile: 'trap',
    length: 2,
    width: 1,
    tipWidth: 1.5,
    reload: 1.6,
    damage: 2,
    penetration: 4,
    speed: 0.7,
    recoil: 0.8,
    lifetime: 30,
    ...patch,
  });
const auto = (angle: number) =>
  barrel({ angle, auto: true, length: 1.3, width: 0.58, reload: 1.2, damage: 0.65, recoil: 0.15 });
const radial = (
  count: number,
  make: (angle: number) => BarrelDefinition = (angle) => barrel({ angle }),
) => Array.from({ length: count }, (_, i) => make((i * Math.PI * 2) / count));
const fan = (count: number, arc: number) =>
  Array.from({ length: count }, (_, i) =>
    barrel({
      angle: (i / (count - 1) - 0.5) * arc,
      damage: 0.65,
      recoil: 0.6,
      delay: (i % 2) * 0.5,
    }),
  );
const gunner = () =>
  Array.from({ length: 4 }, (_, i) =>
    barrel({
      offset: (i - 1.5) * 0.33,
      length: i % 2 ? 2 : 1.6,
      width: 0.3,
      reload: 0.7,
      damage: 0.4,
      penetration: 0.65,
      delay: i / 4,
      recoil: 0.4,
    }),
  );
const shotgun = (pellets: number, patch: Partial<BarrelDefinition> = {}) =>
  barrel({
    pellets,
    reload: 2.4,
    damage: 0.45,
    penetration: 0.55,
    spread: 0.24,
    radius: 3,
    speed: 1.1,
    recoil: 5,
    ...patch,
  });
const thruster = (angle: number) =>
  barrel({ angle, length: 1.5, width: 0.65, damage: 0.5, penetration: 0.7, recoil: 2.2 });
const smasherCaps: Partial<StatLevels> = {
  healthRegen: 10,
  maxHealth: 10,
  bodyDamage: 10,
  movementSpeed: 10,
  bulletSpeed: 0,
  bulletPenetration: 0,
  bulletDamage: 0,
  reload: 0,
};
const smasherBody = { statCaps: smasherCaps, bodyHealth: 1.35, bodyDamage: 1.6, mass: 1.5 };

// Arêtes du catalogue : autorisent les sauts Tank→Smasher/Auto Tank uniquement au niveau requis.
const tree: Record<string, { name: string; level: number; upgradesTo: ClassId[] }> = {
  tank: {
    name: 'Tank',
    level: 1,
    upgradesTo: ['twin', 'sniper', 'machine-gun', 'flank-guard', 'smasher', 'auto-tank'],
  },
  twin: {
    name: 'Twin',
    level: 15,
    upgradesTo: ['triple-shot', 'quad-tank', 'twin-flank'],
  },
  sniper: {
    name: 'Sniper',
    level: 15,
    upgradesTo: ['assassin', 'overseer', 'hunter', 'trapper'],
  },
  'machine-gun': {
    name: 'Machine Gun',
    level: 15,
    upgradesTo: ['destroyer', 'gunner', 'shotgun', 'sprayer'],
  },
  'flank-guard': {
    name: 'Flank Guard',
    level: 15,
    upgradesTo: ['tri-angle', 'quad-tank', 'twin-flank', 'auto-3'],
  },
  'triple-shot': {
    name: 'Triple Shot',
    level: 30,
    upgradesTo: ['triplet', 'penta-shot', 'spread-shot'],
  },
  'quad-tank': {
    name: 'Quad Tank',
    level: 30,
    upgradesTo: ['octo-tank', 'auto-5'],
  },
  'twin-flank': {
    name: 'Twin Flank',
    level: 30,
    upgradesTo: ['triple-twin', 'battleship'],
  },
  assassin: {
    name: 'Assassin',
    level: 30,
    upgradesTo: ['ranger', 'stalker'],
  },
  overseer: {
    name: 'Overseer',
    level: 30,
    upgradesTo: ['overlord', 'necromancer', 'manager', 'overtrapper', 'battleship', 'factory'],
  },
  hunter: {
    name: 'Hunter',
    level: 30,
    upgradesTo: ['predator', 'streamliner'],
  },
  trapper: {
    name: 'Trapper',
    level: 30,
    upgradesTo: ['tri-trapper', 'gunner-trapper', 'overtrapper', 'mega-trapper', 'auto-trapper'],
  },
  destroyer: {
    name: 'Destroyer',
    level: 30,
    upgradesTo: ['hybrid', 'annihilator', 'skimmer', 'rocketeer', 'glider', 'firework'],
  },
  gunner: {
    name: 'Gunner',
    level: 30,
    upgradesTo: ['auto-gunner', 'gunner-trapper', 'streamliner'],
  },
  shotgun: {
    name: 'Shotgun',
    level: 30,
    upgradesTo: ['pellet-shot', 'dual-barrel'],
  },
  'tri-angle': {
    name: 'Tri-Angle',
    level: 30,
    upgradesTo: ['booster', 'fighter'],
  },
  'auto-3': {
    name: 'Auto 3',
    level: 30,
    upgradesTo: ['auto-5', 'auto-gunner'],
  },
  smasher: {
    name: 'Smasher',
    level: 30,
    upgradesTo: ['landmine', 'auto-smasher', 'spike'],
  },
  triplet: {
    name: 'Triplet',
    level: 45,
    upgradesTo: [],
  },
  'penta-shot': {
    name: 'Penta Shot',
    level: 45,
    upgradesTo: [],
  },
  'spread-shot': {
    name: 'Spread Shot',
    level: 45,
    upgradesTo: [],
  },
  'octo-tank': {
    name: 'Octo Tank',
    level: 45,
    upgradesTo: [],
  },
  'auto-5': {
    name: 'Auto 5',
    level: 45,
    upgradesTo: [],
  },
  'triple-twin': {
    name: 'Triple Twin',
    level: 45,
    upgradesTo: [],
  },
  battleship: {
    name: 'Battleship',
    level: 45,
    upgradesTo: [],
  },
  ranger: {
    name: 'Ranger',
    level: 45,
    upgradesTo: [],
  },
  stalker: {
    name: 'Stalker',
    level: 45,
    upgradesTo: [],
  },
  overlord: {
    name: 'Overlord',
    level: 45,
    upgradesTo: [],
  },
  necromancer: {
    name: 'Necromancer',
    level: 45,
    upgradesTo: [],
  },
  manager: {
    name: 'Manager',
    level: 45,
    upgradesTo: [],
  },
  overtrapper: {
    name: 'Overtrapper',
    level: 45,
    upgradesTo: [],
  },
  factory: {
    name: 'Factory',
    level: 45,
    upgradesTo: [],
  },
  predator: {
    name: 'Predator',
    level: 45,
    upgradesTo: [],
  },
  streamliner: {
    name: 'Streamliner',
    level: 45,
    upgradesTo: [],
  },
  'tri-trapper': {
    name: 'Tri-Trapper',
    level: 45,
    upgradesTo: [],
  },
  'gunner-trapper': {
    name: 'Gunner Trapper',
    level: 45,
    upgradesTo: [],
  },
  'mega-trapper': {
    name: 'Mega Trapper',
    level: 45,
    upgradesTo: [],
  },
  'auto-trapper': {
    name: 'Auto Trapper',
    level: 45,
    upgradesTo: [],
  },
  hybrid: {
    name: 'Hybrid',
    level: 45,
    upgradesTo: [],
  },
  annihilator: {
    name: 'Annihilator',
    level: 45,
    upgradesTo: [],
  },
  skimmer: {
    name: 'Skimmer',
    level: 45,
    upgradesTo: [],
  },
  rocketeer: {
    name: 'Rocketeer',
    level: 45,
    upgradesTo: [],
  },
  glider: {
    name: 'Glider',
    level: 45,
    upgradesTo: [],
  },
  firework: {
    name: 'Firework',
    level: 45,
    upgradesTo: [],
  },
  'auto-gunner': {
    name: 'Auto Gunner',
    level: 45,
    upgradesTo: [],
  },
  'pellet-shot': {
    name: 'Pellet Shot',
    level: 45,
    upgradesTo: [],
  },
  'dual-barrel': {
    name: 'Dual-Barrel',
    level: 45,
    upgradesTo: [],
  },
  sprayer: {
    name: 'Sprayer',
    level: 45,
    upgradesTo: [],
  },
  booster: {
    name: 'Booster',
    level: 45,
    upgradesTo: [],
  },
  fighter: {
    name: 'Fighter',
    level: 45,
    upgradesTo: [],
  },
  landmine: {
    name: 'Landmine',
    level: 45,
    upgradesTo: [],
  },
  'auto-smasher': {
    name: 'Auto Smasher',
    level: 45,
    upgradesTo: [],
  },
  spike: {
    name: 'Spike',
    level: 45,
    upgradesTo: [],
  },
  'auto-tank': {
    name: 'Auto Tank',
    level: 45,
    upgradesTo: [],
  },
};

function define(
  id: ClassId,
  barrels: BarrelDefinition[],
  extra: Partial<ClassDefinition> = {},
): ClassDefinition {
  return { id, ...tree[id]!, barrels, view: 1, speed: 1, ...extra };
}

export const CLASS_DEFINITIONS: Readonly<Record<ClassId, ClassDefinition>> = {
  tank: define('tank', [barrel()]),
  twin: define('twin', twin()),
  sniper: define('sniper', [sniper()], { view: 1.25, speed: 0.95 }),
  'machine-gun': define('machine-gun', [machine()]),
  'flank-guard': define('flank-guard', [
    barrel(),
    barrel({ angle: Math.PI, length: 1.6, width: 0.65, damage: 0.7, recoil: 0.7 }),
  ]),
  'triple-shot': define('triple-shot', fan(3, 0.8)),
  'quad-tank': define('quad-tank', radial(4)),
  'twin-flank': define('twin-flank', [...twin(), ...twin(Math.PI)]),
  assassin: define(
    'assassin',
    [sniper({ length: 2.8, damage: 1.8, speed: 1.7, reload: 1.9, lifetime: 3.5 })],
    { view: 1.45, speed: 0.9 },
  ),
  overseer: define('overseer', [drone(Math.PI / 2), drone(-Math.PI / 2)], {
    droneLimit: 8,
    view: 1.15,
  }),
  hunter: define(
    'hunter',
    [
      sniper({ width: 1.1, damage: 1.7 }),
      sniper({ length: 2.9, width: 0.55, damage: 0.8, delay: 0.15 }),
    ],
    { view: 1.25 },
  ),
  trapper: define('trapper', [trap()], { view: 1.15 }),
  destroyer: define('destroyer', [heavy()]),
  gunner: define('gunner', gunner()),
  shotgun: define('shotgun', [shotgun(12)]),
  'tri-angle': define('tri-angle', [barrel(), thruster(Math.PI - 0.45), thruster(Math.PI + 0.45)], {
    speed: 1.05,
  }),
  'auto-3': define('auto-3', radial(3, auto)),
  smasher: define('smasher', [], smasherBody),
  triplet: define('triplet', [
    barrel({ offset: -0.65, damage: 0.7 }),
    barrel({ offset: 0.65, damage: 0.7 }),
    barrel({ length: 2.2, damage: 0.7, delay: 0.5 }),
  ]),
  'penta-shot': define('penta-shot', fan(5, 1.2)),
  'spread-shot': define(
    'spread-shot',
    fan(11, 1.6).map((b, i) => ({
      ...b,
      width: i === 5 ? 0.84 : 0.35,
      damage: i === 5 ? 1 : 0.35,
      delay: i / 11,
    })),
  ),
  'octo-tank': define(
    'octo-tank',
    radial(8).map((b, i) => ({ ...b, delay: (i % 2) * 0.5 })),
  ),
  'auto-5': define('auto-5', radial(5, auto)),
  'triple-twin': define('triple-twin', [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].flatMap(twin)),
  battleship: define(
    'battleship',
    radial(4, (angle) =>
      drone(angle, {
        reload: 0.6,
        width: 0.55,
        damage: 0.8,
        penetration: 1.5,
        lifetime: 7,
        autonomous: angle >= Math.PI,
      }),
    ),
    { droneLimit: 20 },
  ),
  ranger: define('ranger', [sniper({ length: 3.2, speed: 2, damage: 2, reload: 2, lifetime: 4 })], {
    view: 1.8,
    speed: 0.9,
  }),
  stalker: define('stalker', [sniper({ length: 2.8, damage: 1.8, speed: 1.7, reload: 1.9 })], {
    view: 1.45,
    stealth: { delay: 0, fade: 2 },
  }),
  overlord: define(
    'overlord',
    radial(4, (angle) => drone(angle, { reload: 1 })),
    { droneLimit: 8, view: 1.15 },
  ),
  necromancer: define(
    'necromancer',
    [drone(Math.PI / 2, { conversionOnly: true }), drone(-Math.PI / 2, { conversionOnly: true })],
    { droneLimit: 14, dronesPerReload: 4, view: 1.15 },
  ),
  manager: define('manager', [drone(Math.PI, { reload: 1 })], {
    droneLimit: 8,
    stealth: { delay: 0, fade: 2 },
    view: 1.15,
  }),
  overtrapper: define(
    'overtrapper',
    [
      trap(),
      drone(Math.PI - 0.5, { autonomous: true }),
      drone(Math.PI + 0.5, { autonomous: true }),
    ],
    { droneLimit: 2 },
  ),
  factory: define(
    'factory',
    [drone(0, { projectile: 'minion', reload: 2.5, damage: 1, penetration: 7, speed: 0.4 })],
    { droneLimit: 6, view: 1.15 },
  ),
  predator: define(
    'predator',
    [
      sniper({ width: 1.15, damage: 1.7 }),
      sniper({ length: 2.5, width: 0.8, damage: 1, delay: 0.15 }),
      sniper({ length: 3, width: 0.5, damage: 0.7, delay: 0.3 }),
    ],
    { view: 1.4, altCameraDistance: 650 },
  ),
  streamliner: define(
    'streamliner',
    Array.from({ length: 5 }, (_, i) =>
      sniper({ length: 1.8 + i * 0.25, width: 0.5, reload: 0.85, damage: 0.45, delay: i / 5 }),
    ),
    { view: 1.25 },
  ),
  'tri-trapper': define('tri-trapper', radial(3, trap)),
  'gunner-trapper': define('gunner-trapper', [
    barrel({ offset: -0.45, width: 0.4, reload: 0.55, damage: 0.5 }),
    barrel({ offset: 0.45, width: 0.4, reload: 0.55, damage: 0.5, delay: 0.5 }),
    trap(Math.PI),
  ]),
  'mega-trapper': define('mega-trapper', [
    trap(0, { width: 2, reload: 3, penetration: 10, damage: 4, recoil: 3 }),
  ]),
  'auto-trapper': define('auto-trapper', [trap(), auto(0)]),
  hybrid: define('hybrid', [heavy(), drone(Math.PI, { autonomous: true })], { droneLimit: 2 }),
  annihilator: define('annihilator', [heavy({ width: 2.5, damage: 7, penetration: 5, recoil: 8 })]),
  skimmer: define('skimmer', [
    heavy({ projectile: 'missile', missile: 'skimmer', lifetime: 5, speed: 0.55 }),
  ]),
  rocketeer: define('rocketeer', [
    heavy({ projectile: 'missile', missile: 'rocketeer', lifetime: 5, speed: 0.4, penetration: 5 }),
  ]),
  glider: define('glider', [
    heavy({ projectile: 'missile', missile: 'glider', lifetime: 5, speed: 0.6 }),
  ]),
  firework: define('firework', [
    heavy({ projectile: 'missile', missile: 'firework', lifetime: 1.2, speed: 0.65 }),
  ]),
  'auto-gunner': define('auto-gunner', [...gunner(), auto(0)]),
  'pellet-shot': define(
    'pellet-shot',
    [
      shotgun(10, { length: 2.3 }),
      shotgun(10, { angle: -0.08, length: 1.7 }),
      shotgun(10, { angle: 0.08, length: 1.7 }),
    ],
    { view: 1.25 },
  ),
  'dual-barrel': define('dual-barrel', [
    shotgun(12, { offset: -0.6, recoil: 7 }),
    shotgun(12, { offset: 0.6, delay: 0.5, recoil: 7 }),
  ]),
  sprayer: define('sprayer', [
    machine({ reload: 0.3 }),
    barrel({ length: 2.2, width: 0.5, reload: 0.7, damage: 0.65, delay: 0.5 }),
  ]),
  booster: define(
    'booster',
    [barrel(), ...[Math.PI - 0.6, Math.PI + 0.6, Math.PI - 0.25, Math.PI + 0.25].map(thruster)],
    { speed: 1.1 },
  ),
  fighter: define(
    'fighter',
    [
      barrel(),
      thruster(Math.PI - 0.45),
      thruster(Math.PI + 0.45),
      barrel({ angle: Math.PI / 2, damage: 0.7 }),
      barrel({ angle: -Math.PI / 2, damage: 0.7 }),
    ],
    { speed: 1.05 },
  ),
  landmine: define('landmine', [], { ...smasherBody, stealth: { delay: 13, fade: 2 } }),
  'auto-smasher': define('auto-smasher', [auto(0)], {
    ...smasherBody,
    statCaps: { healthRegen: 10, maxHealth: 10, bodyDamage: 10, movementSpeed: 10 },
  }),
  spike: define('spike', [], { ...smasherBody, bodyDamage: 2.5, mass: 2.5 }),
  'auto-tank': define('auto-tank', radial(4, auto)),
};

export function getClassDefinition(id: ClassId): ClassDefinition | undefined {
  return Object.hasOwn(CLASS_DEFINITIONS, id) ? CLASS_DEFINITIONS[id] : undefined;
}

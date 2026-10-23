import type { BarrelDefinition, ClassDefinition } from './classes';
import type { ClassId } from '../model/ids';
import type { StatLevels } from '../model/stats';

/**
 * Classes spéciales pilotées par la simulation (IA) : Dominators, Mothership et boss classiques.
 * Séparées des 54 classes jouables : jamais proposées en amélioration ni parcourues par
 * `cycleClass`. Géométrie partagée avec le rendu via `getClassDefinition`.
 * Toutes les valeurs sont des **coefficients expérimentaux** de diep-fried.io, à calibrer ;
 * le catalogue documentaire ne fixe que les noms, rôles, le niveau 75/140 et les 7000 PV
 * du Mothership (`parameterStatus: to-validate`).
 */

export type SpecialRole = 'dominator' | 'mothership' | 'boss';

export interface SpecialClassDefinition extends ClassDefinition {
  role: SpecialRole;
  /** Rayon du corps en unités monde. */
  radius: number;
  maxHealth: number;
  /** XP du coup fatal (capture ou neutralisation pour un Dominator). */
  reward: number;
  /** Statistiques fixes de l'IA, mêmes formules que les joueurs. */
  stats: Partial<StatLevels>;
  /** Silhouette du corps, pour le rendu (le collisionneur reste circulaire). */
  body: 'circle' | 'triangle' | 'square' | 'hexagon';
}

const barrel = (patch: Partial<BarrelDefinition> = {}): BarrelDefinition => ({
  angle: 0,
  offset: 0,
  length: 1.6,
  width: 0.5,
  delay: 0,
  projectile: 'bullet',
  reload: 1,
  damage: 1,
  penetration: 1,
  speed: 1,
  spread: 0,
  recoil: 0,
  ...patch,
});
const radial = (count: number, make: (angle: number, index: number) => BarrelDefinition) =>
  Array.from({ length: count }, (_, i) => make((i * Math.PI * 2) / count, i));

const dominatorBase = {
  role: 'dominator' as const,
  level: 75,
  upgradesTo: [] as ClassId[],
  view: 1.1,
  speed: 0,
  radius: 70,
  maxHealth: 4000,
  reward: 1000,
  bodyDamage: 2,
  mass: 1000,
  stats: { bulletDamage: 5, bulletPenetration: 5, bulletSpeed: 3, reload: 4, bodyDamage: 5 },
  body: 'hexagon' as const,
};
const bossBase = {
  role: 'boss' as const,
  level: 75,
  upgradesTo: [] as ClassId[],
  view: 1.6,
  maxHealth: 3000,
  reward: 12_000,
  mass: 8,
  stats: {
    healthRegen: 3,
    bulletDamage: 4,
    bulletPenetration: 4,
    bulletSpeed: 3,
    reload: 4,
    bodyDamage: 5,
  },
};

const special = (definition: SpecialClassDefinition) => definition;

export const SPECIAL_CLASS_DEFINITIONS: Readonly<Record<ClassId, SpecialClassDefinition>> = {
  'dominator-destroyer': special({
    ...dominatorBase,
    id: 'dominator-destroyer',
    name: 'Destroyer Dominator',
    barrels: [
      barrel({ length: 1.5, width: 0.75, reload: 4, damage: 6, penetration: 6, speed: 0.6 }),
    ].map((b) => ({ ...b, radius: 28 })),
  }),
  'dominator-gunner': special({
    ...dominatorBase,
    id: 'dominator-gunner',
    name: 'Gunner Dominator',
    barrels: [-0.2, 0, 0.2].map((offset, i) =>
      barrel({
        offset,
        length: i === 1 ? 1.65 : 1.4,
        width: 0.18,
        reload: 0.35,
        damage: 0.55,
        penetration: 0.8,
        delay: i / 3,
        radius: 7,
      }),
    ),
  }),
  'dominator-trapper': special({
    ...dominatorBase,
    id: 'dominator-trapper',
    name: 'Trapper Dominator',
    barrels: radial(8, (angle) =>
      barrel({
        angle,
        projectile: 'trap',
        length: 1.25,
        width: 0.4,
        tipWidth: 0.6,
        reload: 2.2,
        damage: 3,
        penetration: 6,
        speed: 0.5,
        lifetime: 20,
        radius: 20,
      }),
    ),
  }),
  mothership: special({
    id: 'mothership',
    name: 'Mothership',
    role: 'mothership',
    level: 140,
    upgradesTo: [],
    view: 1.5,
    speed: 0.3,
    radius: 110,
    maxHealth: 7000,
    reward: 20_000,
    droneLimit: 16,
    mass: 40,
    bodyDamage: 2,
    stats: { healthRegen: 2, bulletDamage: 4, bulletPenetration: 4, reload: 5, bodyDamage: 5 },
    body: 'hexagon',
    barrels: radial(8, (angle) =>
      barrel({
        angle,
        projectile: 'drone',
        length: 1.05,
        width: 0.3,
        reload: 2.5,
        damage: 1.6,
        penetration: 3,
        speed: 0.55,
        radius: 14,
      }),
    ),
  }),
  'guardian-of-the-pentagons': special({
    ...bossBase,
    id: 'guardian-of-the-pentagons',
    name: 'Guardian',
    speed: 0.55,
    radius: 90,
    droneLimit: 24,
    body: 'triangle',
    barrels: [
      barrel({
        projectile: 'drone',
        length: 1.1,
        width: 0.45,
        reload: 0.6,
        damage: 1.2,
        penetration: 2,
        speed: 0.9,
        lifetime: 10,
        radius: 14,
        bodyShape: 'triangle',
      }),
    ],
  }),
  summoner: special({
    ...bossBase,
    id: 'summoner',
    name: 'Summoner',
    speed: 0.4,
    radius: 90,
    droneLimit: 28,
    body: 'square',
    barrels: radial(4, (angle) =>
      barrel({
        angle,
        projectile: 'drone',
        length: 1.05,
        width: 0.45,
        reload: 1.4,
        damage: 1.2,
        penetration: 3,
        speed: 0.5,
        lifetime: 30,
        radius: 15,
        bodyShape: 'square',
      }),
    ),
  }),
  defender: special({
    ...bossBase,
    id: 'defender',
    name: 'Defender',
    speed: 0.4,
    radius: 95,
    body: 'triangle',
    barrels: [
      ...radial(3, (angle) =>
        barrel({
          angle,
          projectile: 'trap',
          length: 1.2,
          width: 0.5,
          tipWidth: 0.75,
          reload: 1.8,
          damage: 2.5,
          penetration: 5,
          speed: 0.6,
          lifetime: 20,
          radius: 18,
        }),
      ),
      ...radial(3, (angle) =>
        barrel({
          angle: angle + Math.PI / 3,
          auto: true,
          length: 0.9,
          width: 0.3,
          reload: 0.6,
          damage: 0.8,
        }),
      ),
    ],
  }),
  'fallen-overlord': special({
    ...bossBase,
    id: 'fallen-overlord',
    name: 'Fallen Overlord',
    speed: 0.8,
    radius: 60,
    view: 1.4,
    droneLimit: 12,
    body: 'circle',
    barrels: radial(4, (angle) =>
      barrel({
        angle,
        projectile: 'drone',
        length: 1.2,
        width: 0.7,
        reload: 1.2,
        damage: 2,
        penetration: 4,
        speed: 0.55,
        radius: 12,
      }),
    ),
  }),
  'fallen-booster': special({
    ...bossBase,
    id: 'fallen-booster',
    name: 'Fallen Booster',
    speed: 1.4,
    radius: 60,
    mass: 4,
    bodyDamage: 3,
    body: 'circle',
    barrels: [
      barrel({ length: 1.8, width: 0.6, reload: 1, damage: 1.2 }),
      ...[Math.PI - 0.6, Math.PI + 0.6, Math.PI - 0.25, Math.PI + 0.25].map((angle) =>
        barrel({ angle, length: 1.4, width: 0.45, damage: 0.5, penetration: 0.7, recoil: 2.2 }),
      ),
    ],
  }),
};

/** Ordre de rotation par défaut des boss automatiques et de `sandbox summonBoss`. */
export const CLASSIC_BOSSES: readonly ClassId[] = [
  'guardian-of-the-pentagons',
  'summoner',
  'defender',
  'fallen-overlord',
  'fallen-booster',
];

export const DOMINATOR_CLASSES: readonly ClassId[] = [
  'dominator-destroyer',
  'dominator-gunner',
  'dominator-trapper',
];

export function getSpecialClassDefinition(id: ClassId): SpecialClassDefinition | undefined {
  return Object.hasOwn(SPECIAL_CLASS_DEFINITIONS, id) ? SPECIAL_CLASS_DEFINITIONS[id] : undefined;
}

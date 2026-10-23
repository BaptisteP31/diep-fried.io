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
}

export const DEFAULT_STAT_CAP = 7;

export const STARTING_CLASS: ClassId = 'tank';

const tank: ClassDefinition = {
  id: 'tank',
  name: 'Tank',
  level: 1,
  upgradesTo: [],
  barrels: [
    {
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
    },
  ],
  view: 1,
  speed: 1,
};

/** Registre des classes. La simulation y ajoute les branches de progression. */
export const CLASS_DEFINITIONS: Readonly<Record<ClassId, ClassDefinition>> = {
  [tank.id]: tank,
};

export function getClassDefinition(id: ClassId): ClassDefinition | undefined {
  return Object.hasOwn(CLASS_DEFINITIONS, id) ? CLASS_DEFINITIONS[id] : undefined;
}

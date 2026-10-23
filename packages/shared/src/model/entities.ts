import type { ClassId, EntityId, PlayerId, TeamId, Tick } from './ids';

/**
 * État visible d'une entité, tel qu'envoyé dans un snapshot.
 * Union discriminée par `kind` ; ajouter une famille = ajouter un membre.
 */
export type EntityState = TankState | ProjectileState | ShapeState;

export type EntityKind = EntityState['kind'];

interface EntityBase {
  id: EntityId;
  x: number;
  y: number;
  /** Vitesse en unités monde par seconde, pour l'extrapolation côté client. */
  vx: number;
  vy: number;
  /** Orientation en radians (0 = +x, sens horaire écran puisque y descend). */
  angle: number;
  /** Rayon de collision en unités monde. */
  radius: number;
  team: TeamId;
}

export interface TankState extends EntityBase {
  kind: 'tank';
  /** `null` pour un tank non piloté par un humain (IA, boss). */
  playerId: PlayerId | null;
  name: string;
  classId: ClassId;
  level: number;
  score: number;
  health: number;
  maxHealth: number;
  /** 0..1 ; < 1 pour les classes à invisibilité. */
  opacity: number;
  /** Tick du dernier tir, par index de canon de la classe (-1 si jamais). Sert au recul visuel. */
  barrelShots: Tick[];
  /** Orientation monde des canons autonomes ; absent sur les anciens snapshots. */
  barrelAngles?: number[];
  /** Décalage monde de caméra demandé par Predator + Alt, facultatif pour le rendu. */
  cameraOffset?: { x: number; y: number };
  /** Protection d'apparition active : le client fait clignoter le tank. */
  spawnProtected: boolean;
}

/**
 * Familles simulées au jalon 3. Les métadonnées des corps armés et des carrés
 * convertis sont optionnelles pour préserver les anciens snapshots.
 */
export type ProjectileFamily = 'bullet' | 'drone' | 'trap' | 'missile' | 'minion';

export interface ProjectileState extends EntityBase {
  kind: 'projectile';
  family: ProjectileFamily;
  ownerId: EntityId;
  /** Présents pour les projectiles dont la santé est affichée (drones, minions). */
  health?: number;
  maxHealth?: number;
  /** Métadonnées additives pour les corps armés et drones convertis. */
  bodyShape?: 'circle' | 'triangle' | 'square';
  classId?: ClassId;
  barrelShots?: Tick[];
}

export type ShapeKind = 'square' | 'triangle' | 'pentagon' | 'alphaPentagon' | 'crasher';

export interface ShapeState extends EntityBase {
  kind: 'shape';
  shape: ShapeKind;
  /** Variante rare. */
  shiny: boolean;
  health: number;
  maxHealth: number;
}

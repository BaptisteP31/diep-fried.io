import type { Rect } from './geometry';
import type { TeamId } from './ids';

/**
 * Modes implémentés. Les modes à objectifs restent des extensions futures.
 */
export const MODE_IDS = ['ffa', 'sandbox', 'teams2', 'teams4', 'maze'] as const;

export type ModeId = (typeof MODE_IDS)[number];

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && (MODE_IDS as readonly string[]).includes(value);
}

export type TeamColor = 'blue' | 'red' | 'green' | 'purple';

export interface TeamDefinition {
  id: TeamId;
  color: TeamColor;
  name: string;
}

/** Zone de la carte : base d'équipe, zone d'apparition ou objectif. */
export interface MapZone {
  kind: 'base' | 'spawn';
  team: TeamId;
  area: Rect;
}

/**
 * Configuration complète et résolue d'un salon. Produite par le serveur à partir d'un preset
 * de mode et des `RoomOptions` du créateur, puis transmise telle quelle à la simulation et au client.
 * Toutes les valeurs numériques par défaut sont des choix de diep-fried.io, pas des mesures.
 */
export interface ModeConfig {
  mode: ModeId;
  /** Pas de simulation par seconde. */
  tickRate: number;
  /** Nombre de ticks entre deux snapshots envoyés à un client. */
  snapshotInterval: number;
  /** Arène rectangulaire [0, width] x [0, height]. */
  arena: { width: number; height: number };
  maxPlayers: number;
  /** Vide pour les modes sans équipes : chaque joueur reçoit alors une équipe individuelle. */
  teams: TeamDefinition[];
  friendlyFire: boolean;
  map: {
    /** Murs infranchissables (Maze). */
    walls: Rect[];
    zones: MapZone[];
  };
  shapes: {
    /** Population visée de formes neutres. */
    targetCount: number;
  };
  progression: {
    maxLevel: number;
    /** Niveau d'apparition (Sandbox : ajustable). */
    startLevel: number;
    /** Fraction du score conservée après une mort, 0..1. */
    scoreKeptOnDeath: number;
  };
  respawn: {
    /** Délai minimal entre la mort et l'acceptation d'une commande `respawn`. */
    delayTicks: number;
  };
  sandbox: {
    /** Autorise les commandes de triche Sandbox (montée de niveau, changement de classe libre). */
    cheats: boolean;
  };
}

/**
 * Réglages qu'un créateur de salon peut demander. Tous optionnels ; le serveur valide,
 * borne et fusionne avec le preset du mode. Ajouter un réglage = ajouter un champ ici
 * et sa résolution dans `resolveModeConfig`.
 */
export interface RoomOptions {
  maxPlayers?: number;
  arenaSize?: 'small' | 'medium' | 'large';
  shapeDensity?: 'low' | 'normal' | 'high';
}

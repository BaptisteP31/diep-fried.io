import type { Rect } from './geometry';
import type { ClassId, TeamId } from './ids';
import type { ObjectiveSite } from './match';

/**
 * Modes implémentés. Les modes à objectifs sont des ajouts additifs du protocole v1 ;
 * leurs règles sont des conventions de diep-fried.io.
 */
export const MODE_IDS = [
  'ffa',
  'sandbox',
  'teams2',
  'teams4',
  'maze',
  'domination',
  'tag',
  'ctf',
  'breakout',
  'survival',
  'mothership',
] as const;

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
    /** Objectifs des modes à objectifs, résolus avec la carte ; absent ailleurs. */
    objectives?: ObjectiveSite[];
  };
  shapes: {
    /** Population visée de formes neutres. */
    targetCount: number;
    /** Nid central : Alpha Pentagons et Crashers, en plus de `targetCount`. */
    nest?: NestConfig;
    /** Probabilité qu'une forme ordinaire apparaisse en variante rare (`shiny`). */
    shinyChance?: number;
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
  /** Rounds des modes à objectifs ; absent pour FFA/Sandbox/Teams/Maze. */
  match?: MatchConfig;
  /** Apparition périodique des boss classiques ; absent = aucun boss automatique. */
  bosses?: BossConfig;
  /** Bots joueurs synthétiques (décorateur de simulation) ; absent = aucun bot. */
  bots?: BotConfig;
}

export interface NestConfig {
  /** Rayon du nid centré sur l'arène. */
  radius: number;
  /** Alpha Pentagons visés : `round(targetCount × alphaShare)`. */
  alphaShare: number;
  /** Crashers visés : `round(targetCount × crasherShare)`. */
  crasherShare: number;
}

export interface MatchConfig {
  /** Joueurs connectés requis pour démarrer un round ; évite une victoire solo immédiate. */
  minPlayers: number;
  /** Durée de la phase `finished` avant le round suivant. */
  restartDelayTicks: number;
  /** Durée maximale d'un round, 0 = illimitée. À échéance : meilleur score, sinon égalité. */
  timeLimitTicks: number;
  /** Score de victoire (captures CTF, points Breakout) ; 0 = pas de seuil. */
  scoreLimit: number;
  /** Survival : rétrécissement de la zone sûre. */
  shrink?: {
    delayTicks: number;
    durationTicks: number;
    /** Rayon final en fraction du plus petit côté de l'arène. */
    finalRadiusFraction: number;
    damagePerSecond: number;
  };
}

export interface BossConfig {
  enabled: boolean;
  /** Tick d'apparition du premier boss après le début du salon. */
  firstSpawnTicks: number;
  intervalTicks: number;
  /** Boss vivants simultanés (borne dure de la simulation : 8). */
  maxAlive: number;
  /** Classes tirées ; absent = les cinq boss classiques. */
  pool?: ClassId[];
}

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotConfig {
  count: number;
  difficulty: BotDifficulty;
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
  /** Nombre de bots joueurs (0..12). 0 désactive les bots. */
  botCount?: number;
  /** Niveau de difficulté des bots ('easy' | 'normal' | 'hard'). */
  botDifficulty?: BotDifficulty;
}

import type { MapZone, Rect, TeamId, Vec2 } from '@diep-fried/shared';

/**
 * Limites et valeurs de calibrage pour la génération de labyrinthes et bases.
 * Conformes aux dimensions standards diep-fried.io (small: 3000, medium: 5000, large: 8000).
 */
export const MAZE_LIMITS = {
  /** Rayon de tank par défaut si non spécifié (issu de BALANCE.tankRadius). */
  defaultTankRadius: 25,
  /** Épaisseur standard d'un mur en unités monde. */
  defaultWallThickness: 30,
  /** Taille de cellule par défaut pour les arènes standards (250 unités). */
  defaultCellSize: 250,
  /** Marge de dégagement minimale absolue au-delà du diamètre du tank (2 * r + minClearance). */
  minClearance: 10,
  /** Dimension minimale absolue d'une arène pour accueillir un labyrinthe navigable. */
  minArenaDimension: 400,
  /** Dimension maximale raisonnable d'arène. */
  maxArenaDimension: 50_000,
  /** Nombre minimal de cellules par axe. */
  minGridCells: 2,
  /** Nombre maximal de cellules par axe pour borner la complexité mémoire et CPU. */
  maxGridCells: 200,
  /** Facteur de boucle par défaut (0.2 = 20% des murs surnuméraires retirés). */
  defaultLoopFactor: 0.2,
  /** Ratio de taille de base par défaut pour les modes équipes (15% de la dimension). */
  defaultBaseSizeRatio: 0.15,
  /** Marge intérieure par défaut pour les zones de spawn par rapport au pourtour de la base. */
  defaultSpawnMargin: 40,
} as const;

/**
 * Options d'entrée pour la génération de labyrinthe déterministe.
 */
export interface MazeOptions {
  /** Largeur de l'arène en unités monde (doit être > 0 et dans les bornes). */
  width: number;
  /** Hauteur de l'arène en unités monde (doit être > 0 et dans les bornes). */
  height: number;
  /** Graine entière pour le générateur pseudo-aléatoire déterministe Mulberry32. */
  seed: number;
  /** Rayon du tank (défaut : 25). Les corridors auront une largeur >= 2 * tankRadius + marge. */
  tankRadius?: number;
  /**
   * Taille indicative d'une cellule de la grille (défaut : 250).
   * La grille est discrétisée en cellules entières adaptées aux dimensions de l'arène.
   */
  cellSize?: number;
  /** Épaisseur des murs en unités monde (défaut : 30). */
  wallThickness?: number;
  /**
   * Facteur de boucles (braid factor) compris entre 0 et 1 (défaut : 0.2).
   * 0 = arbre couvrant parfait (labyrinthe à chemin unique, nombreux culs-de-sac).
   * > 0 = ouvre des cycles supplémentaires pour fluidifier les combats multijoueur.
   */
  loopFactor?: number;
  /**
   * Zones réservées (ex: bases d'équipes ou zone centrale neutre)
   * dans lesquelles aucun mur ne sera placé.
   */
  reservedZones?: readonly Rect[];
}

/**
 * Résultat détaillé de la génération d'un labyrinthe, incluant métadonnées de grille.
 */
export interface MazeLayoutResult {
  /** Liste des rectangles de murs infranchissables. */
  walls: Rect[];
  /** Informations sur la grille discrète sous-jacente. */
  grid: {
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
  };
  /** Paramètres effectifs résolus pour la génération. */
  resolvedOptions: {
    width: number;
    height: number;
    seed: number;
    tankRadius: number;
    cellSize: number;
    wallThickness: number;
    loopFactor: number;
  };
}

/**
 * Options pour la disposition des bases d'équipes (2 ou 4 équipes).
 */
export interface TeamLayoutOptions {
  /**
   * Ratio de taille de base par rapport aux dimensions de l'arène (défaut : 0.15).
   * Doit être strictement positif et laisser un corridor central praticable.
   */
  baseSizeRatio?: number;
  /**
   * Marge intérieure entre le bord de la base et la zone de spawn (défaut : 40).
   * Permet aux tanks d'apparaître protégés au cœur de leur base.
   */
  spawnMargin?: number;
}

/**
 * Détail d'une base pour une équipe donnée.
 */
export interface TeamBaseInfo {
  team: TeamId;
  baseArea: Rect;
  spawnArea: Rect;
}

/**
 * Résultat structuré de la disposition des bases d'équipes.
 */
export interface TeamLayoutResult {
  /** Zones au format partagé (@diep-fried/shared MapZone). */
  zones: MapZone[];
  /** Informations structurées par équipe. */
  teams: TeamBaseInfo[];
}

/**
 * Définition d'un cercle dans le plan.
 */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/**
 * Résultat de résolution d'une collision cercle contre mur.
 */
export interface CircleWallResolution {
  /** Nouvelle coordonnée x du centre du cercle. */
  x: number;
  /** Nouvelle coordonnée y du centre du cercle. */
  y: number;
  /** Vrai si une pénétration a été détectée et corrigée. */
  collided: boolean;
  /** Composante x de la normale unitaire pointant du mur vers le cercle. */
  normalX: number;
  /** Composante y de la normale unitaire pointant du mur vers le cercle. */
  normalY: number;
  /** Profondeur de pénétration résolue. */
  depth: number;
}

/**
 * Résultat d'un balayage continu (swept collision) d'un cercle contre un mur.
 */
export interface SweptCircleHit {
  /** Vrai si le cercle en mouvement entre en contact avec le mur pendant l'intervalle t in [0, 1]. */
  hit: boolean;
  /** Fraction de déplacement à l'impact (0 = collision immédiate, 1 = à l'arrivée). */
  time: number;
  /** Composante x de la normale au point de contact. */
  normalX: number;
  /** Composante y de la normale au point de contact. */
  normalY: number;
  /** Coordonnée x du centre du cercle au moment de l'impact. */
  contactX: number;
  /** Coordonnée y du centre du cercle au moment de l'impact. */
  contactY: number;
}

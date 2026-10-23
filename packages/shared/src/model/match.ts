import type { ClassId, EntityId, PlayerId, TeamId, Tick } from './ids';

/**
 * État de partie des modes à objectifs (Domination, Tag, CTF, Breakout, Survival, Mothership).
 * Ajout additif au protocole v1 : `SnapshotPayload.match` est absent pour FFA/Sandbox/Teams/Maze.
 * Les règles exactes de chaque mode sont des conventions de diep-fried.io
 * (voir `packages/sim/README.md`), pas une reproduction vérifiée du jeu original.
 */

/** `waiting` : pas assez de joueurs ; `playing` : round en cours ; `finished` : vainqueur affiché. */
export type MatchPhase = 'waiting' | 'playing' | 'finished';

export type ObjectiveKind = 'dominator' | 'flag' | 'territory' | 'mothership';

/** Emplacement d'objectif résolu avec la carte et envoyé dans `room.joined.config`. */
export interface ObjectiveSite {
  kind: ObjectiveKind;
  /** Camp initial : 0 = neutre (Dominator, territoire), camp du drapeau ou du vaisseau-mère. */
  team: TeamId;
  x: number;
  y: number;
  /** Rayon du corps (Dominator, Mothership) ou de la zone de prise/capture (drapeau, territoire). */
  radius: number;
  /** Classe spéciale de l'entité portée par l'objectif (`dominator-gunner`, `mothership`...). */
  classId?: ClassId;
}

export type FlagStatus = 'home' | 'carried' | 'dropped';

export interface ObjectiveState {
  /** Indice stable de l'objectif dans `config.map.objectives`. */
  id: number;
  kind: ObjectiveKind;
  /** Position courante (drapeau porté : position du porteur). */
  x: number;
  y: number;
  radius: number;
  /** Propriétaire courant ; camp d'appartenance pour un drapeau. */
  team: TeamId;
  /** Entité simulée portant l'objectif (tank IA Dominator/Mothership), sinon `null`. */
  entityId: EntityId | null;
  /**
   * 0..1. Dominator/Mothership : santé relative. Territoire : avancement de la capture par
   * `capturingTeam`. Drapeau : 1 à la base, 0 sinon.
   */
  progress: number;
  health?: number;
  maxHealth?: number;
  /** Territoire : camp en train de capturer (0 = aucun). */
  capturingTeam?: TeamId;
  /** Territoire : plusieurs camps présents, progression gelée. */
  contested?: boolean;
  /** Drapeau. */
  flag?: {
    status: FlagStatus;
    carrierId: PlayerId | null;
    homeX: number;
    homeY: number;
    /** Tick de retour automatique d'un drapeau tombé, sinon `null`. */
    returnTick: Tick | null;
  };
  /** Joueur pilotant l'entité (commande `possess`), sinon `null`. */
  possessedBy?: PlayerId | null;
}

export type MatchEndReason =
  | 'dominators'
  | 'conversion'
  | 'flags'
  | 'territories'
  | 'lastSurvivor'
  | 'mothership'
  | 'timeLimit';

export interface MatchResult {
  /** Camp vainqueur, `null` pour une égalité. */
  team: TeamId | null;
  /** Survival : joueur vainqueur, sinon `null`. */
  playerId: PlayerId | null;
  name: string | null;
  reason: MatchEndReason;
  tick: Tick;
}

export interface TeamScore {
  team: TeamId;
  /**
   * Sens par mode : Dominators détenus, joueurs du camp (Tag), captures (CTF),
   * points de territoire (Breakout), santé restante du vaisseau-mère (Mothership).
   */
  score: number;
  /** Joueurs connectés dans ce camp, morts compris. */
  players: number;
}

export interface MatchState {
  phase: MatchPhase;
  /** Numéro de round, à partir de 1. */
  round: number;
  /** Tick d'entrée dans la phase courante. */
  phaseTick: Tick;
  /** `playing` : fin par limite de temps ; `finished` : redémarrage ; sinon `null`. */
  endTick: Tick | null;
  /** Joueurs connectés requis pour quitter `waiting`. */
  minPlayers: number;
  /** Joueurs connectés, spectateurs compris. */
  players: number;
  /** Renseigné en phase `finished`. */
  result: MatchResult | null;
  scores: TeamScore[];
  objectives: ObjectiveState[];
  /** Survival : joueurs encore en lice pendant le round. */
  survivors?: PlayerId[];
  /** Survival : zone sûre courante ; hors de ce cercle les tanks perdent des PV. */
  safeZone?: { x: number; y: number; radius: number };
}

import type { Vec2 } from './geometry';
import type { ClassId, EntityId, PlayerId, Tick } from './ids';
import type { StatId, StatLevels } from './stats';
import type { EntityState } from './entities';
import type { MatchState } from './match';

/**
 * Intention de contrôle d'un joueur. Le client envoie l'état courant de ses commandes,
 * jamais une position : le serveur décide de tout déplacement.
 * Une intention reste valable jusqu'à la suivante.
 */
export interface PlayerInput {
  /** Croissant par connexion ; le serveur ignore une intention de `seq` inférieur ou égal au dernier reçu. */
  seq: number;
  /** Direction de déplacement voulue, composantes dans [-1, 1]. Le serveur normalise si |move| > 1. */
  move: Vec2;
  /** Point visé, relatif au centre du tank, en unités monde. Sert à l'orientation et au guidage des drones. */
  aim: Vec2;
  /** Tir principal maintenu (clic gauche, espace, tir automatique côté client). */
  fire: boolean;
  /** Action secondaire maintenue (clic droit, Shift) : repousser les drones, etc. */
  alt: boolean;
}

/** Commandes ponctuelles. La simulation les valide et ignore silencieusement les commandes impossibles. */
export type PlayerCommand =
  | { type: 'upgradeStat'; stat: StatId }
  | { type: 'chooseClass'; classId: ClassId }
  | { type: 'respawn' }
  /** Extension additive du protocole v1 ; autorisation uniquement par config.sandbox.cheats. */
  | { type: 'sandbox'; action: SandboxAction }
  /**
   * Ajout v1 (touche H) : prendre ou rendre le contrôle d'un Dominator ou du vaisseau-mère allié
   * proche. Validé par le mode et la distance ; sinon ignoré.
   */
  | { type: 'possess' };

export const SANDBOX_ACTIONS = [
  'levelUp',
  'cycleClass',
  'selfDestruct',
  'toggleGod',
  'summonBoss',
] as const;

export type SandboxAction = (typeof SANDBOX_ACTIONS)[number];

/** État privé du joueur destinataire d'un snapshot. */
export interface SelfState {
  playerId: PlayerId;
  /** Entité pilotée, `null` si mort ou spectateur. */
  entityId: EntityId | null;
  alive: boolean;
  classId: ClassId;
  level: number;
  score: number;
  /** Progression vers le niveau suivant, 0..1. */
  levelProgress: number;
  /** Points de statistiques non dépensés. */
  statPoints: number;
  stats: StatLevels;
  statCaps: StatLevels;
  /** Classes accessibles maintenant ; vide si aucun choix en attente. */
  classChoices: ClassId[];
  /** Demi-étendue visible en unités monde sur le plus grand axe de l'écran. */
  view: number;
  /** Tick à partir duquel `respawn` est accepté ; `null` si vivant ou spectateur. */
  respawnTick: Tick | null;
  /** Survival : éliminé ou arrivé en cours de round, sans tank jusqu'au round suivant. */
  spectator?: boolean;
  /** Entité spéciale pilotée via `possess` ; `entityId` la désigne aussi. */
  possessing?: EntityId;
}

export interface LeaderboardEntry {
  playerId: PlayerId;
  name: string;
  score: number;
  classId: ClassId;
}

/** Contenu d'un snapshot, construit par la simulation pour un joueur donné. */
export interface SnapshotPayload {
  tick: Tick;
  /** `seq` de la dernière intention appliquée pour ce joueur (réconciliation côté client). */
  ackSeq: number;
  self: SelfState;
  /** Entités visibles par ce joueur. Une entité absente a disparu ou est hors de vue. */
  entities: EntityState[];
  /** Classement, présent quand il a changé ou périodiquement (choix de la simulation). */
  leaderboard?: LeaderboardEntry[];
  /** État de partie des modes à objectifs ; absent ailleurs. */
  match?: MatchState;
}

export interface DeathInfo {
  playerId: PlayerId;
  tick: Tick;
  /** Nom affiché du responsable (joueur, forme, boss) ; `null` si inconnu. */
  killerName: string | null;
  score: number;
  level: number;
  classId: ClassId;
  respawnTick: Tick;
}

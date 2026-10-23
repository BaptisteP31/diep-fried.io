import type {
  DeathInfo,
  ModeConfig,
  PlayerCommand,
  PlayerId,
  PlayerInput,
  SnapshotPayload,
  Tick,
} from '@diep-fried/shared';

/**
 * Contrat entre le serveur de salons et la simulation. Le serveur possède le temps réel
 * (horloge, connexions) ; la simulation possède l'état du monde et toutes les règles.
 *
 * Règles :
 * - `step()` avance d'exactement un tick de durée `1 / config.tickRate` seconde.
 * - Déterminisme : même graine, même configuration et même suite d'appels => même état.
 *   Aucun accès à `Date`, `Math.random`, au DOM, à Node ou au réseau.
 * - Les entrées (`setInput`, `queueCommand`) sont mises en attente et appliquées au début
 *   du prochain `step()`, dans l'ordre d'arrivée pour les commandes.
 * - Les identifiants de joueur sont attribués par le serveur ; ceux d'entité par la simulation.
 */
export interface Simulation {
  readonly config: ModeConfig;
  /** Nombre de ticks déjà simulés. */
  readonly tick: Tick;

  /** Ajoute un joueur et fait apparaître son tank au prochain tick. */
  addPlayer(playerId: PlayerId, profile: PlayerProfile): void;
  /** Retire le joueur et son tank. Sans effet si inconnu. */
  removePlayer(playerId: PlayerId): void;

  /** Remplace l'intention courante du joueur. Les `seq` non croissants sont ignorés. */
  setInput(playerId: PlayerId, input: PlayerInput): void;
  /** Met en file une commande ponctuelle ; les commandes invalides sont ignorées au tick. */
  queueCommand(playerId: PlayerId, command: PlayerCommand): void;

  /** Avance d'un tick et renvoie les événements survenus pendant ce tick. */
  step(): SimEvent[];

  /** État visible par ce joueur au tick courant, ou `undefined` si joueur inconnu. */
  snapshotFor(playerId: PlayerId): SnapshotPayload | undefined;
}

export interface PlayerProfile {
  name: string;
}

/** Événements destinés au transport (messages ponctuels, journaux). */
export type SimEvent =
  | { type: 'spawn'; playerId: PlayerId }
  | { type: 'death'; death: DeathInfo }
  | { type: 'levelUp'; playerId: PlayerId; level: number };

export interface SimulationOptions {
  config: ModeConfig;
  /** Graine du générateur pseudo-aléatoire du monde. */
  seed: number;
}

export type SimulationFactory = (options: SimulationOptions) => Simulation;

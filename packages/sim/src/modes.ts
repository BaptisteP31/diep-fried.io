import {
  FIRST_SOLO_TEAM,
  type ModeConfig,
  type ModeId,
  type PlayerId,
  type TeamId,
  type Tick,
  type Vec2,
} from '@diep-fried/shared';
import type { Rng } from './rng';

/** Accès en lecture que la simulation donne aux règles de mode. */
export interface ModeContext {
  readonly config: ModeConfig;
  readonly rng: Rng;
  readonly tick: Tick;
}

/**
 * Règles propres à un mode. La simulation reste générique et délègue ici les décisions
 * de camp, d'apparition et de dégâts. Les modes à objectifs (Domination, Tag...) ajouteront
 * un crochet de fin de tick et l'état d'objectif quand ils seront implémentés.
 */
export interface ModeRules {
  readonly id: ModeId;
  /** Équipe d'un joueur qui rejoint le salon. */
  assignTeam(ctx: ModeContext, playerId: PlayerId): TeamId;
  /** Position d'apparition d'un tank de rayon `radius`. */
  spawnPoint(ctx: ModeContext, team: TeamId, radius: number): Vec2;
  /** Vrai si une entité de l'équipe `attacker` peut blesser une entité de l'équipe `target`. */
  canDamage(ctx: ModeContext, attacker: TeamId, target: TeamId): boolean;
}

/** Chacun pour soi : une équipe par joueur, apparition aléatoire dans l'arène. */
const freeForAll: Omit<ModeRules, 'id'> = {
  assignTeam: (_ctx, playerId) => FIRST_SOLO_TEAM + playerId,
  spawnPoint: (ctx, _team, radius) => {
    const { width, height } = ctx.config.arena;
    const margin = Math.min(radius * 4, width / 2, height / 2);
    return { x: ctx.rng.range(margin, width - margin), y: ctx.rng.range(margin, height - margin) };
  },
  canDamage: (ctx, attacker, target) => attacker !== target || ctx.config.friendlyFire,
};

export const MODE_RULES: Readonly<Record<ModeId, ModeRules>> = {
  ffa: { id: 'ffa', ...freeForAll },
  sandbox: { id: 'sandbox', ...freeForAll },
};

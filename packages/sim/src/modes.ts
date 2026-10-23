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
  /** Comptage des joueurs connectés, morts compris ; optionnel pour les anciens appelants. */
  readonly teamSizes?: ReadonlyMap<TeamId, number>;
}

/** Règle de victoire d'un mode à objectifs ; appliquée par la simulation en fin de tick. */
export type ObjectiveRule =
  'dominators' | 'conversion' | 'flags' | 'territories' | 'survival' | 'mothership';

/**
 * Règles propres à un mode. La simulation reste générique et délègue ici les décisions
 * de camp, d'apparition et de dégâts. `objective` active la machine de rounds et la règle
 * de victoire correspondante (état exposé par `SnapshotPayload.match`).
 */
export interface ModeRules {
  readonly id: ModeId;
  readonly objective?: ObjectiveRule;
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

const teams: Omit<ModeRules, 'id'> = {
  ...freeForAll,
  assignTeam: (ctx, playerId) => {
    let best = ctx.config.teams[0]?.id;
    if (best === undefined) return freeForAll.assignTeam(ctx, playerId);
    for (const team of ctx.config.teams)
      if ((ctx.teamSizes?.get(team.id) ?? 0) < (ctx.teamSizes?.get(best) ?? 0)) best = team.id;
    return best;
  },
  spawnPoint: (ctx, team, radius) => {
    const zone =
      ctx.config.map.zones.find((zone) => zone.kind === 'spawn' && zone.team === team) ??
      ctx.config.map.zones.find((zone) => zone.kind === 'base' && zone.team === team);
    if (!zone) return freeForAll.spawnPoint(ctx, team, radius);
    const { x, y, width, height } = zone.area;
    return {
      x: ctx.rng.range(x + Math.min(radius, width / 2), x + width - Math.min(radius, width / 2)),
      y: ctx.rng.range(y + Math.min(radius, height / 2), y + height - Math.min(radius, height / 2)),
    };
  },
};

export const MODE_RULES: Readonly<Record<ModeId, ModeRules>> = {
  ffa: { id: 'ffa', ...freeForAll },
  sandbox: { id: 'sandbox', ...freeForAll },
  maze: { id: 'maze', ...freeForAll },
  teams2: { id: 'teams2', ...teams },
  teams4: { id: 'teams4', ...teams },
  domination: { id: 'domination', objective: 'dominators', ...teams },
  tag: { id: 'tag', objective: 'conversion', ...teams },
  ctf: { id: 'ctf', objective: 'flags', ...teams },
  breakout: { id: 'breakout', objective: 'territories', ...teams },
  survival: { id: 'survival', objective: 'survival', ...freeForAll },
  mothership: { id: 'mothership', objective: 'mothership', ...teams },
};

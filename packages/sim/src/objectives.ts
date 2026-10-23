import {
  NEUTRAL_TEAM,
  type ModeConfig,
  type ObjectiveSite,
  type PlayerId,
  type Rect,
  type TeamId,
  type Tick,
} from '@diep-fried/shared';
import { OBJECTIVE_BALANCE as O } from './balance';
import { MODE_RULES } from './modes';

/**
 * Règles pures des objectifs (sans accès au monde) : emplacements par défaut, drapeaux CTF,
 * territoires Breakout et zone Survival. Conventions de diep-fried.io, documentées dans le
 * README ; aucune ne prétend reproduire les règles exactes d'un serveur original.
 */

/** Point de sortie de la base vers le centre de l'arène, décalé de `offset`. */
function frontOf(area: Rect, config: ModeConfig, offset: number): { x: number; y: number } {
  const cx = config.arena.width / 2;
  const cy = config.arena.height / 2;
  const bx = area.x + area.width / 2;
  const by = area.y + area.height / 2;
  let dx = cx - bx;
  let dy = cy - by;
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;
  // Distance du centre de la base à son bord le long du rayon, puis décalage.
  const tx = dx === 0 ? Infinity : area.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : area.height / 2 / Math.abs(dy);
  const exit = Math.min(tx, ty) + offset;
  return { x: bx + dx * exit, y: by + dy * exit };
}

/** Objectifs d'un mode, calculés à partir de l'arène et des bases déjà résolues. */
export function defaultObjectiveSites(config: ModeConfig): ObjectiveSite[] {
  const rule = MODE_RULES[config.mode].objective;
  const { width, height } = config.arena;
  const cx = width / 2;
  const cy = height / 2;
  const side = Math.min(width, height);
  const bases = config.map.zones.filter((zone) => zone.kind === 'base');
  const baseOf = (team: TeamId) => bases.find((zone) => zone.team === team)?.area;
  switch (rule) {
    case 'dominators': {
      const d = side * 0.28;
      // Mêmes types à l'est et à l'ouest : les bases latérales voient un Dominator symétrique.
      return [
        { x: cx, y: cy - d, classId: 'dominator-destroyer' },
        { x: cx + d, y: cy, classId: 'dominator-gunner' },
        { x: cx, y: cy + d, classId: 'dominator-trapper' },
        { x: cx - d, y: cy, classId: 'dominator-gunner' },
      ].map((site) => ({ kind: 'dominator', team: NEUTRAL_TEAM, radius: 70, ...site }));
    }
    case 'flags':
    case 'mothership':
      return config.teams.flatMap((team): ObjectiveSite[] => {
        const area = baseOf(team.id) ?? { x: cx - 1, y: cy - 1, width: 2, height: 2 };
        const at = frontOf(area, config, rule === 'flags' ? 250 : 450);
        return rule === 'flags'
          ? [{ kind: 'flag', team: team.id, radius: O.flagRadius, ...at }]
          : [{ kind: 'mothership', team: team.id, radius: 110, classId: 'mothership', ...at }];
      });
    case 'territories': {
      const radius = Math.min(O.territoryRadius, side * 0.06);
      return [
        [0.5, 0.5],
        [0.36, 0.25],
        [0.64, 0.25],
        [0.36, 0.75],
        [0.64, 0.75],
      ].map(([fx, fy]) => ({
        kind: 'territory' as const,
        team: NEUTRAL_TEAM,
        x: width * fx!,
        y: height * fy!,
        radius,
      }));
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------- CTF

export interface FlagRuntime {
  id: number;
  team: TeamId;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  status: 'home' | 'carried' | 'dropped';
  carrier: PlayerId | null;
  returnTick: Tick | null;
}

export interface FlagCarrierView {
  playerId: PlayerId;
  team: TeamId;
  x: number;
  y: number;
  radius: number;
}

export type FlagEvent = {
  flag: FlagRuntime;
  action: 'pickup' | 'drop' | 'return' | 'score';
  playerId: PlayerId | null;
  /** Pour `score` : camp marquant. */
  team: TeamId;
};

/**
 * Un tick CTF. `alive` : tanks vivants par identifiant de joueur croissant (ordre
 * déterministe des prises simultanées). `lastPosition` sert au dépôt d'un porteur disparu.
 * Conventions : prise par contact d'un ennemi ; un allié touchant son drapeau tombé le renvoie ;
 * capture en ramenant le drapeau adverse près de son propre drapeau, **à la base**.
 */
export function stepFlags(
  flags: FlagRuntime[],
  alive: FlagCarrierView[],
  lastPosition: (playerId: PlayerId) => { x: number; y: number } | undefined,
  tick: Tick,
  returnTicks: number,
): FlagEvent[] {
  const events: FlagEvent[] = [];
  const byPlayer = new Map(alive.map((tank) => [tank.playerId, tank]));
  for (const flag of flags) {
    if (flag.status === 'carried') {
      const carrier = byPlayer.get(flag.carrier!);
      if (carrier) {
        flag.x = carrier.x;
        flag.y = carrier.y;
      } else {
        const at = lastPosition(flag.carrier!) ?? { x: flag.x, y: flag.y };
        events.push({ flag, action: 'drop', playerId: flag.carrier, team: flag.team });
        drop(flag, at, tick, returnTicks);
      }
    }
    if (flag.status === 'dropped' && flag.returnTick !== null && tick >= flag.returnTick) {
      home(flag);
      events.push({ flag, action: 'return', playerId: null, team: flag.team });
    }
  }
  for (const tank of alive) {
    for (const flag of flags) {
      if (flag.status === 'carried') continue;
      if (Math.hypot(tank.x - flag.x, tank.y - flag.y) > tank.radius + O.flagRadius) continue;
      if (tank.team === flag.team) {
        if (flag.status === 'dropped') {
          home(flag);
          events.push({ flag, action: 'return', playerId: tank.playerId, team: flag.team });
        }
      } else if (!flags.some((other) => other.carrier === tank.playerId)) {
        flag.status = 'carried';
        flag.carrier = tank.playerId;
        flag.returnTick = null;
        flag.x = tank.x;
        flag.y = tank.y;
        events.push({ flag, action: 'pickup', playerId: tank.playerId, team: flag.team });
      }
    }
  }
  for (const flag of flags) {
    if (flag.status !== 'carried') continue;
    const carrier = byPlayer.get(flag.carrier!)!;
    const own = flags.find((other) => other.team === carrier.team);
    if (!own || own.status !== 'home') continue;
    if (Math.hypot(carrier.x - own.homeX, carrier.y - own.homeY) > O.flagCaptureRadius) continue;
    events.push({ flag, action: 'score', playerId: carrier.playerId, team: carrier.team });
    home(flag);
  }
  return events;
}

export function dropFlag(
  flag: FlagRuntime,
  at: { x: number; y: number },
  tick: Tick,
  returnTicks: number,
): void {
  drop(flag, at, tick, returnTicks);
}

function drop(flag: FlagRuntime, at: { x: number; y: number }, tick: Tick, returnTicks: number) {
  flag.status = 'dropped';
  flag.carrier = null;
  flag.x = at.x;
  flag.y = at.y;
  flag.returnTick = tick + returnTicks;
}

function home(flag: FlagRuntime): void {
  flag.status = 'home';
  flag.carrier = null;
  flag.returnTick = null;
  flag.x = flag.homeX;
  flag.y = flag.homeY;
}

// ---------------------------------------------------------------- Breakout

export interface TerritoryRuntime {
  team: TeamId;
  capturingTeam: TeamId;
  progress: number;
  contested: boolean;
}

/**
 * Convention Breakout du remake : un seul camp présent fait progresser la capture
 * (`captureSeconds`) ; l'avancement d'un autre camp doit d'abord redescendre à 0. Plusieurs
 * camps présents : gel. Personne : décroissance lente. Une capture complète donne directement
 * le territoire au camp, même s'il appartenait à un adversaire. Renvoie vrai à la capture.
 */
export function stepTerritory(
  territory: TerritoryRuntime,
  present: ReadonlySet<TeamId>,
  dt: number,
): boolean {
  territory.contested = present.size > 1;
  if (present.size > 1) return false;
  if (present.size === 0) {
    territory.progress = Math.max(0, territory.progress - O.territoryDecayPerSecond * dt);
    if (territory.progress === 0) territory.capturingTeam = NEUTRAL_TEAM;
    return false;
  }
  const [team] = present as Set<TeamId>;
  const rate = dt / O.territoryCaptureSeconds;
  if (team === territory.team) {
    territory.progress = Math.max(0, territory.progress - rate);
    if (territory.progress === 0) territory.capturingTeam = NEUTRAL_TEAM;
    return false;
  }
  if (territory.capturingTeam !== team && territory.progress > 0) {
    territory.progress = Math.max(0, territory.progress - rate);
    if (territory.progress > 0) return false;
  }
  territory.capturingTeam = team!;
  territory.progress = Math.min(1, territory.progress + rate);
  if (territory.progress < 1) return false;
  territory.team = team!;
  territory.capturingTeam = NEUTRAL_TEAM;
  territory.progress = 0;
  return true;
}

// ---------------------------------------------------------------- Survival

/** Rayon de la zone sûre `elapsed` ticks après le début du round. */
export function safeZoneRadius(config: ModeConfig, elapsed: number): number {
  const { width, height } = config.arena;
  const initial = Math.hypot(width, height) / 2;
  const shrink = config.match?.shrink;
  if (!shrink) return initial;
  const final = Math.min(width, height) * shrink.finalRadiusFraction;
  const t = Math.max(0, Math.min(1, (elapsed - shrink.delayTicks) / shrink.durationTicks));
  return initial + (final - initial) * t;
}

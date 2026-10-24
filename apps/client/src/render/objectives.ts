import type { MatchState, ModeConfig, TeamId } from '@diep-fried/shared';
import { objectiveLabel } from '../ui/match-model';
import { TEAM_COLORS } from './palette';

export interface ObjectiveProjection {
  point: (at: { x: number; y: number }) => { x: number; y: number };
  scale: number;
  bounds: { x: number; y: number; width: number; height: number };
  minimap?: boolean;
}

/** Calque placé sous les tanks. Positions globales match, indépendantes de entities/FOV. */
export function drawObjectives(
  ctx: CanvasRenderingContext2D,
  projection: ObjectiveProjection,
  match: MatchState | undefined,
  config: ModeConfig,
): void {
  if (!match) return;
  const { point, scale, bounds, minimap } = projection;
  const color = (team: TeamId) => {
    const definition = config.teams.find((t) => t.id === team);
    return definition ? TEAM_COLORS[definition.color] : '#929aa2';
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.clip();
  if (match.safeZone) {
    const center = point(match.safeZone);
    const radius = match.safeZone.radius * scale;
    ctx.fillStyle = 'rgba(211, 62, 78, 0.20)';
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.moveTo(center.x + radius, center.y);
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#449e66';
    ctx.lineWidth = minimap ? 2 : 3;
    ctx.stroke();
  }
  for (const objective of match.objectives) {
    // Le serveur conserve le statut porté mais ne publie pas la position d'un porteur camouflé.
    if (objective.flag?.positionHidden) continue;
    const at = point(objective);
    const radius = minimap ? 5 : Math.max(14, objective.radius * scale + 7);
    const teamColor = color(objective.team);
    ctx.strokeStyle = teamColor;
    ctx.lineWidth = minimap ? 2 : 3;
    ctx.setLineDash(objective.contested || objective.flag?.status === 'dropped' ? [4, 3] : []);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!minimap && objective.kind === 'territory' && objective.progress > 0) {
      ctx.strokeStyle = color(objective.capturingTeam ?? objective.team);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(
        at.x,
        at.y,
        radius + 5,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, objective.progress),
      );
      ctx.stroke();
    }
    if (objective.flag) {
      // Petit fanion décalé : le porteur reste visible et le drapeau conserve sa couleur.
      const fx = at.x + (minimap ? 2 : radius + 2);
      const fy = at.y - (minimap ? 3 : 12);
      ctx.strokeStyle = teamColor;
      ctx.beginPath();
      ctx.moveTo(fx, fy + (minimap ? 7 : 20));
      ctx.lineTo(fx, fy);
      ctx.lineTo(fx + (minimap ? 5 : 15), fy + (minimap ? 2 : 6));
      ctx.lineTo(fx, fy + (minimap ? 4 : 11));
      ctx.stroke();
      if (objective.flag.status !== 'home') {
        const home = point({ x: objective.flag.homeX, y: objective.flag.homeY });
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(home.x, home.y, minimap ? 3 : 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.font = `700 ${minimap ? 9 : 12}px Ubuntu, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelY = Math.max(bounds.y + 12, at.y - radius - 4);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#202833';
    ctx.strokeText(objectiveLabel(objective), at.x, labelY);
    ctx.fillStyle = '#fff';
    ctx.fillText(objectiveLabel(objective), at.x, labelY);
  }
  ctx.restore();
}

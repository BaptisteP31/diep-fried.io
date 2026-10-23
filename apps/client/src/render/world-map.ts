import type { ModeConfig } from '@diep-fried/shared';
import type { Camera } from './camera';
import { worldToScreen } from './camera';
import { PALETTE, TEAM_COLORS } from './palette';

/** Les mêmes rectangles que la simulation : aucune géométrie de collision inventée côté client. */
export function drawWorldMap(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  config: ModeConfig,
): void {
  ctx.save();
  for (const zone of config.map.zones) {
    if (zone.kind !== 'base') continue;
    const team = config.teams.find((team) => team.id === zone.team);
    const at = worldToScreen(camera, zone.area);
    ctx.fillStyle = team ? TEAM_COLORS[team.color] : PALETTE.neutral;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(at.x, at.y, zone.area.width * camera.scale, zone.area.height * camera.scale);
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    ctx.strokeRect(at.x, at.y, zone.area.width * camera.scale, zone.area.height * camera.scale);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.mazeWall;
  ctx.strokeStyle = PALETTE.outline;
  ctx.lineWidth = 2;
  for (const wall of config.map.walls) {
    const at = worldToScreen(camera, wall);
    ctx.fillRect(at.x, at.y, wall.width * camera.scale, wall.height * camera.scale);
    ctx.strokeRect(at.x, at.y, wall.width * camera.scale, wall.height * camera.scale);
  }
  ctx.restore();
}

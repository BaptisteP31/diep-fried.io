import type { ModeConfig, TankState } from '@diep-fried/shared';
import { PALETTE, TEAM_COLORS } from './palette';
import type { RenderFrame } from '../state/snapshot-buffer';

/**
 * Dessin de la minicarte sur un contexte Canvas 2D.
 *
 * @param ctx Contexte du canvas.
 * @param width Largeur du conteneur en pixels CSS.
 * @param height Hauteur du conteneur en pixels CSS.
 * @param frame Données de l'image courante.
 * @param config Configuration du salon et dimensions de l'arène.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: RenderFrame | null,
  config: ModeConfig | null,
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const padding = 6;
  const boxWidth = width - padding * 2;
  const boxHeight = height - padding * 2;

  // Calcul du rectangle de l'arène conservant son ratio d'aspect
  const arenaW = config?.arena.width ?? 1000;
  const arenaH = config?.arena.height ?? 1000;
  const arenaAspect = arenaW / arenaH;
  const boxAspect = boxWidth / boxHeight;

  let mapW = boxWidth;
  let mapH = boxHeight;
  if (arenaAspect > boxAspect) {
    mapH = boxWidth / arenaAspect;
  } else {
    mapW = boxHeight * arenaAspect;
  }

  const mapX = padding + (boxWidth - mapW) / 2;
  const mapY = padding + (boxHeight - mapH) / 2;

  // Fond et bordure de la minicarte
  ctx.fillStyle = PALETTE.minimapBackground;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = PALETTE.minimapBorder;
  ctx.lineWidth = 3;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  if (!config || !frame) {
    ctx.restore();
    return;
  }

  const toMapX = (worldX: number) => mapX + (worldX / arenaW) * mapW;
  const toMapY = (worldY: number) => mapY + (worldY / arenaH) * mapH;

  // Zones de base éventuelles (modes équipes)
  if (config.map.zones) {
    for (const zone of config.map.zones) {
      const zx = toMapX(zone.area.x);
      const zy = toMapY(zone.area.y);
      const zw = (zone.area.width / arenaW) * mapW;
      const zh = (zone.area.height / arenaH) * mapH;
      const teamDef = config.teams.find((t) => t.id === zone.team);
      const color = teamDef ? TEAM_COLORS[teamDef.color] : PALETTE.friendly;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(zx, zy, zw, zh);
      ctx.globalAlpha = 1.0;
    }
  }

  // Murs éventuels (mode Maze)
  if (config.map.walls) {
    ctx.fillStyle = PALETTE.mazeWall;
    for (const wall of config.map.walls) {
      const wx = toMapX(wall.x);
      const wy = toMapY(wall.y);
      const ww = (wall.width / arenaW) * mapW;
      const wh = (wall.height / arenaH) * mapH;
      ctx.fillRect(wx, wy, ww, wh);
    }
  }

  // Joueur local : triangle noir orienté selon sa visée
  const own = frame.entities.find(
    (e): e is TankState => e.kind === 'tank' && e.id === frame.self.entityId,
  );
  if (own) {
    const px = toMapX(own.x);
    const py = toMapY(own.y);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(own.angle);
    ctx.fillStyle = PALETTE.minimapArrow;

    // Triangle classique diep.io pointant vers +x
    const size = 5;
    ctx.beginPath();
    ctx.moveTo(size * 1.4, 0);
    ctx.lineTo(-size, -size * 0.85);
    ctx.lineTo(-size * 0.4, 0);
    ctx.lineTo(-size, size * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

import { describe, expect, it, vi } from 'vitest';
import { resolveModeConfig } from '@diep-fried/shared';
import { makeCamera, worldToScreen } from '../src/render/camera';
import { drawWorldMap } from '../src/render/world-map';

describe('carte du monde visible', () => {
  it('dessine les murs et les frontières de base dans le repère de la caméra', () => {
    const config = resolveModeConfig('teams2');
    config.map.walls = [{ x: 400, y: 200, width: 30, height: 300 }];
    config.map.zones = [
      { kind: 'base', team: 1, area: { x: 0, y: 0, width: 300, height: 1000 } },
      { kind: 'spawn', team: 1, area: { x: 50, y: 50, width: 100, height: 100 } },
    ];
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn() };
    const camera = makeCamera({ x: 500, y: 500 }, 900, 1200, 800);
    drawWorldMap(ctx as unknown as CanvasRenderingContext2D, camera, config);
    const at = worldToScreen(camera, config.map.walls[0]!);
    expect(ctx.fillRect).toHaveBeenCalledWith(at.x, at.y, 30 * camera.scale, 300 * camera.scale);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('ne dessine aucun obstacle ni sanctuaire si la carte est vide', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn() };
    drawWorldMap(
      ctx as unknown as CanvasRenderingContext2D,
      makeCamera({ x: 0, y: 0 }, 900, 1200, 800),
      resolveModeConfig('ffa'),
    );
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

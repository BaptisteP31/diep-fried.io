import { describe, expect, it } from 'vitest';
import { makeCamera, worldToScreen } from '../src/render/camera';

describe('camera', () => {
  it('calcule l’échelle selon le plus grand axe du viewport', () => {
    // Largeur plus grande : 1920x1080 avec demi-étendue (view) = 960 => scale = (1920 / 2) / 960 = 1
    const cameraWide = makeCamera({ x: 0, y: 0 }, 960, 1920, 1080);
    expect(cameraWide.scale).toBeCloseTo(1);

    // Hauteur plus grande : 1080x1920 avec demi-étendue = 960 => scale = (1920 / 2) / 960 = 1
    const cameraTall = makeCamera({ x: 0, y: 0 }, 960, 1080, 1920);
    expect(cameraTall.scale).toBeCloseTo(1);
  });

  it('projette le centre du monde au centre du viewport écran', () => {
    const center = { x: 500, y: 300 };
    const camera = makeCamera(center, 900, 1000, 600);
    const screenCenter = worldToScreen(camera, center);
    expect(screenCenter.x).toBeCloseTo(500);
    expect(screenCenter.y).toBeCloseTo(300);
  });

  it('projette les points distants proportionnellement à l’échelle', () => {
    const center = { x: 100, y: 100 };
    const camera = makeCamera(center, 500, 1000, 500); // max(w,h) = 1000, view = 500 => scale = 1
    const point = { x: 150, y: 80 };
    const screen = worldToScreen(camera, point);
    // x = (150 - 100) * 1 + 500 = 550
    // y = (80 - 100) * 1 + 250 = 230
    expect(screen.x).toBeCloseTo(550);
    expect(screen.y).toBeCloseTo(230);
  });
});

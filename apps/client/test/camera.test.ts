import { describe, expect, it } from 'vitest';
import { makeCamera, screenToWorld, worldToScreen } from '../src/render/camera';

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
    expect(screen.x).toBeCloseTo(550);
    expect(screen.y).toBeCloseTo(230);
  });

  it('fournit une bijection exacte entre monde et écran via screenToWorld', () => {
    const center = { x: 250, y: -400 };
    const camera = makeCamera(center, 750, 1280, 720);
    const worldPoint = { x: 120, y: -350 };
    const screen = worldToScreen(camera, worldPoint);
    const roundTrip = screenToWorld(camera, screen);

    expect(roundTrip.x).toBeCloseTo(worldPoint.x);
    expect(roundTrip.y).toBeCloseTo(worldPoint.y);
  });

  describe('Predator cameraOffset et cohérence visée', () => {
    it('décale le centre de la caméra selon le cameraOffset de Predator', () => {
      const tankPos = { x: 1000, y: 1000 };
      const predatorOffset = { x: 400, y: -200 };
      const effectiveCenter = {
        x: tankPos.x + predatorOffset.x,
        y: tankPos.y + predatorOffset.y,
      };

      const camera = makeCamera(effectiveCenter, 900, 1600, 900);
      // Le centre effectif (décalé) est au centre de l'écran
      const screenCenter = worldToScreen(camera, effectiveCenter);
      expect(screenCenter.x).toBeCloseTo(800);
      expect(screenCenter.y).toBeCloseTo(450);

      // Le tank lui-même apparaît décalé sur l'écran
      const tankScreen = worldToScreen(camera, tankPos);
      expect(tankScreen.x).toBeCloseTo(800 - predatorOffset.x * camera.scale);
      expect(tankScreen.y).toBeCloseTo(450 - predatorOffset.y * camera.scale);
    });

    it('conserve une conversion de visée rigoureusement cohérente avec le monde lors du décalage caméra', () => {
      const tankPos = { x: 500, y: 600 };
      const cameraOffset = { x: 300, y: 150 };
      const camera = makeCamera(
        { x: tankPos.x + cameraOffset.x, y: tankPos.y + cameraOffset.y },
        900,
        1200,
        800,
      );

      // Position écran du tank
      const tankScreen = worldToScreen(camera, tankPos);

      // Curseur de la souris à une position écran quelconque
      const mouseScreen = { x: 850, y: 350 };

      // Calcul de la visée côté client dans InputController :
      // aim = (mouseScreen - tankScreen) / camera.scale
      const aim = {
        x: (mouseScreen.x - tankScreen.x) / camera.scale,
        y: (mouseScreen.y - tankScreen.y) / camera.scale,
      };

      // Position monde pointée par la souris via screenToWorld
      const mouseWorld = screenToWorld(camera, mouseScreen);

      // Le vecteur de visée (souris - tank) en coordonnées monde doit correspondre exactement à `aim`
      expect(mouseWorld.x - tankPos.x).toBeCloseTo(aim.x);
      expect(mouseWorld.y - tankPos.y).toBeCloseTo(aim.y);
    });
  });
});

import type { Vec2 } from '@diep-fried/shared';

/** Transformation monde -> écran (pixels CSS), centrée sur un point du monde. */
export interface Camera {
  center: Vec2;
  /** Pixels CSS par unité monde. */
  scale: number;
  viewport: { width: number; height: number };
}

/** `view` : demi-étendue visible en unités monde sur le plus grand axe de l'écran. */
export function makeCamera(center: Vec2, view: number, width: number, height: number): Camera {
  return { center, scale: Math.max(width, height) / 2 / view, viewport: { width, height } };
}

export function worldToScreen(camera: Camera, point: Vec2): Vec2 {
  return {
    x: (point.x - camera.center.x) * camera.scale + camera.viewport.width / 2,
    y: (point.y - camera.center.y) * camera.scale + camera.viewport.height / 2,
  };
}

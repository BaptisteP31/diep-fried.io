import type { Rect } from '@diep-fried/shared';
import { describe, expect, it } from 'vitest';
import {
  circleVsWall,
  circleVsWalls,
  resolveCircleVsWall,
  resolveCircleVsWalls,
  sweepCircleVsWall,
  sweepCircleVsWalls,
} from '../../src/maps';

describe('Collision & Resolution Helpers (circleVsWall & sweepCircleVsWall)', () => {
  const wall: Rect = { x: 100, y: 100, width: 200, height: 30 };
  const radius = 25;

  describe('circleVsWall (détection discrète)', () => {
    it('détecte un contact avec les faces du mur', () => {
      // Au-dessus
      expect(circleVsWall(150, 80, radius, wall)).toBe(true);
      // En-dessous
      expect(circleVsWall(150, 150, radius, wall)).toBe(true);
      // À gauche
      expect(circleVsWall(80, 115, radius, wall)).toBe(true);
      // À droite
      expect(circleVsWall(320, 115, radius, wall)).toBe(true);
    });

    it('détecte un contact avec les coins arrondis', () => {
      // Coin haut-gauche à (100, 100)
      // Distance = sqrt(15^2 + 15^2) = ~21.2 < 25
      expect(circleVsWall(85, 85, radius, wall)).toBe(true);

      // En dehors de la zone arrondie : distance = sqrt(20^2 + 20^2) = ~28.3 > 25
      expect(circleVsWall(80, 80, radius, wall)).toBe(false);
    });

    it('retourne faux quand le cercle est à distance sans contact', () => {
      expect(circleVsWall(150, 50, radius, wall)).toBe(false);
      expect(circleVsWall(50, 115, radius, wall)).toBe(false);
      expect(circleVsWall(350, 115, radius, wall)).toBe(false);
    });

    it('supporte les arguments sous forme d’objet Circle', () => {
      expect(circleVsWall({ x: 150, y: 80, radius: 25 }, wall)).toBe(true);
      expect(circleVsWall({ x: 150, y: 50, radius: 25 }, wall)).toBe(false);
    });

    it('circleVsWalls teste une liste complète de murs', () => {
      const walls: Rect[] = [{ x: 0, y: 0, width: 50, height: 50 }, wall];
      expect(circleVsWalls(150, 80, radius, walls)).toBe(true);
      expect(circleVsWalls(500, 500, radius, walls)).toBe(false);
    });
  });

  describe('resolveCircleVsWall (résolution de pénétration)', () => {
    it('repousse le cercle tangentiellement face à un bord plat', () => {
      // Pénétration de 5 unités depuis le dessus (y = 80, bord à 100, rayon 25 -> dist = 20)
      const res = resolveCircleVsWall(150, 80, radius, wall);

      expect(res.collided).toBe(true);
      expect(res.y).toBeCloseTo(100 - radius); // 75
      expect(res.x).toBeCloseTo(150);
      expect(res.normalX).toBeCloseTo(0);
      expect(res.normalY).toBeCloseTo(-1);
      expect(res.depth).toBeCloseTo(5);
    });

    it('repousse le cercle diagonalement face à un coin arrondi', () => {
      // Coin supérieur gauche (100, 100), position (90, 90) -> dx = -10, dy = -10, dist = 14.14
      const res = resolveCircleVsWall(90, 90, radius, wall);

      expect(res.collided).toBe(true);
      expect(res.normalX).toBeCloseTo(-Math.SQRT1_2, 3);
      expect(res.normalY).toBeCloseTo(-Math.SQRT1_2, 3);

      // Après résolution, la distance au coin doit être exactement égale au rayon
      const distAfter = Math.hypot(res.x - 100, res.y - 100);
      expect(distAfter).toBeCloseTo(radius, 4);
    });

    it('expulse un cercle dont le centre est à l’intérieur du mur vers le bord le plus proche', () => {
      // Centre à (150, 105) dans le mur [100..300] x [100..130]
      // Plus proche du bord haut (y = 100, distance = 5)
      const res = resolveCircleVsWall(150, 105, radius, wall);

      expect(res.collided).toBe(true);
      expect(res.y).toBeCloseTo(100 - radius);
      expect(res.normalY).toBeCloseTo(-1);
    });

    it('laisse inchangé un cercle sans collision', () => {
      const res = resolveCircleVsWall(150, 50, radius, wall);
      expect(res.collided).toBe(false);
      expect(res.x).toBe(150);
      expect(res.y).toBe(50);
      expect(res.depth).toBe(0);
    });

    it('resolveCircleVsWalls gère les coins rentrants formés par deux murs perpendiculaires', () => {
      const cornerWalls: Rect[] = [
        { x: 100, y: 100, width: 200, height: 30 }, // Mur horizontal
        { x: 100, y: 100, width: 30, height: 200 }, // Mur vertical
      ];

      // Cercle placé dans l'angle intérieur à (110, 110)
      const res = resolveCircleVsWalls(110, 110, radius, cornerWalls, 4);
      expect(res.collided).toBe(true);

      // La position résolue ne doit plus pénétrer aucun des deux murs
      for (const w of cornerWalls) {
        expect(circleVsWall(res.x, res.y, radius, w)).toBe(false);
      }
    });
  });

  describe('sweepCircleVsWall (balayage continu & prévention du tunneling)', () => {
    it('intercepte une traversée à grande vitesse à travers un mur mince', () => {
      // Déplacement de y = 50 à y = 200 (150 unités franchies à travers un mur de 30 unités)
      const startX = 150;
      const startY = 50;
      const endX = 150;
      const endY = 200;

      const hit = sweepCircleVsWall(startX, startY, endX, endY, radius, wall);

      expect(hit.hit).toBe(true);
      // Contact quand le bord inférieur du cercle touche y = 100 -> centre à y = 75
      // t = (75 - 50) / (200 - 50) = 25 / 150 = 0.1666...
      expect(hit.time).toBeCloseTo(25 / 150, 4);
      expect(hit.normalX).toBe(0);
      expect(hit.normalY).toBe(-1);
      expect(hit.contactX).toBeCloseTo(150);
      expect(hit.contactY).toBeCloseTo(75);
    });

    it('intercepte un balayage arrivant sur un coin arrondi', () => {
      const startX = 60;
      const startY = 60;
      const endX = 120;
      const endY = 120;

      const hit = sweepCircleVsWall(startX, startY, endX, endY, radius, wall);

      expect(hit.hit).toBe(true);
      expect(hit.time).toBeGreaterThan(0);
      expect(hit.time).toBeLessThan(1);
      // Normale diagonale opposée au vecteur de déplacement
      expect(hit.normalX).toBeLessThan(0);
      expect(hit.normalY).toBeLessThan(0);

      // Vérifier que la distance au coin (100, 100) à l'impact est exactement radius
      const dist = Math.hypot(hit.contactX - 100, hit.contactY - 100);
      expect(dist).toBeCloseTo(radius, 4);
    });

    it('signale un contact immédiat t = 0 si le cercle pénètre déjà au départ', () => {
      const hit = sweepCircleVsWall(150, 80, 150, 120, radius, wall);
      expect(hit.hit).toBe(true);
      expect(hit.time).toBe(0);
    });

    it('ne détecte aucun hit si la trajectoire évite le mur', () => {
      const hit = sweepCircleVsWall(50, 50, 50, 200, radius, wall);
      expect(hit.hit).toBe(false);
      expect(hit.time).toBe(1);
    });

    it('sweepCircleVsWalls sélectionne le premier mur rencontré dans une trajectoire', () => {
      const walls: Rect[] = [
        { x: 100, y: 150, width: 200, height: 20 }, // Second mur
        { x: 100, y: 80, width: 200, height: 20 }, // Premier mur
      ];

      // Mouvement du haut vers le bas
      const hit = sweepCircleVsWalls(150, 20, 150, 300, radius, walls);

      expect(hit.hit).toBe(true);
      expect(hit.wallIndex).toBe(1); // Le mur à y = 80 est touché en premier
      expect(hit.contactY).toBeCloseTo(80 - radius);
    });
  });
});

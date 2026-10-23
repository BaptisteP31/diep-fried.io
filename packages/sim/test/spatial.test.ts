import { describe, expect, it } from 'vitest';
import { collisionCandidates, contactTime, type MovingCircle } from '../src/spatial';

const circle = (
  id: number,
  prevX: number,
  prevY: number,
  x: number,
  y: number,
  radius = 5,
): MovingCircle => ({ id, prevX, prevY, x, y, radius });

describe('détection continue et grille spatiale', () => {
  it('détecte une cible entièrement traversée en un tick, et le temps de premier impact', () => {
    const bullet = circle(1, -1000, 0, 1000, 0);
    const target = circle(2, 0, 0, 0, 0, 25);
    expect(contactTime(bullet, target)).toBeCloseTo(0.485);
    expect(collisionCandidates([bullet, target], 128)).toEqual([[bullet, target]]);
  });

  it('détecte deux balles rapides en mouvement relatif malgré des positions finales inversées', () => {
    const a = circle(1, -1000, 0, 1000, 0);
    const b = circle(2, 1000, 0, -1000, 0);
    expect(contactTime(a, b)).toBeCloseTo(0.4975);
    expect(collisionCandidates([b, a], 128)).toEqual([[a, b]]);
  });

  it('écarte un passage parallèle, détecte une tangence et les cercles déjà superposés', () => {
    const target = circle(2, 0, 0, 0, 0);
    expect(contactTime(circle(1, -100, 11, 100, 11), target)).toBeNull();
    expect(contactTime(circle(1, -100, 10, 100, 10), target)).toBeCloseTo(0.5);
    expect(contactTime(circle(1, 0, 0, 100, 100), target)).toBe(0);
    expect(contactTime(circle(1, 20, 0, 100, 0), target)).toBeNull();
  });

  it('déduplique les paires dans de multiples cellules et écarte les zones éloignées', () => {
    const a = circle(1, -300, -300, 300, 300);
    const b = circle(2, 300, 300, -300, -300);
    const far = circle(3, 2000, 2000, 2010, 2000);
    expect(collisionCandidates([a, b, far], 128)).toEqual([[a, b]]);
  });
});

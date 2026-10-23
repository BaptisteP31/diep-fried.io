import { describe, expect, it } from 'vitest';
import { calculateBarrelRecoil, calculateRecoilOffset } from '../src/render/recoil';

describe('calculateBarrelRecoil', () => {
  it('renvoie 0 si aucun tir n’a eu lieu', () => {
    expect(calculateBarrelRecoil(10, undefined)).toBe(0);
    expect(calculateBarrelRecoil(10, -1)).toBe(0);
  });

  it('renvoie 1.0 exactement au tick du tir', () => {
    expect(calculateBarrelRecoil(10, 10, 4)).toBe(1);
  });

  it('décroît de manière quadratique pendant la durée configurée', () => {
    const duration = 4;
    // À mi-chemin (elapsed = 2 ticks) : (1 - 2/4)^2 = 0.25
    expect(calculateBarrelRecoil(12, 10, duration)).toBeCloseTo(0.25);
    // Aux 3/4 (elapsed = 3 ticks) : (1 - 3/4)^2 = 0.0625
    expect(calculateBarrelRecoil(13, 10, duration)).toBeCloseTo(0.0625);
  });

  it('revient à 0 une fois la durée écoulée', () => {
    expect(calculateBarrelRecoil(14, 10, 4)).toBe(0);
    expect(calculateBarrelRecoil(20, 10, 4)).toBe(0);
  });

  it('renvoie 0 si le tick du tir est dans le futur', () => {
    expect(calculateBarrelRecoil(8, 10, 4)).toBe(0);
  });
});

describe('calculateRecoilOffset', () => {
  it('calcule le recul en proportion de la longueur du canon et du rayon', () => {
    const offset = calculateRecoilOffset(2, 20, 1.0, 1);
    // 2 * 20 * 0.2 * 1 * 1 = 8 unités monde
    expect(offset).toBeCloseTo(8);
  });

  it('annule le recul si le multiplicateur du canon est nul', () => {
    expect(calculateRecoilOffset(2, 20, 1.0, 0)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { Rng } from '../src';

const draw = (rng: Rng, count: number) => Array.from({ length: count }, () => rng.next());

describe('Rng', () => {
  it('est reproductible pour une même graine', () => {
    expect(draw(new Rng(1234), 50)).toEqual(draw(new Rng(1234), 50));
    expect(draw(new Rng(1234), 50)).not.toEqual(draw(new Rng(1235), 50));
  });

  it('reste dans les bornes demandées', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const int = rng.int(-2, 2);
      expect(Number.isInteger(int) && int >= -2 && int <= 2).toBe(true);
    }
  });

  it('couvre toutes les valeurs entières', () => {
    const rng = new Rng(42);
    const seen = new Set(Array.from({ length: 1000 }, () => rng.int(1, 6)));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

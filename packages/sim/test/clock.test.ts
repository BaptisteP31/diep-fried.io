import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src';

describe('FixedStepClock', () => {
  it('accumule les fractions de tick', () => {
    const clock = new FixedStepClock(25); // 40 ms
    expect(clock.advance(30)).toBe(0);
    expect(clock.advance(30)).toBe(1); // 60 ms cumulés
    expect(clock.advance(20)).toBe(1); // 20 + 20 restants
    expect(clock.advance(119)).toBe(2);
  });

  it('abandonne le retard au-delà du plafond', () => {
    const clock = new FixedStepClock(10, 3); // 100 ms
    expect(clock.advance(1050)).toBe(3);
    expect(clock.totalDroppedMs).toBe(700);
    expect(clock.advance(50)).toBe(1); // 50 ms résiduels conservés
  });

  it('ignore un temps négatif et refuse un tickRate nul', () => {
    expect(new FixedStepClock(30).advance(-500)).toBe(0);
    expect(() => new FixedStepClock(0)).toThrow(RangeError);
  });
});

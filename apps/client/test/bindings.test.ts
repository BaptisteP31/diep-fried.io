import { describe, expect, it } from 'vitest';
import { STAT_IDS } from '@diep-fried/shared';
import { DEFAULT_BINDINGS, moveIntent, type HeldAction } from '../src/input/bindings';

describe('moveIntent', () => {
  const intent = (...actions: HeldAction[]) => moveIntent(new Set(actions));

  it('normalise les diagonales', () => {
    const { x, y } = intent('up', 'right');
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
  });

  it('annule les directions opposées', () => {
    expect(intent('left', 'right')).toEqual({ x: 0, y: 0 });
    expect(intent()).toEqual({ x: 0, y: 0 });
  });
});

describe('DEFAULT_BINDINGS', () => {
  it('associe les chiffres 1 à 8 aux statistiques dans l’ordre du contrat', () => {
    STAT_IDS.forEach((stat, index) => {
      expect(DEFAULT_BINDINGS[`Digit${index + 1}`]).toEqual({ kind: 'stat', stat });
    });
  });

  it('utilise des codes physiques, donc ZQSD en AZERTY', () => {
    // Sur AZERTY, la touche Z produit event.code === 'KeyW', Q => 'KeyA'.
    expect(DEFAULT_BINDINGS.KeyW).toEqual({ kind: 'held', action: 'up' });
    expect(DEFAULT_BINDINGS.KeyA).toEqual({ kind: 'held', action: 'left' });
  });
});

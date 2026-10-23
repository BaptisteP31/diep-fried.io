import { describe, expect, it } from 'vitest';
import type { EntityState } from '@diep-fried/shared';
import { FadeTracker } from '../src/render/fade-tracker';

function makeEntity(id: number): EntityState {
  return {
    kind: 'shape',
    id,
    x: 10,
    y: 20,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 12,
    team: 0,
    shape: 'square',
    shiny: false,
    health: 10,
    maxHealth: 10,
  };
}

describe('FadeTracker', () => {
  it('ne produit aucun fondu lorsque toutes les entités restent visibles', () => {
    const tracker = new FadeTracker(200);
    const entity = makeEntity(1);
    tracker.update([entity], 1000);
    tracker.update([entity], 1050);
    expect(tracker.getFading(1050)).toHaveLength(0);
  });

  it('démarre le fondu à alpha 1.0 dès la disparition d’une entité', () => {
    const tracker = new FadeTracker(200);
    const entity = makeEntity(1);
    tracker.update([entity], 1000);
    // Disparition à t = 1100
    tracker.update([], 1100);

    const fading = tracker.getFading(1100);
    expect(fading).toHaveLength(1);
    expect(fading[0]!.entity.id).toBe(1);
    expect(fading[0]!.alpha).toBeCloseTo(1.0);
  });

  it('diminue linéairement l’alpha au fil du temps jusqu’à expiration', () => {
    const tracker = new FadeTracker(200);
    const entity = makeEntity(1);
    tracker.update([entity], 1000);
    tracker.update([], 1100); // début du fondu

    // À t = 1200 (100 ms écoulées sur 200 ms) => alpha = 0.5
    const mid = tracker.getFading(1200);
    expect(mid).toHaveLength(1);
    expect(mid[0]!.alpha).toBeCloseTo(0.5);

    // À t = 1300 (200 ms écoulées) => expiré et retiré
    const expired = tracker.getFading(1300);
    expect(expired).toHaveLength(0);
  });

  it('interrompt le fondu si l’entité réapparaît', () => {
    const tracker = new FadeTracker(200);
    const entity = makeEntity(1);
    tracker.update([entity], 1000);
    tracker.update([], 1050); // disparaît
    expect(tracker.getFading(1060)).toHaveLength(1);

    tracker.update([entity], 1070); // réapparaît
    expect(tracker.getFading(1070)).toHaveLength(0);
  });

  it('efface tout avec clear()', () => {
    const tracker = new FadeTracker(200);
    const entity = makeEntity(1);
    tracker.update([entity], 1000);
    tracker.update([], 1050);
    tracker.clear();
    expect(tracker.getFading(1060)).toHaveLength(0);
  });
});

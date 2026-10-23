import { describe, expect, it } from 'vitest';
import { emptyStatLevels, type EntityState, type SnapshotPayload } from '@diep-fried/shared';
import { SnapshotBuffer, lerpAngle } from '../src/state/snapshot-buffer';

const TICK_MS = 50;

function shape(id: number, x: number, angle = 0): EntityState {
  return {
    kind: 'shape',
    id,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    angle,
    radius: 10,
    team: 0,
    shape: 'square',
    shiny: false,
    health: 1,
    maxHealth: 1,
  };
}

function snapshot(tick: number, entities: EntityState[]): SnapshotPayload {
  return {
    tick,
    ackSeq: 0,
    entities,
    self: {
      playerId: 1,
      entityId: null,
      alive: false,
      classId: 'tank',
      level: 1,
      score: 0,
      levelProgress: 0,
      statPoints: 0,
      stats: emptyStatLevels(),
      statCaps: emptyStatLevels(),
      classChoices: [],
      view: 900,
      respawnTick: null,
    },
  };
}

describe('SnapshotBuffer', () => {
  it('interpole les positions entre deux snapshots avec le retard configuré', () => {
    const buffer = new SnapshotBuffer(TICK_MS, 100);
    // Arrivées sans gigue : tick 10 à t=1000, tick 12 à t=1100.
    buffer.push(snapshot(10, [shape(1, 0)]), 1000);
    buffer.push(snapshot(12, [shape(1, 100)]), 1100);
    // Rendu à t=1150 => instant serveur 1150 - 500 - 100 = 550 ms = tick 11.
    const frame = buffer.sample(1150)!;
    expect(frame.tick).toBeCloseTo(11);
    expect(frame.entities[0]!.x).toBeCloseTo(50);
  });

  it('conserve le dernier état quand le rendu dépasse le snapshot le plus récent', () => {
    const buffer = new SnapshotBuffer(TICK_MS, 0);
    buffer.push(snapshot(10, [shape(1, 0)]), 1000);
    buffer.push(snapshot(12, [shape(1, 100)]), 1100);
    expect(buffer.sample(5000)!.entities[0]!.x).toBe(100);
  });

  it('montre une nouvelle entité sans interpolation et retire celles disparues', () => {
    const buffer = new SnapshotBuffer(TICK_MS, 0);
    buffer.push(snapshot(10, [shape(1, 0), shape(2, 0)]), 1000);
    buffer.push(snapshot(12, [shape(1, 100), shape(3, 40)]), 1100);
    const frame = buffer.sample(1050)!;
    expect(frame.entities.map((entity) => entity.id)).toEqual([1, 3]);
    expect(frame.entities[1]!.x).toBe(40);
  });

  it('ignore un snapshot dupliqué ou en retard', () => {
    const buffer = new SnapshotBuffer(TICK_MS, 0);
    buffer.push(snapshot(12, [shape(1, 100)]), 1000);
    buffer.push(snapshot(10, [shape(1, 0)]), 1010);
    expect(buffer.latest()!.tick).toBe(12);
  });

  it('se cale sur le paquet le moins retardé', () => {
    const buffer = new SnapshotBuffer(TICK_MS, 0);
    buffer.push(snapshot(10, [shape(1, 0)]), 1080); // arrivé 80 ms en retard
    buffer.push(snapshot(12, [shape(1, 100)]), 1100); // arrivé à l'heure
    // Le décalage retenu est celui du tick 12 : à t=1050, instant serveur = tick 11.
    expect(buffer.sample(1050)!.entities[0]!.x).toBeCloseTo(50);
  });
});

describe('lerpAngle', () => {
  it('tourne par le plus court chemin', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI);
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2);
  });
});

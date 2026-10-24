import type { EntityState, SelfState, SnapshotPayload } from '@diep-fried/shared';

/** État à dessiner pour une image : entités interpolées entre deux snapshots. */
export interface RenderFrame {
  /** Tick serveur rendu, fractionnaire entre deux snapshots. */
  tick: number;
  self: SelfState;
  entities: EntityState[];
  match?: SnapshotPayload['match'];
}

/**
 * Tampon de snapshots et interpolation. Le client affiche le monde avec un retard fixe
 * (`delayMs`) pour toujours disposer de deux snapshots encadrant l'instant rendu.
 *
 * Le décalage horloge locale / ticks serveur est estimé à partir des arrivées : le plus petit
 * décalage observé correspond au paquet le moins retardé ; l'estimation remonte lentement
 * pour suivre une hausse durable de latence.
 */
export class SnapshotBuffer {
  private readonly snapshots: SnapshotPayload[] = [];
  private offsetMs: number | null = null;

  constructor(
    private readonly tickMs: number,
    private readonly delayMs: number,
    private readonly capacity = 32,
  ) {}

  push(snapshot: SnapshotPayload, receivedAtMs: number): void {
    const last = this.snapshots.at(-1);
    if (last && snapshot.tick <= last.tick) return;
    const offset = receivedAtMs - snapshot.tick * this.tickMs;
    this.offsetMs =
      this.offsetMs === null || offset < this.offsetMs
        ? offset
        : this.offsetMs + (offset - this.offsetMs) * 0.02;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.capacity) this.snapshots.shift();
  }

  latest(): SnapshotPayload | undefined {
    return this.snapshots.at(-1);
  }

  clear(): void {
    this.snapshots.length = 0;
    this.offsetMs = null;
  }

  sample(nowMs: number): RenderFrame | null {
    const newest = this.snapshots.at(-1);
    if (!newest || this.offsetMs === null) return null;
    const renderTick = (nowMs - this.offsetMs - this.delayMs) / this.tickMs;

    let nextIndex = this.snapshots.findIndex((snapshot) => snapshot.tick > renderTick);
    if (nextIndex === -1) return frameOf(newest, newest.tick);
    if (nextIndex === 0) return frameOf(this.snapshots[0]!, this.snapshots[0]!.tick);
    const from = this.snapshots[nextIndex - 1]!;
    const to = this.snapshots[nextIndex]!;
    const alpha = (renderTick - from.tick) / (to.tick - from.tick);

    const previous = new Map(from.entities.map((entity) => [entity.id, entity]));
    const entities = to.entities.map((entity) => {
      const before = previous.get(entity.id);
      return before && before.kind === entity.kind ? interpolate(before, entity, alpha) : entity;
    });
    return {
      tick: renderTick,
      self: to.self,
      entities,
      ...(newest.match ? { match: newest.match } : {}),
    };
  }
}

function frameOf(snapshot: SnapshotPayload, tick: number): RenderFrame {
  return {
    tick,
    self: snapshot.self,
    entities: snapshot.entities,
    ...(snapshot.match ? { match: snapshot.match } : {}),
  };
}

function interpolate<T extends EntityState>(from: T, to: T, alpha: number): T {
  return {
    ...to,
    x: lerp(from.x, to.x, alpha),
    y: lerp(from.y, to.y, alpha),
    radius: lerp(from.radius, to.radius, alpha),
    angle: lerpAngle(from.angle, to.angle, alpha),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolation angulaire par le plus court chemin. */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + delta * t;
}

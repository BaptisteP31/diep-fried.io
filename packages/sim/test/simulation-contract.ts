import { describe, expect, it } from 'vitest';
import { resolveModeConfig, type PlayerInput } from '@diep-fried/shared';
import type { SimulationFactory } from '../src';

/**
 * Suite de contrat de l'interface `Simulation`. Toute implémentation (provisoire ou complète)
 * doit la passer : `describeSimulationContract('nom', fabrique)` dans un fichier `*.test.ts`.
 */
export function describeSimulationContract(name: string, factory: SimulationFactory): void {
  const create = (seed = 1) => factory({ config: resolveModeConfig('ffa'), seed });
  const input = (seq: number, aim = { x: 100, y: 0 }): PlayerInput => ({
    seq,
    move: { x: 0, y: 0 },
    aim,
    fire: false,
    alt: false,
  });

  describe(`contrat Simulation : ${name}`, () => {
    it('avance d’un tick par step()', () => {
      const sim = create();
      expect(sim.tick).toBe(0);
      sim.step();
      sim.step();
      expect(sim.tick).toBe(2);
    });

    it('fait apparaître un joueur ajouté au tick suivant', () => {
      const sim = create();
      sim.addPlayer(1, { name: 'Ana' });
      const events = sim.step();
      expect(events).toContainEqual({ type: 'spawn', playerId: 1 });
      const snapshot = sim.snapshotFor(1)!;
      expect(snapshot.tick).toBe(1);
      expect(snapshot.self.alive).toBe(true);
      const own = snapshot.entities.find((entity) => entity.id === snapshot.self.entityId);
      expect(own).toMatchObject({ kind: 'tank', playerId: 1, name: 'Ana' });
    });

    it('place les tanks dans l’arène avec des identifiants d’entité distincts', () => {
      const sim = create();
      for (let id = 1; id <= 5; id++) sim.addPlayer(id, { name: `P${id}` });
      sim.step();
      const { arena } = sim.config;
      const tanks = sim.snapshotFor(1)!.entities.filter((entity) => entity.kind === 'tank');
      expect(new Set(tanks.map((tank) => tank.id)).size).toBe(tanks.length);
      for (const tank of tanks) {
        expect(tank.x).toBeGreaterThanOrEqual(0);
        expect(tank.x).toBeLessThanOrEqual(arena.width);
        expect(tank.y).toBeGreaterThanOrEqual(0);
        expect(tank.y).toBeLessThanOrEqual(arena.height);
      }
    });

    it('acquitte la dernière intention appliquée et ignore les seq non croissants', () => {
      const sim = create();
      sim.addPlayer(1, { name: 'Ana' });
      sim.step();
      sim.setInput(1, input(5, { x: 0, y: 100 }));
      sim.setInput(1, input(4, { x: -100, y: 0 }));
      sim.step();
      const snapshot = sim.snapshotFor(1)!;
      expect(snapshot.ackSeq).toBe(5);
      const own = snapshot.entities.find((entity) => entity.id === snapshot.self.entityId)!;
      expect(own.angle).toBeCloseTo(Math.PI / 2);
    });

    it("n'applique une intention qu'au step() suivant", () => {
      const sim = create();
      sim.addPlayer(1, { name: 'Ana' });
      sim.step();
      sim.setInput(1, input(1));
      expect(sim.snapshotFor(1)!.ackSeq).toBe(0);
    });

    it('retire un joueur et ignore les joueurs inconnus', () => {
      const sim = create();
      sim.addPlayer(1, { name: 'Ana' });
      sim.addPlayer(2, { name: 'Bob' });
      sim.step();
      sim.removePlayer(2);
      sim.removePlayer(99);
      sim.setInput(99, input(1));
      sim.queueCommand(99, { type: 'respawn' });
      sim.step();
      expect(sim.snapshotFor(2)).toBeUndefined();
      const tanks = sim.snapshotFor(1)!.entities.filter((entity) => entity.kind === 'tank');
      expect(tanks.map((tank) => tank.kind === 'tank' && tank.playerId)).toEqual([1]);
    });

    it('est déterministe pour une même graine et une même suite d’appels', () => {
      const run = (seed: number) => {
        const sim = create(seed);
        sim.addPlayer(1, { name: 'Ana' });
        sim.addPlayer(2, { name: 'Bob' });
        for (let tick = 1; tick <= 30; tick++) {
          sim.setInput(1, { ...input(tick), move: { x: 1, y: 0 }, fire: tick % 2 === 0 });
          sim.step();
        }
        return sim.snapshotFor(1);
      };
      expect(run(7)).toEqual(run(7));
    });
  });
}

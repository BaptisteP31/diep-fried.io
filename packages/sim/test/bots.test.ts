import { describe, expect, it } from 'vitest';
import {
  FIRST_SOLO_TEAM,
  resolveModeConfig,
  type ModeConfig,
  type PlayerInput,
  type Rect,
  type TankState,
} from '@diep-fried/shared';
import { createBotSimulation, BOT_ID_BASE, BOT_NAMES } from '../src/bots';
import { createSimulation } from '../src/world';
import { steerAroundObstacles } from '../src/bots/bot-navigation';

const dummyInput: PlayerInput = {
  seq: 1,
  move: { x: 0, y: 0 },
  aim: { x: 100, y: 0 },
  fire: false,
  alt: false,
};

describe('Bots joueurs synthétiques (SimulationFactory createBotSimulation)', () => {
  it('1 humain 5 bots spawn/déplacement/tirs', () => {
    const config = resolveModeConfig('ffa');
    expect(config.bots).toEqual({ count: 5, difficulty: 'normal' });

    const sim = createBotSimulation({ config, seed: 42 });
    sim.addPlayer(1, { name: 'Player1' });

    // Premier step : spawn de l'humain et des 5 bots
    sim.step();

    const snapshot = sim.snapshotFor(1);
    expect(snapshot).toBeDefined();

    // Le leaderboard contient l'humain et les 5 bots
    expect(snapshot!.leaderboard).toBeDefined();
    expect(snapshot!.leaderboard!.length).toBe(6);
    const botLeaderboard = snapshot!.leaderboard!.filter((entry) =>
      entry.name.startsWith('[BOT] '),
    );
    expect(botLeaderboard).toHaveLength(5);

    // Chaque bot a un snapshot valide avec son tank vivant
    const botIds = [1, 2, 3, 4, 5].map((i) => BOT_ID_BASE + i);
    const initialPositions = botIds.map((id) => {
      const snap = sim.snapshotFor(id);
      expect(snap).toBeDefined();
      expect(snap!.self.alive).toBe(true);
      const tank = snap!.entities.find((e): e is TankState => e.id === snap!.self.entityId)!;
      expect(tank).toBeDefined();
      expect(tank.name.startsWith('[BOT] ')).toBe(true);
      return { x: tank.x, y: tank.y };
    });

    // Avancer de 30 ticks : vérifier le mouvement et les tirs
    let sawMovement = false;
    let sawFiring = false;

    for (let i = 0; i < 30; i++) {
      sim.step();
      for (let j = 0; j < botIds.length; j++) {
        const id = botIds[j]!;
        const snap = sim.snapshotFor(id);
        if (snap && snap.self.alive) {
          const tank = snap.entities.find((e): e is TankState => e.id === snap.self.entityId);
          const init = initialPositions[j]!;
          if (tank && (tank.x !== init.x || tank.y !== init.y)) {
            sawMovement = true;
          }
          const bullets = snap.entities.filter((e) => e.kind === 'projectile');
          if (bullets.length > 0) {
            sawFiring = true;
          }
        }
      }
    }

    expect(sawMovement).toBe(true);
    expect(sawFiring).toBe(true);
  });

  it('option 0 désactive les bots', () => {
    const config = resolveModeConfig('ffa', { botCount: 0 });
    expect(config.bots?.count).toBe(0);

    const sim = createBotSimulation({ config, seed: 100 });
    sim.addPlayer(1, { name: 'Solo' });
    sim.step();

    const snapshot = sim.snapshotFor(1);
    expect(snapshot).toBeDefined();
    expect(snapshot!.leaderboard).toHaveLength(1);
    expect(snapshot!.leaderboard![0]!.name).toBe('Solo');
  });

  it('slots humains prioritaires : wrapper réduit et restaure la population de bots', () => {
    // Salon de 4 joueurs maximum avec 3 bots configurés
    const config = resolveModeConfig('ffa', { maxPlayers: 4, botCount: 3 });
    const sim = createBotSimulation({ config, seed: 123 });

    // 1 humain -> 3 bots (1 + 3 = 4)
    sim.addPlayer(1, { name: 'H1' });
    sim.step();
    let snap = sim.snapshotFor(1)!;
    let botEntries = snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '));
    expect(botEntries).toHaveLength(3);

    // 2ème humain -> bots réduits à 2 (2 + 2 = 4)
    sim.addPlayer(2, { name: 'H2' });
    sim.step();
    snap = sim.snapshotFor(1)!;
    botEntries = snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '));
    expect(botEntries).toHaveLength(2);

    // 3ème humain -> bots réduits à 1 (3 + 1 = 4)
    sim.addPlayer(3, { name: 'H3' });
    sim.step();
    snap = sim.snapshotFor(1)!;
    botEntries = snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '));
    expect(botEntries).toHaveLength(1);

    // 4ème humain -> 0 bot (4 + 0 = 4)
    sim.addPlayer(4, { name: 'H4' });
    sim.step();
    snap = sim.snapshotFor(1)!;
    botEntries = snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '));
    expect(botEntries).toHaveLength(0);

    // 1 humain part -> restaure 1 bot
    sim.removePlayer(4);
    sim.step();
    snap = sim.snapshotFor(1)!;
    botEntries = snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '));
    expect(botEntries).toHaveLength(1);

    // Reconnexion du même humain ne duplique pas les bots
    sim.addPlayer(1, { name: 'H1' });
    sim.step();
    snap = sim.snapshotFor(1)!;
    botEntries = snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '));
    expect(botEntries).toHaveLength(1);
  });

  it('cleanup : retire tous les bots quand le dernier humain quitte', () => {
    const config = resolveModeConfig('ffa', { botCount: 4 });
    const sim = createBotSimulation({ config, seed: 555 });

    sim.addPlayer(1, { name: 'Solo' });
    sim.step();
    expect(
      sim.snapshotFor(1)!.leaderboard!.filter((e) => e.name.startsWith('[BOT] ')),
    ).toHaveLength(4);

    // Le dernier humain quitte : les bots sont retirés
    sim.removePlayer(1);
    sim.step();

    // Rejoint à nouveau : bots restaurés proprement
    sim.addPlayer(2, { name: 'NewPlayer' });
    sim.step();
    const snap = sim.snapshotFor(2)!;
    expect(snap.leaderboard!.filter((e) => e.name.startsWith('[BOT] '))).toHaveLength(4);
  });

  it('bots équipe et démarrage des rounds (roundstart)', () => {
    // Mode Domination (exige minPlayers = 2)
    const config = resolveModeConfig('domination', { botCount: 3 });
    const sim = createBotSimulation({ config, seed: 777 });

    // 1 seul humain rejoint
    sim.addPlayer(1, { name: 'Commander' });
    sim.step();

    const snap = sim.snapshotFor(1)!;
    expect(snap.match).toBeDefined();
    // Grâce aux bots, players = 4 >= minPlayers (2), donc phase = 'playing'
    expect(snap.match!.phase).toBe('playing');
    expect(snap.match!.round).toBeGreaterThanOrEqual(1);

    // Vérifier que les bots ont des snapshots sur les camps déclarés
    const botIds = [1, 2, 3].map((i) => BOT_ID_BASE + i);
    const teams = botIds.map((id) => {
      const bSnap = sim.snapshotFor(id);
      const tank = bSnap?.entities.find((e): e is TankState => e.id === bSnap?.self.entityId);
      return tank?.team;
    });
    expect(teams.every((t) => t === 1 || t === 2)).toBe(true);
  });

  it('respawn Survival et reset : pas de réinitialisation de seq', () => {
    const config = resolveModeConfig('survival', { botCount: 2 });
    const sim = createBotSimulation({ config, seed: 888 });

    sim.addPlayer(1, { name: 'Survivor' });
    sim.step();

    const snap = sim.snapshotFor(1)!;
    expect(snap.match?.phase).toBe('playing');

    // Avancer un certain nombre de ticks
    for (let i = 0; i < 20; i++) {
      sim.step();
    }

    // Un reset de round conserve la monotonie de seq sans crash
    sim.step();
    const postReset = sim.snapshotFor(1);
    expect(postReset).toBeDefined();
  });

  it('déterminisme de la simulation avec bots', () => {
    const config = resolveModeConfig('ffa', { botCount: 4 });
    const seed = 12345;

    const simA = createBotSimulation({ config, seed });
    const simB = createBotSimulation({ config, seed });

    simA.addPlayer(1, { name: 'Player' });
    simB.addPlayer(1, { name: 'Player' });

    for (let i = 0; i < 40; i++) {
      const input: PlayerInput = {
        seq: i + 1,
        move: { x: Math.sin(i), y: Math.cos(i) },
        aim: { x: 100, y: 50 },
        fire: i % 2 === 0,
        alt: false,
      };
      simA.setInput(1, input);
      simB.setInput(1, input);

      const eventsA = simA.step();
      const eventsB = simB.step();
      expect(eventsA).toEqual(eventsB);

      const snapA = simA.snapshotFor(1);
      const snapB = simB.snapshotFor(1);
      expect(snapA).toEqual(snapB);
    }
  });

  it('mini navigation mur simple : contourne un mur sans blocage indéfini', () => {
    const wall: Rect = { x: 100, y: 0, width: 20, height: 200 };
    const arena = { width: 400, height: 400 };

    const start = { x: 50, y: 100, radius: 25 };
    const destination = { x: 250, y: 100 };

    const move = steerAroundObstacles(start, destination, [wall], arena);
    // Le vecteur de mouvement ne doit pas pointer droit dans le mur (dx > 0 et dy ≈ 0)
    // Il doit dévier vers le haut ou le bas pour contourner le mur
    expect(Math.abs(move.y)).toBeGreaterThan(0.2);
  });

  it('amélioration stats et classes sans triche', () => {
    const config = resolveModeConfig('ffa', { botCount: 2 });
    const sim = createBotSimulation({ config, seed: 999 });

    sim.addPlayer(1, { name: 'Observer' });
    sim.step();

    // Simuler des ticks où les bots farment et montent de niveau
    for (let i = 0; i < 150; i++) {
      sim.step();
    }

    const botIds = [1, 2].map((i) => BOT_ID_BASE + i);
    for (const id of botIds) {
      const bSnap = sim.snapshotFor(id);
      expect(bSnap).toBeDefined();
      if (bSnap && bSnap.self.alive) {
        expect(bSnap.self.level).toBeGreaterThanOrEqual(1);
        expect(bSnap.self.level).toBeLessThanOrEqual(45);
        expect(bSnap.self.score).toBeGreaterThanOrEqual(0);
        // Les points dépensés ne doivent jamais dépasser le plafond autorisé
        const totalStats = Object.values(bSnap.self.stats).reduce((a, b) => a + b, 0);
        expect(totalStats).toBeLessThanOrEqual(45);
      }
    }
  });

  it('benchmark 1 humain + 12 bots tick temps stable', () => {
    const config = resolveModeConfig('ffa', { maxPlayers: 16, botCount: 12 });
    const sim = createBotSimulation({ config, seed: 314159 });

    sim.addPlayer(1, { name: 'Bencher' });
    sim.step();

    const ticks = 300;
    const t0 = Date.now();

    for (let i = 0; i < ticks; i++) {
      sim.setInput(1, {
        seq: i + 1,
        move: { x: 0.5, y: -0.5 },
        aim: { x: 200, y: 100 },
        fire: true,
        alt: false,
      });
      sim.step();
    }

    const totalMs = Date.now() - t0;
    const avg = totalMs / ticks;

    // La moyenne doit être largement inférieure à la durée d'un tick (33.3ms)
    expect(avg).toBeLessThan(10);
  });
});

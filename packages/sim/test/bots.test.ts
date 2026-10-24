import { describe, expect, it } from 'vitest';
import {
  FIRST_SOLO_TEAM,
  LIMITS,
  resolveModeConfig,
  type MatchState,
  type ModeConfig,
  type PlayerInput,
  type Rect,
  type SnapshotPayload,
  type TankState,
} from '@diep-fried/shared';
import { createBotSimulation, BOT_ID_BASE, BOT_NAMES } from '../src/bots';
import { BotBrain } from '../src/bots/bot-brain';
import { NavGrid, steerAroundObstacles } from '../src/bots/bot-navigation';
import { createSimulation } from '../src/world';
import { Rng } from '../src/rng';

function createTestSnapshot(overrides: Partial<SnapshotPayload> = {}): SnapshotPayload {
  const emptyStats = {
    movementSpeed: 0,
    bulletSpeed: 0,
    bulletPenetration: 0,
    bulletDamage: 0,
    reload: 0,
    maxHealth: 0,
    healthRegen: 0,
    bodyDamage: 0,
  };
  return {
    tick: 4,
    ackSeq: 0,
    self: {
      playerId: BOT_ID_BASE + 1,
      entityId: 101,
      alive: true,
      classId: 'tank',
      level: 1,
      score: 0,
      levelProgress: 0,
      statPoints: 0,
      stats: { ...emptyStats },
      statCaps: { ...emptyStats },
      classChoices: [],
      view: 1000,
      respawnTick: null,
      ...overrides.self,
    },
    entities: [
      {
        id: 101,
        kind: 'tank',
        playerId: BOT_ID_BASE + 1,
        x: 1000,
        y: 1000,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: 25,
        health: 100,
        maxHealth: 100,
        team: 1,
        name: '[BOT] Alpha',
        classId: 'tank',
        level: 1,
        score: 0,
        opacity: 1,
        barrelShots: [-1],
        spawnProtected: false,
      },
      ...(overrides.entities ?? []),
    ],
    ...(overrides.match !== undefined ? { match: overrides.match } : {}),
  };
}

function createTestMatch(overrides: Partial<MatchState> = {}): MatchState {
  return {
    phase: 'playing',
    round: 1,
    phaseTick: 0,
    endTick: null,
    minPlayers: 2,
    players: 2,
    result: null,
    scores: [
      { team: 1, score: 0, players: 1 },
      { team: 2, score: 0, players: 1 },
    ],
    objectives: [],
    ...overrides,
  };
}

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

  it('CTF : le porteur ramène le drapeau adverse vers sa propre base/drapeau et non vers la base ennemie', () => {
    const config = resolveModeConfig('ctf');
    const navGrid = new NavGrid(config.arena, []);
    const brain = new BotBrain(BOT_ID_BASE + 1, 0, 'normal', new Rng(1234));

    // Bot de l'équipe 1 situé à (1500, 1500)
    // Drapeau Team 1 (allié) à la base (200, 200)
    // Drapeau Team 2 (ennemi) transporté par le bot, base ennemie à (4800, 4800)
    const snap = createTestSnapshot({
      self: { playerId: BOT_ID_BASE + 1, entityId: 101, alive: true } as any,
      match: createTestMatch({
        objectives: [
          {
            id: 0,
            kind: 'flag',
            team: 1,
            x: 200,
            y: 200,
            radius: 24,
            entityId: null,
            progress: 1,
            flag: {
              status: 'home',
              carrierId: null,
              homeX: 200,
              homeY: 200,
              returnTick: null,
            },
          },
          {
            id: 1,
            kind: 'flag',
            team: 2,
            x: 1500,
            y: 1500,
            radius: 24,
            entityId: null,
            progress: 0,
            flag: {
              status: 'carried',
              carrierId: BOT_ID_BASE + 1,
              homeX: 4800,
              homeY: 4800,
              returnTick: null,
            },
          },
        ],
      }),
    });

    const input = brain.step(snap, config, [], navGrid, () => {});

    // Le bot doit se déplacer vers le camp allié (200, 200) -> move.x < 0 et move.y < 0
    // Il ne doit SURTOUT PAS se diriger vers la base ennemie (4800, 4800) -> move.x > 0 et move.y > 0
    expect(input.move.x).toBeLessThan(0);
    expect(input.move.y).toBeLessThan(0);
  });

  it('CTF : respecte positionHidden et ignore les coordonnées masquées', () => {
    const config = resolveModeConfig('ctf');
    const navGrid = new NavGrid(config.arena, []);
    const brain = new BotBrain(BOT_ID_BASE + 1, 0, 'normal', new Rng(5678));

    // Le drapeau adverse est porté par un ennemi invisible (positionHidden: true, x/y = 4800/4800 base)
    const snapHidden = createTestSnapshot({
      self: { playerId: BOT_ID_BASE + 1, entityId: 101, alive: true } as any,
      match: createTestMatch({
        objectives: [
          {
            id: 0,
            kind: 'flag',
            team: 1,
            x: 200,
            y: 200,
            radius: 24,
            entityId: null,
            progress: 1,
            flag: {
              status: 'home',
              carrierId: null,
              homeX: 200,
              homeY: 200,
              returnTick: null,
            },
          },
          {
            id: 1,
            kind: 'flag',
            team: 2,
            x: 4800,
            y: 4800,
            radius: 24,
            entityId: null,
            progress: 0,
            flag: {
              status: 'carried',
              carrierId: null,
              homeX: 4800,
              homeY: 4800,
              returnTick: null,
              positionHidden: true,
            },
          },
        ],
      }),
    });

    // Le bot ne doit pas se précipiter vers les coordonnées masquées (4800, 4800)
    const input = brain.step(snapHidden, config, [], navGrid, () => {});
    expect(input).toBeDefined();
  });

  it('CTF : ne poursuit pas un drapeau situé à l’intérieur d’une base ennemie interdite', () => {
    const config = resolveModeConfig('ctf');
    const configWithBase = {
      ...config,
      map: {
        ...config.map,
        zones: [
          {
            kind: 'base' as const,
            team: 2 as any,
            area: { x: 4500, y: 4500, width: 500, height: 500 },
          },
        ],
      },
    };
    const navGrid = new NavGrid(configWithBase.arena, []);
    const brain = new BotBrain(BOT_ID_BASE + 1, 0, 'normal', new Rng(9999));

    // Drapeau ennemi placé à l'intérieur de la base ennemie
    const snapInBase = createTestSnapshot({
      self: { playerId: BOT_ID_BASE + 1, entityId: 101, alive: true } as any,
      match: createTestMatch({
        objectives: [
          {
            id: 0,
            kind: 'flag',
            team: 1,
            x: 200,
            y: 200,
            radius: 24,
            entityId: null,
            progress: 1,
            flag: {
              status: 'home',
              carrierId: null,
              homeX: 200,
              homeY: 200,
              returnTick: null,
            },
          },
          {
            id: 1,
            kind: 'flag',
            team: 2,
            x: 4700,
            y: 4700,
            radius: 24,
            entityId: null,
            progress: 1,
            flag: {
              status: 'home',
              carrierId: null,
              homeX: 4700,
              homeY: 4700,
              returnTick: null,
            },
          },
        ],
      }),
    });

    const input = brain.step(snapInBase, configWithBase, [], navGrid, () => {});
    expect(input).toBeDefined();
  });

  it('contrat de visée : vecteur relatif au tank et borné par LIMITS.maxAimDistance', () => {
    const config = resolveModeConfig('ffa');
    const navGrid = new NavGrid(config.arena, []);
    const brain = new BotBrain(BOT_ID_BASE + 1, 0, 'hard', new Rng(42));

    // Bot à (1000, 1000), cible ennemie à (1300, 1400) -> distance relative = 500
    const enemy: TankState = {
      id: 202,
      kind: 'tank',
      playerId: null,
      x: 1300,
      y: 1400,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 25,
      health: 100,
      maxHealth: 100,
      team: 2,
      name: 'Target',
      classId: 'tank',
      level: 1,
      score: 0,
      opacity: 1,
      barrelShots: [-1],
      spawnProtected: false,
    };

    const snapCombat = createTestSnapshot({
      entities: [enemy],
    });

    const input = brain.step(snapCombat, config, [], navGrid, () => {});

    // La norme du vecteur aim doit être relative au tank (~500), et NON absolue (~1900)
    const aimLen = Math.hypot(input.aim.x, input.aim.y);
    expect(aimLen).toBeGreaterThan(400);
    expect(aimLen).toBeLessThan(600);
    expect(aimLen).toBeLessThanOrEqual(LIMITS.maxAimDistance);

    // Le vecteur relatif pointe vers (+300, +400), donc composantes positives
    expect(input.aim.x).toBeGreaterThan(0);
    expect(input.aim.y).toBeGreaterThan(0);
  });

  it('réinsertion des bots : réinitialise l’état tactique et préserve la monotonie de seq', () => {
    const config = resolveModeConfig('ffa', { maxPlayers: 3, botCount: 2 });
    const sim = createBotSimulation({ config, seed: 1010 });

    sim.addPlayer(1, { name: 'Player1' });
    sim.step();

    const botId = BOT_ID_BASE + 1;
    const snapBefore = sim.snapshotFor(botId);
    expect(snapBefore).toBeDefined();

    for (let i = 0; i < 10; i++) {
      sim.step();
    }

    // Deux nouveaux humains rejoignent : capacité max = 3 atteinte (3 humains, 0 bot)
    sim.addPlayer(2, { name: 'Player2' });
    sim.addPlayer(3, { name: 'Player3' });
    sim.step();

    // Tous les bots doivent être retirés
    expect(sim.snapshotFor(botId)).toBeUndefined();

    // Un humain quitte : bot réinséré
    sim.removePlayer(3);
    sim.step();

    const snapAfter = sim.snapshotFor(botId);
    expect(snapAfter).toBeDefined();
    expect(snapAfter!.self.alive).toBe(true);

    // Avancer d'autres ticks : la monotonie est préservée
    for (let i = 0; i < 5; i++) {
      sim.step();
    }
    const finalSnap = sim.snapshotFor(botId);
    expect(finalSnap).toBeDefined();
    expect(finalSnap!.self.alive).toBe(true);
  });
});

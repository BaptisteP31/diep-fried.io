import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, type ClientOptions } from 'ws';
import { createPlaceholderSimulation, type SimulationFactory } from '@diep-fried/sim';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  type SnapshotMessage,
} from '@diep-fried/shared';
import type { ServerConfig } from '../src/config';
import type { HealthStatus } from '../src/http';
import { createGameServer, type GameServer } from '../src/server';

let server: GameServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await server?.close();
  server = null;
});

async function start(
  overrides: Partial<ServerConfig> = {},
  factory?: SimulationFactory,
): Promise<string> {
  server = createGameServer(
    {
      host: '127.0.0.1',
      port: 0,
      staticDir: null,
      maxRooms: 4,
      emptyRoomTtlMs: 60_000,
      version: 'test',
      ...overrides,
    },
    factory,
  );
  const address = await server.listen();
  return `127.0.0.1:${address.port}`;
}

/** Client de test : file des messages reçus et attente par prédicat. */
class TestClient {
  private readonly received: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  bytesReceived = 0;
  snapshotsReceived = 0;
  readonly closed: Promise<number>;

  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.bytesReceived += Buffer.byteLength(data.toString());
      if (message.t === 'snapshot') this.snapshotsReceived++;
      this.received.push(message);
      for (const wake of this.waiters.splice(0)) wake();
    });
    this.closed = new Promise((resolve) => socket.on('close', (code) => resolve(code)));
  }

  static async connect(
    host: string,
    hello = true,
    options: ClientOptions = {},
  ): Promise<TestClient> {
    const socket = new WebSocket(`ws://${host}/ws`, options);
    sockets.push(socket);
    await new Promise((resolve, reject) => socket.once('open', resolve).once('error', reject));
    const client = new TestClient(socket);
    if (hello) {
      client.send({ t: 'hello', protocol: PROTOCOL_VERSION, client: 'test' });
      await client.next('welcome');
    }
    return client;
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Premier message non consommé de type `t` (et vérifiant `filter`), en attendant au besoin. */
  async next<T extends ServerMessage['t']>(
    t: T,
    filter: (message: Extract<ServerMessage, { t: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const index = this.received.findIndex(
        (message) => message.t === t && filter(message as Extract<ServerMessage, { t: T }>),
      );
      if (index !== -1)
        return this.received.splice(index, 1)[0] as Extract<ServerMessage, { t: T }>;
      if (Date.now() > deadline) throw new Error(`message ${t} non reçu`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
}

describe('HTTP', () => {
  it('expose l’état de santé', async () => {
    const host = await start();
    const response = await fetch(`http://${host}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      protocol: PROTOCOL_VERSION,
      version: 'test',
      rooms: 0,
      players: 0,
    });
  });

  it('sert le client construit, les routes du client et refuse de sortir du répertoire', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'diep-fried-static-'));
    const dir = join(parent, 'public');
    mkdirSync(dir);
    writeFileSync(join(parent, 'secret.txt'), 'secret');
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ok</title>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    const host = await start({ staticDir: dir });

    const index = await fetch(`http://${host}/`);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('<title>ok</title>');
    expect((await fetch(`http://${host}/app.js`)).headers.get('content-type')).toContain(
      'javascript',
    );
    expect(await (await fetch(`http://${host}/salon/ABC234`)).text()).toContain(
      '<title>ok</title>',
    );
    expect((await fetch(`http://${host}/missing.js`)).status).toBe(404);
    const escape = await fetch(`http://${host}/..%2fsecret.txt`);
    expect(escape.status).toBe(404);
    expect(await escape.text()).not.toContain('secret');
  });
});

describe('WebSocket', () => {
  it('ferme la connexion si la version de protocole diffère', async () => {
    const client = await TestClient.connect(await start(), false);
    client.send({ t: 'hello', protocol: PROTOCOL_VERSION + 1, client: 'test' });
    expect(await client.next('error')).toMatchObject({ code: 'protocol_mismatch', fatal: true });
    expect(await client.closed).toBe(1008);
  });

  it('exige hello avant toute autre commande', async () => {
    const client = await TestClient.connect(await start(), false);
    client.send({ t: 'room.create', name: 'Ana', mode: 'ffa', options: {} });
    expect(await client.next('error')).toMatchObject({ code: 'unexpected_message', fatal: true });
    await client.closed;
  });

  it('signale un message invalide sans fermer la connexion', async () => {
    const client = await TestClient.connect(await start());
    client.send({ t: 'room.create', name: 'Ana', mode: 'nope', options: {} });
    expect(await client.next('error')).toMatchObject({ code: 'bad_message', fatal: false });
    client.send({ t: 'ping', id: 3 });
    expect(await client.next('pong')).toEqual({ t: 'pong', id: 3, tick: null });
  });

  it('crée un salon, le fait rejoindre par code et diffuse les snapshots aux deux joueurs', async () => {
    const host = await start();
    const ana = await TestClient.connect(host);
    ana.send({ t: 'room.create', name: 'Ana', mode: 'ffa', options: { maxPlayers: 2 } });
    const created = await ana.next('room.joined');
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.config).toMatchObject({ mode: 'ffa', maxPlayers: 2 });

    const bob = await TestClient.connect(host);
    bob.send({ t: 'room.join', code: created.code, name: 'Bob' });
    const joined = await bob.next('room.joined');
    expect(joined.code).toBe(created.code);
    expect(joined.playerId).not.toBe(created.playerId);
    await ana.next('notice', (notice) => notice.text.includes('Bob'));

    const hasTwoTanks = (message: SnapshotMessage) =>
      message.entities.filter((entity) => entity.kind === 'tank').length === 2;
    const snapshot = await bob.next('snapshot', hasTwoTanks);
    expect(snapshot.self.playerId).toBe(joined.playerId);
    expect(snapshot.tick % created.config.snapshotInterval).toBe(0);
    await ana.next('snapshot', hasTwoTanks);

    const health = await (await fetch(`http://${host}/healthz`)).json();
    expect(health).toMatchObject({ rooms: 1, players: 2 });

    const carol = await TestClient.connect(host);
    carol.send({ t: 'room.join', code: created.code, name: 'Carol' });
    expect(await carol.next('error')).toMatchObject({ code: 'room_full' });
  });

  it('transmet les intentions à la simulation et renvoie leur acquittement', async () => {
    const ana = await TestClient.connect(await start());
    ana.send({ t: 'room.create', name: 'Ana', mode: 'sandbox', options: {} });
    await ana.next('room.joined');
    ana.send({
      t: 'input',
      input: { seq: 9, move: { x: 0, y: 0 }, aim: { x: 0, y: 50 }, fire: false, alt: false },
    });
    const snapshot = await ana.next('snapshot', (message) => message.ackSeq === 9);
    const own = snapshot.entities.find((entity) => entity.id === snapshot.self.entityId);
    expect(own?.angle).toBeCloseTo(Math.PI / 2);
  });

  it('refuse un code de salon inconnu et libère la place en quittant', async () => {
    const host = await start();
    const ana = await TestClient.connect(host);
    ana.send({ t: 'room.join', code: 'ZZZZZZ', name: 'Ana' });
    expect(await ana.next('error')).toMatchObject({ code: 'room_not_found', fatal: false });

    ana.send({ t: 'room.create', name: 'Ana', mode: 'ffa', options: {} });
    await ana.next('room.joined');
    ana.send({ t: 'room.leave' });
    expect(await ana.next('room.left')).toEqual({ t: 'room.left', reason: 'requested' });
    const health = await (await fetch(`http://${host}/healthz`)).json();
    expect(health).toMatchObject({ rooms: 1, players: 0 });
  });

  it('refuse la création au-delà du nombre maximal de salons', async () => {
    const ana = await TestClient.connect(await start({ maxRooms: 1 }));
    ana.send({ t: 'room.create', name: 'Ana', mode: 'ffa', options: {} });
    await ana.next('room.joined');
    ana.send({ t: 'room.leave' });
    await ana.next('room.left');
    ana.send({ t: 'room.create', name: 'Ana', mode: 'ffa', options: {} });
    expect(await ana.next('error')).toMatchObject({ code: 'server_full' });
  });
});

function input(seq: number, x = 1, y = 0): ClientMessage {
  return {
    t: 'input',
    input: { seq, move: { x: 0, y: 0 }, aim: { x, y }, fire: false, alt: false },
  };
}

async function createRoom(client: TestClient, maxPlayers = 2) {
  client.send({ t: 'room.create', name: 'Ana', mode: 'ffa', options: { maxPlayers } });
  return client.next('room.joined');
}

async function health(host: string) {
  return (await (await fetch(`http://${host}/healthz`)).json()) as HealthStatus;
}

async function rejectedUpgrade(host: string, options: ClientOptions = {}): Promise<number> {
  const socket = new WebSocket(`ws://${host}/ws`, options);
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on('error', () => {});
    socket.once('open', () => reject(new Error('upgrade accepté')));
    socket.once('unexpected-response', (_req, res) => {
      res.resume();
      socket.terminate();
      resolve(res.statusCode!);
    });
  });
}

describe('Reprise de session', () => {
  it('reprend le même tank après coupure et accepte seq=0 puis rejette les entrées périmées', async () => {
    const host = await start();
    const original = await TestClient.connect(host);
    const joined = await createRoom(original);
    expect(joined.resumeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    original.send(input(Number.MAX_SAFE_INTEGER, 0, 1));
    const before = await original.next('snapshot', (m) => m.ackSeq === Number.MAX_SAFE_INTEGER);
    original.socket.terminate();
    await original.closed;

    const resumed = await TestClient.connect(host);
    resumed.send({
      t: 'room.join',
      code: joined.code,
      name: 'Renamed',
      resumeToken: joined.resumeToken,
    });
    expect(await resumed.next('room.joined')).toMatchObject({
      playerId: joined.playerId,
      resumeToken: joined.resumeToken,
    });
    const initial = await resumed.next('snapshot');
    expect(initial.ackSeq).toBe(0);
    expect(initial.self.entityId).toBe(before.self.entityId);
    resumed.send(input(0, -1, 0));
    const first = await resumed.next('snapshot', (m) => m.tick > initial.tick);
    expect(first.entities.find((e) => e.id === first.self.entityId)?.angle).toBeCloseTo(Math.PI);
    resumed.send(input(3, 0, -1));
    const applied = await resumed.next('snapshot', (m) => m.ackSeq === 3);
    resumed.send(input(2, 1, 0));
    resumed.send(input(3, 1, 0));
    const after = await resumed.next('snapshot', (m) => m.tick > applied.tick);
    expect(after.ackSeq).toBe(3);
    expect(after.entities).toHaveLength(1);
    expect(after.entities[0]).toMatchObject({ id: before.self.entityId, name: 'Ana' });
    expect(after.entities[0]?.angle).toBeCloseTo(-Math.PI / 2);
    expect(await health(host)).toMatchObject({ players: 1 });
  });

  it('remplace une connexion vivante sans ajouter de joueur et résiste aux closes tardifs', async () => {
    const host = await start();
    const first = await TestClient.connect(host);
    const joined = await createRoom(first, 1);
    const before = await first.next('snapshot');
    const second = await TestClient.connect(host);
    second.send({ t: 'room.join', code: joined.code, name: 'B', resumeToken: joined.resumeToken });
    expect(await second.next('room.joined')).toMatchObject({ playerId: joined.playerId });
    expect(await first.next('room.left')).toMatchObject({ reason: 'kicked' });
    expect(await first.closed).toBe(1008);
    const third = await TestClient.connect(host);
    third.send({ t: 'room.join', code: joined.code, name: 'C', resumeToken: joined.resumeToken });
    await third.next('room.joined');
    await second.closed;
    third.send(input(1, 0, 1));
    const snapshot = await third.next('snapshot', (m) => m.ackSeq === 1);
    expect(snapshot.self.entityId).toBe(before.self.entityId);
    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.entities[0]?.angle).toBeCloseTo(Math.PI / 2);
    expect(await health(host)).toMatchObject({ players: 1, network: { connections: 1 } });
  });

  it('refuse un mauvais jeton, un jeton vide et un jeton provenant d’un autre salon sans fallback', async () => {
    const host = await start();
    const owner = await TestClient.connect(host);
    const joined = await createRoom(owner);
    const other = await TestClient.connect(host);
    const otherRoom = await createRoom(other);
    const stranger = await TestClient.connect(host);
    for (const resumeToken of ['', 'invalid', otherRoom.resumeToken]) {
      stranger.send({ t: 'room.join', code: joined.code, name: 'Intruder', resumeToken });
      expect(await stranger.next('error')).toMatchObject({ code: 'bad_message', fatal: false });
    }
    expect(await health(host)).toMatchObject({ players: 2 });
    stranger.send({ t: 'room.join', code: joined.code, name: 'Guest' });
    expect((await stranger.next('room.joined')).playerId).not.toBe(joined.playerId);
  });

  it('réserve la place pendant la grâce puis expire le jeton et attribue un nouveau PlayerId', async () => {
    const host = await start({ resumeGraceMs: 160, emptyRoomTtlMs: 0 });
    const owner = await TestClient.connect(host);
    const joined = await createRoom(owner, 1);
    owner.socket.close();
    await owner.closed;
    const guest = await TestClient.connect(host);
    guest.send({ t: 'room.join', code: joined.code, name: 'Guest' });
    expect(await guest.next('error')).toMatchObject({ code: 'room_full' });
    expect(await health(host)).toMatchObject({ players: 1, rooms: 1 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    guest.send({ t: 'room.join', code: joined.code, name: 'Ana', resumeToken: joined.resumeToken });
    expect(await guest.next('error')).toMatchObject({ code: 'bad_message' });
    expect(await health(host)).toMatchObject({ players: 0 });
    guest.send({ t: 'room.join', code: joined.code, name: 'Guest' });
    expect((await guest.next('room.joined')).playerId).toBeGreaterThan(joined.playerId);
  });

  it('invalide immédiatement le jeton après room.leave et autorise à rejoindre à nouveau', async () => {
    const client = await TestClient.connect(await start());
    const joined = await createRoom(client);
    client.send({ t: 'room.leave' });
    await client.next('room.left');
    client.send({
      t: 'room.join',
      code: joined.code,
      name: 'Ana',
      resumeToken: joined.resumeToken,
    });
    expect(await client.next('error')).toMatchObject({ code: 'bad_message' });
    client.send({ t: 'room.join', code: joined.code, name: 'Ana' });
    const next = await client.next('room.joined');
    expect(next.playerId).not.toBe(joined.playerId);
    expect(next.resumeToken).not.toBe(joined.resumeToken);
  });

  it('neutralise les intentions à la coupure via la fabrique injectée', async () => {
    const received: import('@diep-fried/shared').PlayerInput[] = [];
    const factory: SimulationFactory = (options) => {
      const sim = createPlaceholderSimulation(options);
      const setInput = sim.setInput.bind(sim);
      sim.setInput = (id, value) => {
        received.push(value);
        setInput(id, value);
      };
      return sim;
    };
    const host = await start({}, factory);
    const client = await TestClient.connect(host);
    await createRoom(client);
    client.send({
      t: 'input',
      input: { seq: 7, move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, fire: true, alt: true },
    });
    await client.next('snapshot', (m) => m.ackSeq === 7);
    client.socket.close();
    await client.closed;
    await TestClient.connect(host); // aller-retour réseau après le close serveur
    expect(received.at(-1)).toMatchObject({ move: { x: 0, y: 0 }, fire: false, alt: false });
    expect(received.at(-1)!.seq).toBeGreaterThan(received[0]!.seq);
  });
});

describe('Protections de transport', () => {
  it('applique une liste Origin exacte et accepte sans Origin par défaut', async () => {
    const host = await start({ allowedOrigins: ['https://game.example'] });
    await TestClient.connect(host, true, { origin: 'https://game.example' });
    await TestClient.connect(host);
    for (const origin of ['https://evil.example', 'https://game.example.evil', 'null']) {
      expect(await rejectedUpgrade(host, { origin })).toBe(403);
    }
    expect(await health(host)).toMatchObject({ network: { connections: 2, rejectedOrigins: 3 } });
  });

  it('exige le même hôte par défaut et peut interdire les clients sans Origin', async () => {
    const host = await start({ allowNoOrigin: false });
    await TestClient.connect(host, true, { origin: `http://${host}` });
    expect(await rejectedUpgrade(host)).toBe(403);
    expect(await rejectedUpgrade(host, { origin: 'https://elsewhere.example' })).toBe(403);
  });

  it('plafonne les connexions/IP, ignore X-Forwarded-For et libère le compteur à la fermeture', async () => {
    const host = await start({ maxConnectionsPerIp: 1 });
    const client = await TestClient.connect(host);
    expect(await rejectedUpgrade(host, { headers: { 'X-Forwarded-For': '198.51.100.7' } })).toBe(
      429,
    );
    client.socket.close();
    await client.closed;
    await TestClient.connect(host);
    expect(await health(host)).toMatchObject({
      network: { connections: 1, rejectedConnections: 1 },
    });
  });

  it('limite tous les messages, y compris invalides et avant hello', async () => {
    const host = await start({ messageBurst: 3, messagesPerSecond: 1 });
    const client = await TestClient.connect(host, false);
    for (let i = 0; i < 8; i++) client.socket.send('{broken');
    expect(await client.next('error', (m) => m.code === 'rate_limited')).toMatchObject({
      fatal: true,
    });
    expect(await client.closed).toBe(1008);
    expect(await health(host)).toMatchObject({ network: { rateLimited: 1 } });
    const healthy = await TestClient.connect(host);
    healthy.send({ t: 'ping', id: 5 });
    expect(await healthy.next('pong')).toMatchObject({ id: 5 });
  });

  it('recharge le budget de messages entre deux rafales', async () => {
    const client = await TestClient.connect(
      await start({ messageBurst: 2, messagesPerSecond: 20 }),
    );
    client.send({ t: 'ping', id: 1 });
    await client.next('pong');
    await new Promise((resolve) => setTimeout(resolve, 110));
    client.send({ t: 'ping', id: 2 });
    client.send({ t: 'ping', id: 3 });
    await client.next('pong', (m) => m.id === 3);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('refuse les messages binaires et trop gros sans erreur non gérée', async () => {
    const host = await start();
    const binary = await TestClient.connect(host);
    binary.socket.send(Buffer.from('abc'));
    expect(await binary.next('error')).toMatchObject({ code: 'bad_message', fatal: true });
    expect(await binary.closed).toBe(1008);
    const oversized = await TestClient.connect(host);
    oversized.socket.send('x'.repeat(4097));
    expect(await oversized.closed).toBe(1009);
    await TestClient.connect(host);
  });

  it('conserve un client répondant au heartbeat et ferme celui qui ne répond pas', async () => {
    const host = await start({ heartbeatIntervalMs: 40 });
    const alive = await TestClient.connect(host);
    const silent = await TestClient.connect(host, true, { autoPong: false });
    expect(await silent.closed).toBe(1006);
    await new Promise((resolve) => setTimeout(resolve, 90));
    alive.send({ t: 'ping', id: 8 });
    await alive.next('pong');
    expect(await health(host)).toMatchObject({ network: { heartbeatTimeouts: 1, connections: 1 } });
  });
});

describe('Métriques et arrêt', () => {
  it('compte les octets UTF-8 reçus et envoyés réellement', async () => {
    const host = await start();
    const client = await TestClient.connect(host);
    const raw = JSON.stringify({ t: 'ping', id: 1, ignored: 'é🙂' });
    client.socket.send(raw);
    await client.next('pong');
    expect(await health(host)).toMatchObject({
      network: {
        bytesReceived:
          Buffer.byteLength(
            JSON.stringify({ t: 'hello', protocol: PROTOCOL_VERSION, client: 'test' }),
          ) + Buffer.byteLength(raw),
        bytesSent: client.bytesReceived,
        snapshotsSent: 0,
      },
    });
  });

  it('expose le temps abandonné par l’horloge réelle même après fermeture du salon', async () => {
    const host = await start();
    const client = await TestClient.connect(host);
    await createRoom(client);
    await client.next('snapshot');
    // Pause réelle de l'event loop : dépasse le rattrapage maximal de cinq ticks.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    const snapshot = await client.next('snapshot');
    await client.next('snapshot', (m) => m.tick > snapshot.tick);
    const before = await health(host);
    expect(before.droppedSimulationMs).toBeGreaterThan(100);
    server!.rooms.closeAll();
    expect((await health(host)).droppedSimulationMs).toBeGreaterThanOrEqual(
      before.droppedSimulationMs,
    );
  });

  it('diffuse à huit joueurs, maintient le débit de snapshots et comptabilise les charges utiles', async () => {
    const host = await start();
    const clients = [await TestClient.connect(host)];
    const joined = await createRoom(clients[0]!, 8);
    for (let i = 1; i < 8; i++) {
      const client = await TestClient.connect(host);
      clients.push(client);
      client.send({ t: 'room.join', code: joined.code, name: `P${i}` });
      await client.next('room.joined');
    }
    const first = await clients[0]!.next('snapshot', (m) => m.entities.length === 8);
    await Promise.all(clients.map((c) => c.next('snapshot', (m) => m.tick >= first.tick + 30)));
    for (const client of clients) expect(client.snapshotsReceived).toBeGreaterThanOrEqual(15);
    const status = await health(host);
    expect(status).toMatchObject({
      players: 8,
      network: { connections: 8, snapshotsDropped: 0, rateLimited: 0 },
    });
    expect(status.network.bytesSent).toBeGreaterThanOrEqual(
      clients.reduce((sum, c) => sum + c.bytesReceived, 0),
    );
    expect(status.network.snapshotsSent).toBeGreaterThanOrEqual(120);
  });

  it('envoie room.left closed avant fermeture, ferme le lobby et permet close plusieurs fois', async () => {
    const host = await start();
    const player = await TestClient.connect(host);
    await createRoom(player);
    const lobby = await TestClient.connect(host);
    const closing = server!.close();
    expect(await player.next('room.left')).toEqual({ t: 'room.left', reason: 'closed' });
    expect(await player.closed).toBe(1001);
    expect(await lobby.closed).toBe(1001);
    await Promise.all([closing, server!.close()]);
    expect(server!.rooms.roomCount).toBe(0);
  });

  it('borne l’arrêt lorsqu’un client ne lit plus la trame de fermeture', async () => {
    const client = await TestClient.connect(await start({ shutdownTimeoutMs: 60 }));
    await createRoom(client);
    client.socket.pause();
    const started = performance.now();
    await server!.close();
    expect(performance.now() - started).toBeLessThan(800);
    expect(server!.http.listening).toBe(false);
    client.socket.terminate();
  });
});

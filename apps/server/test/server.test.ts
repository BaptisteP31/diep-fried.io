import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  type SnapshotMessage,
} from '@diep-fried/shared';
import type { ServerConfig } from '../src/config';
import { createGameServer, type GameServer } from '../src/server';

let server: GameServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await server?.close();
  server = null;
});

async function start(overrides: Partial<ServerConfig> = {}): Promise<string> {
  server = createGameServer({
    host: '127.0.0.1',
    port: 0,
    staticDir: null,
    maxRooms: 4,
    emptyRoomTtlMs: 60_000,
    version: 'test',
    ...overrides,
  });
  const address = await server.listen();
  return `127.0.0.1:${address.port}`;
}

/** Client de test : file des messages reçus et attente par prédicat. */
class TestClient {
  private readonly received: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  readonly closed: Promise<number>;

  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.received.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
    this.closed = new Promise((resolve) => socket.on('close', (code) => resolve(code)));
  }

  static async connect(host: string, hello = true): Promise<TestClient> {
    const socket = new WebSocket(`ws://${host}/ws`);
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

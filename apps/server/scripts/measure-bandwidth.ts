import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@diep-fried/shared';
import { loadServerConfig } from '../src/config';
import { createGameServer } from '../src/server';

/** Mesure locale reproductible du transport JSON, explicitement sur le placeholder. */
const durationMs = Number(process.argv[2] ?? 2000);
if (!Number.isSafeInteger(durationMs) || durationMs < 1000)
  throw new Error('Durée en ms >= 1000 attendue');
const server = createGameServer({
  ...loadServerConfig({ STATIC_DIR: '' }),
  host: '127.0.0.1',
  port: 0,
});
const clients: Probe[] = [];

class Probe {
  readonly socket: WebSocket;
  snapshotBytes = 0;
  snapshots = 0;
  entities = 0;
  shapes = 0;
  private waiter: { t: ServerMessage['t']; resolve: (message: ServerMessage) => void } | null =
    null;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('error', (error) => console.error(error.message));
    this.socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.t === 'snapshot') {
        this.snapshotBytes += Buffer.byteLength(data.toString());
        this.snapshots++;
        this.entities = message.entities.length;
        this.shapes = message.entities.filter((e) => e.kind === 'shape').length;
      }
      if (this.waiter?.t === message.t) {
        this.waiter.resolve(message);
        this.waiter = null;
      }
    });
  }

  exchange<T extends ServerMessage['t']>(
    message: ClientMessage,
    t: T,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Pas de ${t}`)), 2000);
      this.waiter = {
        t,
        resolve: (reply) => {
          clearTimeout(timeout);
          resolve(reply as Extract<ServerMessage, { t: T }>);
        },
      };
      this.socket.send(JSON.stringify(message));
    });
  }
}

try {
  const address = await server.listen();
  let code = '';
  let configuredShapes = 0;
  for (let i = 0; i < 8; i++) {
    const client = new Probe(`ws://127.0.0.1:${address.port}/ws`);
    clients.push(client);
    await new Promise((resolve, reject) =>
      client.socket.once('open', resolve).once('error', reject),
    );
    await client.exchange(
      { t: 'hello', protocol: PROTOCOL_VERSION, client: 'bandwidth-probe' },
      'welcome',
    );
    const joined = await client.exchange(
      i === 0
        ? { t: 'room.create', name: 'P0', mode: 'ffa', options: { maxPlayers: 8 } }
        : { t: 'room.join', code, name: `P${i}` },
      'room.joined',
    );
    code = joined.code;
    configuredShapes = joined.config.shapes.targetCount;
  }
  await delay(150); // tous les tanks sont apparus avant la fenêtre de mesure
  for (const client of clients) {
    client.snapshotBytes = 0;
    client.snapshots = 0;
  }
  const start = performance.now();
  await delay(durationMs);
  const elapsedSeconds = (performance.now() - start) / 1000;
  const bytes = clients.reduce((sum, c) => sum + c.snapshotBytes, 0);
  const snapshots = clients.reduce((sum, c) => sum + c.snapshots, 0);
  console.log(
    JSON.stringify(
      {
        simulation: 'placeholder',
        players: 8,
        elapsedSeconds,
        configuredShapes,
        observedShapes: clients[0]!.shapes,
        observedEntities: clients[0]!.entities,
        snapshotBytes: bytes,
        snapshots,
        meanSnapshotBytes: bytes / snapshots,
        totalSnapshotBytesPerSecond: bytes / elapsedSeconds,
        perPlayerSnapshotBytesPerSecond: bytes / elapsedSeconds / 8,
        perPlayerSnapshotsPerSecond: snapshots / elapsedSeconds / 8,
        limitation:
          '8 tanks immobiles, aucune forme ni projectile ; charges utiles JSON hors trames/TCP/TLS/HTTP',
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
  for (const client of clients) client.socket.terminate();
}

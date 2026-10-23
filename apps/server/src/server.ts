import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { LIMITS, WS_PATH } from '@diep-fried/shared';
import { createSimulation, type SimulationFactory } from '@diep-fried/sim';
import { NETWORK_DEFAULTS, type ServerConfig } from './config';
import { createNetworkMetrics } from './transport/metrics';
import { createHttpHandler } from './http';
import { RoomManager } from './rooms/room-manager';
import { Session } from './transport/session';

export interface GameServer {
  readonly http: Server;
  readonly rooms: RoomManager;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

export function createGameServer(
  config: ServerConfig,
  simulationFactory: SimulationFactory = createSimulation,
): GameServer {
  const startedAt = performance.now();
  const network = { ...NETWORK_DEFAULTS, ...config };
  const metrics = createNetworkMetrics();
  let closing = false;
  let closePromise: Promise<void> | null = null;
  const rooms = new RoomManager({
    maxRooms: config.maxRooms,
    emptyRoomTtlMs: config.emptyRoomTtlMs,
    simulationFactory,
    resumeGraceMs: network.resumeGraceMs,
  });
  const handler = createHttpHandler({
    staticDir: config.staticDir,
    health: () => ({
      version: config.version,
      uptimeSeconds: Math.floor((performance.now() - startedAt) / 1000),
      rooms: rooms.roomCount,
      players: rooms.playerCount,
      droppedSimulationMs: rooms.totalDroppedMs,
      network: { ...metrics },
    }),
  });
  const http = createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      console.error('[http]', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxClientMessageBytes });

  const sessions = new Map<import('ws').WebSocket, Session>();
  const connectionsByIp = new Map<string, number>();
  const awaitingPong = new Set<import('ws').WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState !== ws.OPEN) continue;
      if (awaitingPong.has(ws)) {
        metrics.heartbeatTimeouts++;
        ws.terminate();
      } else {
        awaitingPong.add(ws);
        ws.ping();
      }
    }
  }, network.heartbeatIntervalMs);
  heartbeat.unref();

  http.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    // Détruire après écriture : sinon un client qui ne ferme pas son côté garde la socket
    // ouverte indéfiniment et bloque `http.close()`.
    const reject = (status: string) => {
      socket.once('finish', () => socket.destroy());
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    if (closing) {
      reject('503 Service Unavailable');
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      reject('400 Bad Request');
      return;
    }
    if (pathname !== WS_PATH) {
      reject('404 Not Found');
      return;
    }
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, req.headers.host, network.allowedOrigins, network.allowNoOrigin)) {
      metrics.rejectedOrigins++;
      reject('403 Forbidden');
      return;
    }
    // Ne jamais faire confiance à X-Forwarded-For fourni par un client.
    const ip = req.socket.remoteAddress ?? 'unknown';
    const count = connectionsByIp.get(ip) ?? 0;
    if (count >= network.maxConnectionsPerIp) {
      metrics.rejectedConnections++;
      reject('429 Too Many Requests');
      return;
    }
    connectionsByIp.set(ip, count + 1);
    socket.once('close', () => {
      const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining > 0) connectionsByIp.set(ip, remaining);
      else connectionsByIp.delete(ip);
    });
    wss.handleUpgrade(req, socket, head, (ws) => {
      metrics.connections++;
      sessions.set(ws, new Session(ws, rooms, config.version, network, metrics));
      ws.on('pong', () => awaitingPong.delete(ws));
      ws.once('close', () => {
        metrics.connections--;
        sessions.delete(ws);
        awaitingPong.delete(ws);
      });
    });
  });

  return {
    http,
    rooms,
    listen: () =>
      new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, config.host, () => resolve(http.address() as AddressInfo));
      }),
    close: () => {
      if (closePromise) return closePromise;
      closing = true;
      clearInterval(heartbeat);
      // room.left closed précède la fermeture WS, et invalide les jetons.
      rooms.closeAll();
      for (const session of sessions.values()) session.shutdown();
      closePromise = new Promise<void>((resolve) => {
        const deadline = setTimeout(() => {
          for (const client of wss.clients) client.terminate();
          http.closeAllConnections();
        }, network.shutdownTimeoutMs);
        deadline.unref();
        Promise.all([
          new Promise<void>((done) => wss.close(() => done())),
          new Promise<void>((done) => http.close(() => done())),
        ]).then(() => {
          clearTimeout(deadline);
          resolve();
        });
      });
      return closePromise;
    },
  };
}

function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowed: readonly string[] | null,
  allowNoOrigin: boolean,
): boolean {
  if (origin === undefined) return allowNoOrigin;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false;
    return allowed === null ? url.host === host : allowed.includes(origin);
  } catch {
    return false;
  }
}

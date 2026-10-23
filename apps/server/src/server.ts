import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { LIMITS, WS_PATH } from '@diep-fried/shared';
import { createPlaceholderSimulation, type SimulationFactory } from '@diep-fried/sim';
import type { ServerConfig } from './config';
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
  simulationFactory: SimulationFactory = createPlaceholderSimulation,
): GameServer {
  const startedAt = performance.now();
  const rooms = new RoomManager({
    maxRooms: config.maxRooms,
    emptyRoomTtlMs: config.emptyRoomTtlMs,
    simulationFactory,
  });
  const handler = createHttpHandler({
    staticDir: config.staticDir,
    health: () => ({
      version: config.version,
      uptimeSeconds: Math.floor((performance.now() - startedAt) / 1000),
      rooms: rooms.roomCount,
      players: rooms.playerCount,
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

  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => new Session(ws, rooms, config.version));
  });

  return {
    http,
    rooms,
    listen: () =>
      new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, config.host, () => resolve(http.address() as AddressInfo));
      }),
    close: async () => {
      rooms.closeAll();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

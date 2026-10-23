import { PROTOCOL_VERSION } from '@diep-fried/shared';
import { loadServerConfig } from './config';
import { createGameServer } from './server';

const config = loadServerConfig();
const server = createGameServer(config);
const address = await server.listen();

console.log(
  `[diep-fried] serveur ${config.version} (protocole ${PROTOCOL_VERSION}) sur http://${address.address}:${address.port}`,
);
console.log(
  config.staticDir
    ? `[diep-fried] client servi depuis ${config.staticDir}`
    : '[diep-fried] client non construit : API et WebSocket seulement',
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}

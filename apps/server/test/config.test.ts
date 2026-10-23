import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/config';

describe('Configuration réseau', () => {
  it('charge la liste Origin et les limites depuis l’environnement', () => {
    expect(
      loadServerConfig({
        STATIC_DIR: '',
        ALLOWED_ORIGINS: 'https://game.example, http://localhost:5173',
        ALLOW_NO_ORIGIN: 'false',
        RESUME_GRACE_MS: '0',
        MESSAGES_PER_SECOND: '50',
        MESSAGE_BURST: '100',
        MAX_CONNECTIONS_PER_IP: '8',
        HEARTBEAT_INTERVAL_MS: '5000',
        SHUTDOWN_TIMEOUT_MS: '1000',
      }),
    ).toMatchObject({
      staticDir: null,
      allowedOrigins: ['https://game.example', 'http://localhost:5173'],
      allowNoOrigin: false,
      resumeGraceMs: 0,
      messagesPerSecond: 50,
      messageBurst: 100,
      maxConnectionsPerIp: 8,
      heartbeatIntervalMs: 5000,
      shutdownTimeoutMs: 1000,
    });
    expect(loadServerConfig({ ALLOWED_ORIGINS: '' }).allowedOrigins).toEqual([]);
  });

  it('refuse les protections désactivées accidentellement et les origines non exactes', () => {
    for (const env of [
      { MESSAGES_PER_SECOND: '0' },
      { MESSAGE_BURST: '-1' },
      { MAX_CONNECTIONS_PER_IP: 'NaN' },
      { HEARTBEAT_INTERVAL_MS: '0' },
      { SHUTDOWN_TIMEOUT_MS: '0' },
      { ALLOW_NO_ORIGIN: 'yes' },
      { ALLOWED_ORIGINS: '*' },
      { ALLOWED_ORIGINS: 'https://game.example/' },
      { ALLOWED_ORIGINS: 'https://game.example/path' },
      { ALLOWED_ORIGINS: 'file:///tmp' },
    ])
      expect(() => loadServerConfig(env)).toThrow();
  });
});

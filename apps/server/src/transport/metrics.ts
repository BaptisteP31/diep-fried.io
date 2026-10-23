/** Octets de charge utile WebSocket, hors trames/TCP/TLS et trafic HTTP. */
export function createNetworkMetrics() {
  return {
    connections: 0,
    bytesReceived: 0,
    bytesSent: 0,
    snapshotsSent: 0,
    snapshotsDropped: 0,
    rateLimited: 0,
    rejectedOrigins: 0,
    rejectedConnections: 0,
    heartbeatTimeouts: 0,
  };
}

export type NetworkMetrics = ReturnType<typeof createNetworkMetrics>;

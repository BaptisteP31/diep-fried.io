import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { HEALTH_PATH, PROTOCOL_VERSION } from '@diep-fried/shared';
import type { NetworkMetrics } from './transport/metrics';

export interface HealthStatus {
  status: 'ok';
  protocol: number;
  version: string;
  uptimeSeconds: number;
  rooms: number;
  players: number;
  droppedSimulationMs: number;
  network: NetworkMetrics;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export function createHttpHandler(options: {
  staticDir: string | null;
  health: () => Omit<HealthStatus, 'status' | 'protocol'>;
}) {
  const root = options.staticDir ? resolve(options.staticDir) : null;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    if (url.pathname === HEALTH_PATH) {
      const body: HealthStatus = { status: 'ok', protocol: PROTOCOL_VERSION, ...options.health() };
      res.writeHead(200, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    if (!root) {
      res.writeHead(404, { 'content-type': CONTENT_TYPES['.txt'] });
      res.end('Client non construit : lancer « npm run build » ou utiliser « npm run dev ».\n');
      return;
    }
    await serveStatic(root, url.pathname, req, res);
  };
}

async function serveStatic(
  root: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let file = resolveInside(root, pathname);
  let info = file ? await stat(file).catch(() => null) : null;
  if (info?.isDirectory()) {
    file = join(file!, 'index.html');
    info = await stat(file).catch(() => null);
  }
  // Les chemins sans extension (liens de salon, routes du client) reçoivent l'application.
  if (!info?.isFile() && extname(pathname) === '') {
    file = join(root, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!file || !info?.isFile()) {
    res.writeHead(404, { 'content-type': CONTENT_TYPES['.txt'] }).end('Introuvable\n');
    return;
  }
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

/** Chemin absolu du fichier demandé, ou `null` s'il sort de `root`. */
function resolveInside(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = resolve(root, `.${decoded}`);
  return file === root || file.startsWith(root + sep) ? file : null;
}

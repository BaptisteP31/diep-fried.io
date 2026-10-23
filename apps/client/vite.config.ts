import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** Serveur de jeu utilisé par le proxy de développement. */
const gameServer = process.env.DIEP_FRIED_SERVER ?? 'http://localhost:8080';

const fromRepo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/**
 * Avis de licence des ressources tierces embarquées dans le client, servis sous `/licenses/`.
 * Toute ressource tierce ajoutée au client doit être déclarée ici avec son texte de licence.
 */
const NOTICES: Record<string, () => string> = {
  'Ubuntu-Font-UFL.txt': () => readFileSync(fromRepo('assets/fonts/UFL.txt'), 'utf8'),
  'THIRD_PARTY_NOTICES.txt': () =>
    [
      'diep-fried.io — ressources tierces embarquées dans le client',
      '',
      'Police Ubuntu (Ubuntu-Bold.ttf, Ubuntu-Regular.ttf)',
      'Copyright 2011 Canonical Ltd. — Ubuntu Font Licence 1.0, voir Ubuntu-Font-UFL.txt',
      '',
    ].join('\n'),
};

function thirdPartyNotices(): Plugin {
  return {
    name: 'diep-fried-third-party-notices',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/licenses\/([\w.-]+)$/)?.[1];
        const notice = name && Object.hasOwn(NOTICES, name) ? NOTICES[name] : undefined;
        if (!notice) return next();
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(notice());
      });
    },
    generateBundle() {
      for (const [name, notice] of Object.entries(NOTICES)) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: notice() });
      }
    },
  };
}

export default defineConfig({
  plugins: [thirdPartyNotices()],
  server: {
    proxy: {
      '/ws': { target: gameServer, ws: true },
      '/healthz': gameServer,
    },
  },
  build: {
    sourcemap: true,
  },
});

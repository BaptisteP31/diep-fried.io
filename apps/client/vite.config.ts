import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { prepareSourceArchive, viteCoreLicense } from '../../scripts/source/archive.mjs';

/** Serveur de jeu utilisé par le proxy de développement. */
const gameServer = process.env.DIEP_FRIED_SERVER ?? 'http://localhost:8080';

const fromRepo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/**
 * Avis de licence des ressources tierces embarquées dans le client, servis sous `/licenses/`.
 * Toute ressource tierce ajoutée au client doit être déclarée ici avec son texte de licence.
 */
const NOTICES: Record<string, () => string | Promise<string>> = {
  'AGPL-3.0.txt': () => readFileSync(fromRepo('LICENSE'), 'utf8'),
  'Ubuntu-Font-UFL.txt': () => readFileSync(fromRepo('assets/fonts/UFL.txt'), 'utf8'),
  'Vite-MIT.txt': () => viteCoreLicense(fromRepo('')),
  'THIRD_PARTY_NOTICES.txt': () =>
    [
      'diep-fried.io — ressources tierces embarquées dans le client',
      '',
      'Code du projet : AGPL-3.0-or-later, voir AGPL-3.0.txt.',
      'Les ressources tierces ci-dessous conservent leurs licences propres.',
      '',
      'Police Ubuntu (Ubuntu-Bold.ttf, Ubuntu-Regular.ttf)',
      'Copyright 2011 Canonical Ltd. — Ubuntu Font Licence 1.0, voir Ubuntu-Font-UFL.txt',
      '',
      'Vite — helper modulepreload embarqué dans le JavaScript construit',
      'Copyright (c) 2019-present, VoidZero Inc. and Vite contributors',
      'MIT License, voir Vite-MIT.txt (texte exact de la licence du cœur de Vite installé).',
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
        Promise.resolve(notice())
          .then((text) => {
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(text);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      for (const [name, notice] of Object.entries(NOTICES)) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: await notice() });
      }
    },
  };
}

/** Export also runs for `npm run build -w @diep-fried/client`, without Git in Docker. */
function correspondingSource(): Plugin {
  let archive: Awaited<ReturnType<typeof prepareSourceArchive>> | undefined;
  let outDir: string;
  return {
    name: 'diep-fried-corresponding-source',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async buildStart() {
      await archive?.cleanup();
      archive = await prepareSourceArchive({ root: fromRepo('') });
    },
    async buildEnd(error) {
      if (error) await archive?.cleanup();
    },
    async writeBundle() {
      if (!archive) throw new Error('Source archive missing');
      await archive.verify();
      await archive.publish(outDir);
    },
    async closeBundle() {
      await archive?.cleanup();
    },
  };
}

export default defineConfig({
  plugins: [thirdPartyNotices(), correspondingSource()],
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

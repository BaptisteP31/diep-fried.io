import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareSourceArchive, SOURCE_LIMITS, viteCoreLicense } from './archive.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const license = await readFile(join(repo, 'node_modules/vite/LICENSE.md'), 'utf8');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'source-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(path, content = path) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await put('package.json', JSON.stringify({ name: 'source-fixture', version: '1.2.3' }));
  for (const path of ['package-lock.json', 'LICENSE', 'README.md', 'Dockerfile']) await put(path);
  await put('node_modules/vite/package.json', JSON.stringify({ name: 'vite' }));
  await put('node_modules/vite/LICENSE.md', license);
  return { root, put };
}

test('archive snapshots exact source/config/assets/notices, omits secrets and non-source; deterministic without Git', async (t) => {
  const { root, put } = await fixture(t);
  const included = [
    '.github/workflows/ci.yml',
    '.dockerignore',
    '.gitignore',
    'tsconfig.base.json',
    'apps/client/index.html',
    'apps/client/vite.config.ts',
    'apps/server/src/main.ts',
    'packages/sim/src/main.ts',
    'scripts/qa/network-scenario.mjs',
    'scripts/build.mjs',
    'assets/fonts/UFL.txt',
    'assets/fonts/Ubuntu-Regular.ttf',
    'docs/release.md',
    'docs/research/asset-collection/distributable/licenses/flags-MIT.txt',
    // Exercise GNU tar's long-path extension deterministically.
    `packages/sim/src/${'long'.repeat(36)}.ts`,
  ];
  for (const path of included) await put(path, `source bytes: ${path}\n`);
  await chmod(join(root, 'scripts/build.mjs'), 0o755);
  const excluded = [
    '.git/config',
    '.env',
    '.env.production',
    '.ssh/id_rsa',
    'unlisted-root-file.txt',
    'node_modules/probe.js',
    'apps/client/node_modules/probe.js',
    'apps/client/dist/source/source.tar.gz',
    'apps/client/.env.local',
    'apps/server/secrets/token.txt',
    'apps/server/credentials.json',
    'apps/server/private.key',
    'packages/sim/.cache/probe',
    'docs/research/asset-collection/reference-only/probe.png',
    'apps/client/qa-showcase.html',
    'apps/client/qa-gameplay.jpg',
    'docs/screenshots/probe.png',
    'assets/render-capture.png',
  ];
  for (const path of excluded) await put(path, 'excluded test sentinel');
  // Simulate a Docker context with no .git, despite an enclosing Git worktree.
  await rm(join(root, '.git'), { recursive: true });
  const first = await prepareSourceArchive({ root });
  t.after(first.cleanup);
  await first.verify();
  const extracted = join(root, 'extracted');
  await mkdir(extracted);
  execFileSync('tar', ['-xzf', first.archivePath, '-C', extracted]);
  const manifest = JSON.parse(await readFile(first.manifestPath, 'utf8'));
  assert.equal(manifest.version, process.env.DIEP_FRIED_VERSION ?? '1.2.3');
  assert.equal(manifest.revision, process.env.DIEP_FRIED_REVISION || null);
  assert.deepEqual(
    JSON.parse(await readFile(join(extracted, 'source-manifest.json'), 'utf8')),
    manifest,
  );
  const paths = new Set(manifest.files.map((file) => file.path));
  for (const path of included) assert(paths.has(path), `missing ${path}`);
  for (const path of excluded) assert(!paths.has(path), `leaked ${path}`);
  assert(!paths.has('source-manifest.json'));
  assert(!paths.has('source.tar.gz'));
  for (const file of manifest.files) {
    const content = await readFile(join(extracted, file.path));
    assert.equal(content.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256, file.path);
    if (file.path !== 'licenses/Vite-MIT.txt') {
      assert.deepEqual(content, await readFile(join(root, file.path)), file.path);
    }
  }
  assert.equal(
    await readFile(join(extracted, 'licenses/Vite-MIT.txt'), 'utf8'),
    await viteCoreLicense(repo),
  );
  await utimes(join(root, 'apps/client/index.html'), new Date(), new Date());
  const second = await prepareSourceArchive({ root });
  t.after(second.cleanup);
  assert.deepEqual(await readFile(first.archivePath), await readFile(second.archivePath));
  await second.publish(join(root, 'output'));
  assert.deepEqual(await readdir(join(root, 'output/source')), [
    'SHA256SUMS',
    'source-manifest.json',
    'source.tar.gz',
  ]);
  assert.deepEqual(
    await readFile(join(root, 'output/source/source.tar.gz')),
    await readFile(first.archivePath),
  );
});

test('refuses symlinks both outside and inside the repository', async (t) => {
  const { root, put } = await fixture(t);
  await put('apps/client/src/main.ts');
  await symlink(tmpdir(), join(root, 'apps/external'));
  await assert.rejects(
    prepareSourceArchive({ root }),
    /refuses unreadable\/link path: apps\/external/,
  );
  await rm(join(root, 'apps/external'));
  await symlink('client/src/main.ts', join(root, 'apps/internal.ts'));
  await assert.rejects(
    prepareSourceArchive({ root }),
    /refuses unreadable\/link path: apps\/internal.ts/,
  );
});

test('detects changed, added and removed sources before publishing; excluded secrets do not invalidate', async (t) => {
  const { root, put } = await fixture(t);
  await put('apps/client/src/main.ts', 'before');
  const archive = await prepareSourceArchive({
    root,
    version: 'release-test',
    revision: 'test-revision',
  });
  t.after(archive.cleanup);
  const manifest = JSON.parse(await readFile(archive.manifestPath, 'utf8'));
  assert.equal(manifest.version, 'release-test');
  assert.equal(manifest.revision, 'test-revision');
  await put('apps/client/.env.secret', 'excluded test sentinel');
  await archive.verify();
  await chmod(join(root, 'apps/client/src/main.ts'), 0o755);
  await assert.rejects(archive.verify(), /Source file list changed/);
  await chmod(join(root, 'apps/client/src/main.ts'), 0o644);
  await put('apps/client/src/main.ts', 'after');
  await assert.rejects(archive.verify(), /Source changed during build/);
  await put('apps/client/src/main.ts', 'before');
  await put('apps/client/src/added.ts');
  await assert.rejects(archive.verify(), /Source file list changed/);
  await rm(join(root, 'apps/client/src/added.ts'));
  await rm(join(root, 'apps/client/src/main.ts'));
  await assert.rejects(archive.verify(), /Source file list changed/);
});

test('rejects symlink ancestors on verification and special files without reading them', async (t) => {
  const { root, put } = await fixture(t);
  await put('apps/client/src/main.ts');
  const archive = await prepareSourceArchive({ root });
  t.after(archive.cleanup);
  await rm(join(root, 'apps/client/src'), { recursive: true });
  await symlink(tmpdir(), join(root, 'apps/client/src'));
  await assert.rejects(archive.verify(), /refuses unreadable\/link path/);
  await rm(join(root, 'apps/client/src'));
  execFileSync('mkfifo', [join(root, 'apps/client/fifo')]);
  await assert.rejects(prepareSourceArchive({ root }), /refuses special file/);
});

test('bounds file size, total bytes and directory depth before archiving', async (t) => {
  const { root, put } = await fixture(t);
  await put('assets/large.bin');
  await truncate(join(root, 'assets/large.bin'), SOURCE_LIMITS.fileBytes + 1);
  await assert.rejects(prepareSourceArchive({ root }), /Source export limit exceeded: assets/);
  await rm(join(root, 'assets/large.bin'));
  for (let i = 0; i < 5; i++) {
    await put(`assets/large${i}.bin`);
    await truncate(join(root, `assets/large${i}.bin`), SOURCE_LIMITS.fileBytes);
  }
  await assert.rejects(prepareSourceArchive({ root }), /Source export limit exceeded: total bytes/);
  await rm(join(root, 'assets'), { recursive: true });
  await put(`packages/${'deep/'.repeat(SOURCE_LIMITS.depth)}file.ts`);
  await assert.rejects(
    prepareSourceArchive({ root }),
    /Source export limit exceeded: directory depth/,
  );
});

test('never reads Vite license through symlinks or an enclosing npm tree', async (t) => {
  const { root } = await fixture(t);
  await rm(join(root, 'node_modules/vite/LICENSE.md'));
  await symlink(
    join(repo, 'node_modules/vite/LICENSE.md'),
    join(root, 'node_modules/vite/LICENSE.md'),
  );
  await assert.rejects(viteCoreLicense(root), { code: 'ELOOP' });
  await rm(join(root, 'node_modules/vite/LICENSE.md'));
  await writeFile(join(root, 'node_modules/vite/LICENSE.md'), license);
  await mkdir(join(root, 'nested'));
  await assert.rejects(viteCoreLicense(join(root, 'nested')), /Install Vite inside this checkout/);
});

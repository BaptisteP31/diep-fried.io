import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { SOURCE_LIMITS, viteCoreLicense } from './archive.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const rebuild = args.includes('--rebuild');
const baseArg = args.find((arg) => arg.startsWith('--base='));
assert(
  args.every((arg) => arg === '--rebuild' || arg === baseArg) && new Set(args).size === args.length,
  'Usage: npm run smoke:source [-- --rebuild --base=http://127.0.0.1:8080] (build first)',
);
const temp = await mkdtemp(join(tmpdir(), 'source-smoke-'));
let server;
let exited;
try {
  let base = baseArg?.slice('--base='.length);
  if (!base) {
    const built = JSON.parse(
      await readFile(join(root, 'apps/client/dist/source/source-manifest.json'), 'utf8'),
    );
    server = spawn(process.execPath, ['apps/server/dist/main.js'], {
      cwd: root,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        STATIC_DIR: join(root, 'apps/client/dist'),
        DIEP_FRIED_VERSION: built.version,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let failure;
    exited = new Promise((done) => server.once('close', done));
    server.on('error', (error) => {
      failure = error;
    });
    server.on('exit', (code) => {
      failure = new Error(`server exit ${code}`);
    });
    server.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-8_192);
    });
    server.stderr.on('data', (chunk) => {
      output = (output + chunk).slice(-8_192);
    });
    const deadline = Date.now() + 10_000;
    while (!base && Date.now() < deadline) {
      if (failure) throw failure;
      const port = output.match(/sur http:\/\/127\.0\.0\.1:(\d+)/)?.[1];
      if (port) base = `http://127.0.0.1:${port}`;
      else await delay(25);
    }
    assert(base, 'server did not listen within 10 s');
  }
  const get = async (path) => {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, path);
    return response;
  };
  assert.match(await (await get('/')).text(), /href="\/source\/source\.tar\.gz"/);
  const response = await get('/source/source.tar.gz');
  const archive = join(temp, 'source.tar.gz');
  let downloaded = 0;
  const downloadLimit = new Transform({
    transform(chunk, _encoding, done) {
      downloaded += chunk.length;
      done(
        downloaded > SOURCE_LIMITS.totalBytes + SOURCE_LIMITS.entries * 4096
          ? new Error('Source archive download exceeds limit')
          : null,
        chunk,
      );
    },
  });
  await pipeline(Readable.fromWeb(response.body), downloadLimit, createWriteStream(archive));
  const manifestText = await (await get('/source/source-manifest.json')).text();
  const httpManifest = JSON.parse(manifestText);
  const health = await (await get('/healthz')).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.version, httpManifest.version, 'runtime version differs from build manifest');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const sums = await (await get('/source/SHA256SUMS')).text();
  const archiveHash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) archiveHash.update(chunk);
  const archiveDigest = archiveHash.digest('hex');
  assert.equal(
    sums,
    `${archiveDigest}  source.tar.gz\n${createHash('sha256').update(manifestText).digest('hex')}  source-manifest.json\n`,
  );

  const listing = execFileSync('tar', ['-tzf', archive], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
  })
    .trim()
    .split('\n');
  assert(
    listing.every((path) => path.startsWith('./') && !path.split('/').includes('..')),
    'unsafe tar path',
  );
  assert(
    !listing.some((path) =>
      /(?:^|\/)(?:\.git|node_modules|dist|reference-only|\.env(?:\.[^/]*)?|secrets|credentials|captures|screenshots)(?:\/|$)/.test(
        path,
      ),
    ),
    'excluded file in source archive',
  );
  // Refuse links/special files BEFORE extraction, even with --base pointing at a
  // server other than the one we started. A tar name listing alone is insufficient.
  const types = execFileSync('tar', ['-tvzf', archive], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
  })
    .trim()
    .split('\n');
  assert(types.length <= SOURCE_LIMITS.entries * 2, 'too many archive members');
  assert(
    types.every((line) => /^[d-]/.test(line)),
    'archive contains links/special files',
  );
  const extracted = join(temp, 'extracted');
  await mkdir(extracted);
  execFileSync('tar', ['-xzf', archive, '--no-same-owner', '-C', extracted], { timeout: 30_000 });
  const manifest = JSON.parse(await readFile(join(extracted, 'source-manifest.json'), 'utf8'));
  assert.deepEqual(manifest, httpManifest, 'HTTP and archived manifests differ');
  const actualFiles = [];
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      assert(!entry.isSymbolicLink(), `unexpected symlink: ${path}`);
      if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
      else actualFiles.push(path);
    }
  }
  await walk(extracted);
  assert.deepEqual(
    actualFiles.sort(),
    [...manifest.files.map((file) => file.path), 'source-manifest.json'].sort(),
    'unmanifested/missing files',
  );
  for (const file of manifest.files) {
    const path = resolve(extracted, file.path);
    assert(path.startsWith(extracted + '/'), 'manifest path escapes archive');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    assert.equal(hash.digest('hex'), file.sha256, file.path);
    const stat = await lstat(path);
    assert.equal(stat.size, file.bytes, file.path);
    assert.equal(stat.mode & 0o777, file.mode, file.path);
  }
  for (const path of [
    'package.json',
    'package-lock.json',
    'README.md',
    'LICENSE',
    'Dockerfile',
    '.github/workflows/ci.yml',
    'scripts/source/archive.mjs',
    'assets/fonts/UFL.txt',
  ]) {
    assert(
      manifest.files.some((file) => file.path === path),
      `missing ${path}`,
    );
  }
  const viteNotice = await (await get('/licenses/Vite-MIT.txt')).text();
  assert.equal(viteNotice, await viteCoreLicense(root));
  assert.equal(viteNotice, await readFile(join(extracted, 'licenses/Vite-MIT.txt'), 'utf8'));
  assert.match(await (await get('/licenses/THIRD_PARTY_NOTICES.txt')).text(), /Vite[\s\S]*MIT/);
  for (const [url, source] of [
    ['AGPL-3.0.txt', 'LICENSE'],
    ['Ubuntu-Font-UFL.txt', 'assets/fonts/UFL.txt'],
  ]) {
    assert.equal(
      await (await get(`/licenses/${url}`)).text(),
      await readFile(join(root, source), 'utf8'),
    );
  }
  if (rebuild) {
    await assert.rejects(lstat(join(extracted, '.git')), { code: 'ENOENT' });
    // A clean extraction with its own dependencies; no checkout/node_modules copy.
    const env = {
      ...process.env,
      DIEP_FRIED_VERSION: manifest.version,
      DIEP_FRIED_REVISION: manifest.revision ?? '',
    };
    for (const args of [
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      ['run', 'build', '-w', '@diep-fried/client'],
      ['run', 'build', '-w', '@diep-fried/server'],
    ]) {
      execFileSync('npm', args, { cwd: extracted, env, stdio: 'inherit', timeout: 120_000 });
    }
    const rebuilt = createHash('sha256');
    for await (const chunk of createReadStream(
      join(extracted, 'apps/client/dist/source/source.tar.gz'),
    ))
      rebuilt.update(chunk);
    assert.equal(rebuilt.digest('hex'), archiveDigest, 'reconstructed source archive differs');
  }
  console.log(
    JSON.stringify({
      sourceSmoke: 'ok',
      files: manifest.files.length,
      version: manifest.version,
      revision: manifest.revision,
      sourceHashesMatch: true,
      licensesMatch: true,
      healthVersionMatches: true,
      rebuiltWithoutGit: rebuild,
    }),
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    const force = setTimeout(() => server.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(force);
  }
  await rm(temp, { recursive: true, force: true });
}

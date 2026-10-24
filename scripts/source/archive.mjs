import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

// Deliberately bounded to this repository: never walk its parent or the user's home.
const ROOTS = ['apps', 'packages', 'scripts', 'assets', 'docs', '.github'];
const ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'README.md',
  'LICENSE',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  '.editorconfig',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  'tsconfig.base.json',
  'vitest.config.ts',
];
const OMIT_DIRS = new Set([
  '.git',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  'cache',
  '.vite',
  '.turbo',
  '.t3',
  '.codex',
  'tmp',
  'temp',
  'reference-only',
  'captures',
  'screenshots',
  'secrets',
  'credentials',
]);

function excluded(path) {
  const parts = path.split('/');
  return (
    parts.some((part) => OMIT_DIRS.has(part.toLowerCase())) ||
    parts.some((part) =>
      /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.ds_store|id_rsa|id_ed25519|secrets?(?:\..*)?|credentials?(?:\..*)?)$/i.test(
        part,
      ),
    ) ||
    /\.(?:log|pem|key|p12|pfx|keystore|tar|gz|zip|tgz)$/i.test(path) ||
    /(?:^|\/)[^/]*(?:screenshot|capture)[^/]*\.(?:png|jpe?g|webp)$/i.test(path) ||
    /^apps\/client\/qa[-.]/.test(path)
  );
}

// Caps apply before copying and again while streaming (a file may grow during export).
export const SOURCE_LIMITS = Object.freeze({
  entries: 20_000,
  fileBytes: 32 * 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  depth: 32,
  pathBytes: 2_048,
});

function checkSize(bytes, limit, label) {
  if (bytes > limit) throw new Error(`Source export limit exceeded: ${label}`);
}

// Pin each directory before opening its child. O_NOFOLLOW applies at EVERY level,
// including when another process replaces a directory after enumeration. Never
// resolve a symlink to decide whether its target would have been acceptable.
// The exporter requires Unix descriptor paths (Linux /proc, macOS /dev/fd).
const descriptorPath = (handle) =>
  `${process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd'}/${handle.fd}`;

async function openSource(root, path = '') {
  let handle = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const parts = path ? path.split('/') : [];
    for (let index = 0; index < parts.length; index++) {
      const isDirectory = index < parts.length - 1;
      const next = await open(
        `${descriptorPath(handle)}/${parts[index]}`,
        constants.O_RDONLY |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK |
          (isDirectory ? constants.O_DIRECTORY : 0),
      );
      await handle.close();
      handle = next;
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function sourceFiles(root) {
  const files = [];
  let visited = 0;
  let totalBytes = 0;
  async function visit(path, required = false) {
    checkSize(++visited, SOURCE_LIMITS.entries, 'entry count');
    checkSize(path.split('/').length, SOURCE_LIMITS.depth, 'directory depth');
    checkSize(Buffer.byteLength(path), SOURCE_LIMITS.pathBytes, 'path length');
    if (excluded(path)) return;
    let handle;
    try {
      handle = await openSource(root, path);
    } catch (error) {
      if (error.code === 'ENOENT' && !required) return;
      throw new Error(`Source export refuses unreadable/link path: ${path}`, { cause: error });
    }
    try {
      const stat = await handle.stat();
      if (stat.isDirectory()) {
        const dir = await opendir(descriptorPath(handle));
        for await (const entry of dir) await visit(`${path}/${entry.name}`);
      } else if (stat.isFile()) {
        checkSize(stat.size, SOURCE_LIMITS.fileBytes, path);
        totalBytes += stat.size;
        checkSize(totalBytes, SOURCE_LIMITS.totalBytes, 'total bytes');
        files.push({ path, mode: stat.mode & 0o111 ? 0o755 : 0o644 });
      } else {
        throw new Error(`Source export refuses special file: ${path}`);
      }
    } finally {
      await handle.close();
    }
  }
  for (const path of ROOT_FILES)
    await visit(
      path,
      ['package.json', 'package-lock.json', 'LICENSE', 'README.md', 'Dockerfile'].includes(path),
    );
  for (const path of ROOTS) await visit(path);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function digest(root, path, destination, budget = { bytes: 0 }) {
  const handle = await openSource(root, path);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`Source export refuses special file: ${path}`);
    checkSize(stat.size, SOURCE_LIMITS.fileBytes, path);
    const hash = createHash('sha256');
    let bytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        budget.bytes += chunk.length;
        try {
          checkSize(bytes, SOURCE_LIMITS.fileBytes, path);
          checkSize(budget.bytes, SOURCE_LIMITS.totalBytes, 'total bytes');
          hash.update(chunk);
          done(null, chunk);
        } catch (error) {
          done(error);
        }
      },
    });
    const input = handle.createReadStream({ autoClose: false });
    if (destination) {
      await mkdir(dirname(destination), { recursive: true });
      await pipeline(input, meter, createWriteStream(destination));
    } else {
      await pipeline(input, meter, async (chunks) => {
        for await (const _chunk of chunks) {
          /* drain */
        }
      });
    }
    return { bytes, sha256: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}

export async function viteCoreLicense(root) {
  let handle;
  // Only read installed dependencies INSIDE this checkout, never a parent/global npm tree.
  for (const path of ['apps/client/node_modules/vite/LICENSE.md', 'node_modules/vite/LICENSE.md']) {
    try {
      handle = await openSource(root, path);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!handle) throw new Error('Install Vite inside this checkout with npm ci before building');
  let text;
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Vite license must be a regular file');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      checkSize(bytes, 1024 * 1024, 'Vite license');
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString('utf8');
  } finally {
    await handle.close();
  }
  const end = text.indexOf('# Licenses of bundled dependencies');
  if (!text.startsWith('# Vite core license\n') || end < 0) {
    throw new Error('Unrecognized Vite license: review the installed LICENSE.md before release');
  }
  return text.slice(0, end);
}

function gitRevision(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim();
  } catch {
    return null;
  }
}

async function tarGzip(snapshot, archive) {
  // GNU tar is present on Ubuntu; Docker installs it explicitly (BusyBox is insufficient).
  const tar = spawn(
    'tar',
    [
      '--format=posix',
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--mode=a=rX,u+w',
      '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
      '-C',
      snapshot,
      '-cf',
      '-',
      '.',
    ],
    { env: { ...process.env, LC_ALL: 'C', TAR_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let errorText = '';
  tar.stderr.on('data', (chunk) => {
    errorText = (errorText + chunk).slice(-8_192);
  });
  const exited = new Promise((done, reject) => {
    tar.once('error', reject);
    tar.once('close', (code) =>
      code === 0 ? done() : reject(new Error(`GNU tar failed (${code}): ${errorText}`)),
    );
  });
  const results = await Promise.allSettled([
    exited,
    pipeline(tar.stdout, createGzip({ level: 9 }), createWriteStream(archive)),
  ]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw new Error('Source archive requires GNU tar on PATH', { cause: failed.reason });
}

/** Snapshot source bytes before Vite reads them, then stream a deterministic archive to disk. */
export async function prepareSourceArchive({ root, version, revision } = {}) {
  root = resolve(root);
  const temp = await mkdtemp(join(tmpdir(), 'diep-fried-source-'));
  const snapshot = join(temp, 'snapshot');
  const cleanup = () => rm(temp, { recursive: true, force: true });
  try {
    const files = await sourceFiles(root);
    const entries = [];
    const budget = { bytes: 0 };
    for (const file of files) {
      const target = join(snapshot, file.path);
      entries.push({ ...file, ...(await digest(root, file.path, target, budget)) });
      await chmod(target, file.mode);
    }
    const notice = await viteCoreLicense(root);
    const noticePath = 'licenses/Vite-MIT.txt';
    await mkdir(join(snapshot, 'licenses'), { recursive: true });
    await writeFile(join(snapshot, noticePath), notice);
    entries.push({
      path: noticePath,
      mode: 0o644,
      bytes: Buffer.byteLength(notice),
      sha256: createHash('sha256').update(notice).digest('hex'),
    });
    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const pkg = JSON.parse(await readFile(join(snapshot, 'package.json'), 'utf8'));
    const manifest = {
      schemaVersion: 1,
      version: version ?? process.env.DIEP_FRIED_VERSION ?? pkg.version ?? 'dev',
      revision:
        revision ??
        (process.env.DIEP_FRIED_REVISION || undefined) ??
        ((await lstat(join(root, '.git')).catch(() => null)) ? gitRevision(root) : null),
      algorithm: 'sha256',
      // Revision is informational (possibly a dirty checkout); hashes identify the shipped bytes.
      files: entries,
    };
    const manifestPath = join(snapshot, 'source-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const archivePath = join(temp, 'source.tar.gz');
    await tarGzip(snapshot, archivePath);
    const sumsPath = join(temp, 'SHA256SUMS');
    const hashes = [];
    for (const [path, name] of [
      [archivePath, 'source.tar.gz'],
      [manifestPath, 'source-manifest.json'],
    ]) {
      const hash = createHash('sha256');
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
      } finally {
        await handle.close();
      }
      hashes.push(`${hash.digest('hex')}  ${name}`);
    }
    await writeFile(sumsPath, hashes.join('\n') + '\n');
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    return {
      archivePath,
      manifestPath,
      cleanup,
      async verify() {
        const current = await sourceFiles(root);
        if (JSON.stringify(current) !== JSON.stringify(files))
          throw new Error('Source file list changed during build; rebuild from a stable checkout');
        const budget = { bytes: 0 };
        for (const file of files) {
          const actual = await digest(root, file.path, undefined, budget);
          const expected = byPath.get(file.path);
          if (actual.sha256 !== expected.sha256)
            throw new Error(`Source changed during build: ${file.path}`);
        }
        if ((await viteCoreLicense(root)) !== notice)
          throw new Error('Vite license changed during build');
      },
      async publish(outDir) {
        await mkdir(join(outDir, 'source'), { recursive: true });
        await copyFile(archivePath, join(outDir, 'source/source.tar.gz'));
        await copyFile(manifestPath, join(outDir, 'source/source-manifest.json'));
        await copyFile(sumsPath, join(outDir, 'source/SHA256SUMS'));
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

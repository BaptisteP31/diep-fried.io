import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Existing server dependency; no test-only install and no private runtime imports.
const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
const { WebSocket } = require('ws');
const root = fileURLToPath(new URL('../../', import.meta.url));
const clients = new Set();
const timeoutMs = 10_000;

async function until(predicate, description, timeout = timeoutMs) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await delay(25);
  }
  throw new Error(`Timeout: ${description}`);
}

function finite(value, path = 'message') {
  if (typeof value === 'number') assert(Number.isFinite(value), `${path} non-finite`);
  if (value === null) {
    assert(/\.(entityId|playerId|respawnTick|killerName)$/.test(path), `${path} unexpected null`);
  }
  // JSON.stringify turns NaN/Infinity into null. These public numeric fields cannot be null.
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) finite(child, `${path}.${key}`);
  }
}

class Client {
  constructor(base, index, protocol) {
    this.index = index;
    this.seq = 0;
    this.messages = [];
    this.snapshots = 0;
    this.bytes = 0;
    this.moved = false;
    this.fired = false;
    this.sawShape = false;
    this.lastSnapshotAt = 0;
    this.socket = new WebSocket(base.replace('http:', 'ws:') + '/ws', { origin: base });
    clients.add(this);
    this.socket.on('error', (error) => (this.failure = error));
    this.socket.on('close', (code) => (this.closeCode = code));
    this.socket.on('open', () => this.send({ t: 'hello', protocol, client: 'release-network-qa' }));
    this.socket.on('message', (raw) => {
      try {
        this.bytes += raw.byteLength;
        const message = JSON.parse(raw.toString());
        finite(message);
        if (message.t === 'error') throw new Error(`server error: ${message.code}`);
        if (message.t === 'snapshot') this.observe(message);
        else this.messages.push(message);
      } catch (error) {
        this.failure = error;
      }
    });
  }

  check() {
    if (this.failure) throw this.failure;
    if (this.closeCode !== undefined && !this.expectedClose) {
      throw new Error(`Unexpected close ${this.closeCode} for client ${this.index}`);
    }
  }

  observe(snapshot) {
    assert(Number.isSafeInteger(snapshot.tick));
    assert(Number.isSafeInteger(snapshot.ackSeq));
    assert(snapshot.tick > (this.last?.tick ?? -1), 'snapshot tick must advance');
    for (const entity of snapshot.entities) {
      for (const key of ['x', 'y', 'vx', 'vy', 'angle', 'radius']) {
        assert.equal(typeof entity[key], 'number', `${entity.kind}.${key} must be numeric`);
      }
      if ('health' in entity) assert.equal(typeof entity.health, 'number');
      if ('maxHealth' in entity) assert.equal(typeof entity.maxHealth, 'number');
    }
    for (const key of ['level', 'score', 'view', 'levelProgress']) {
      assert.equal(typeof snapshot.self[key], 'number', `self.${key} must be numeric`);
    }
    const tank = snapshot.entities.find((entity) => entity.id === snapshot.self.entityId);
    if (tank) {
      this.initialPosition ??= { x: tank.x, y: tank.y };
      if (Math.hypot(tank.x - this.initialPosition.x, tank.y - this.initialPosition.y) > 2) {
        this.moved = true;
      }
      if (tank.barrelShots.some((tick) => tick >= 0)) this.fired = true;
    }
    if (snapshot.entities.some((entity) => entity.kind === 'shape')) this.sawShape = true;
    if (snapshot.entities.some((entity) => entity.kind === 'projectile')) this.sawProjectile = true;
    this.last = snapshot;
    this.snapshots++;
    this.lastSnapshotAt = performance.now();
  }

  send(message) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, 'socket must be open');
    this.socket.send(JSON.stringify(message));
  }

  async wait(type) {
    return until(() => {
      this.check();
      const index = this.messages.findIndex((message) => message.t === type);
      return index < 0 ? null : this.messages.splice(index, 1)[0];
    }, `client ${this.index}: ${type}`);
  }

  async join(message) {
    this.send(message);
    this.joined = await this.wait('room.joined');
    return this.joined;
  }

  input(elapsed) {
    this.check();
    // Slow circle and rotating aim, real FFA, no cheats. Respawn is a public command.
    const angle = elapsed / 2_000 + this.index;
    this.send({
      t: 'input',
      input: {
        seq: this.seq++,
        move: { x: Math.cos(angle), y: Math.sin(angle) },
        aim: { x: Math.cos(angle * 2) * 500, y: Math.sin(angle * 2) * 500 },
        fire: true,
        alt: false,
      },
    });
    if (this.last && !this.last.self.alive) {
      this.send({ t: 'command', command: { type: 'respawn' } });
    }
  }

  async close() {
    this.expectedClose = true;
    this.socket.close();
    await until(() => this.closeCode !== undefined, 'client close');
  }
}

async function productionAudit(base) {
  const dist = resolve(root, 'apps/client/dist');
  async function files(dir, prefix = '') {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) result.push(...(await files(resolve(dir, entry.name), path + '/')));
      else result.push(path);
    }
    return result;
  }
  const shipped = await files(dist);
  assert.deepEqual(
    shipped.filter((path) => path.endsWith('.html')),
    ['index.html'],
  );
  assert(!shipped.some((path) => /reference-only|qa-showcase|qa-showroom/.test(path)));
  for (const [path, source] of [
    ['licenses/AGPL-3.0.txt', 'LICENSE'],
    ['licenses/Ubuntu-Font-UFL.txt', 'assets/fonts/UFL.txt'],
  ]) {
    const response = await fetch(`${base}/${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), await readFile(resolve(root, source), 'utf8'), path);
  }
  const notices = await fetch(`${base}/licenses/THIRD_PARTY_NOTICES.txt`);
  assert.equal(notices.status, 200);
  assert.match(await notices.text(), /Ubuntu/);
  const index = await fetch(base);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /Code source/);
  for (const font of ['Ubuntu-Bold', 'Ubuntu-Regular']) {
    const asset = shipped.find(
      (path) => path.startsWith(`assets/${font}-`) && path.endsWith('.ttf'),
    );
    assert(asset, `${font} missing`);
    const response = await fetch(`${base}/${asset}`);
    assert.equal(response.status, 200);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(resolve(root, `assets/fonts/${font}.ttf`)),
    );
  }
  for (const path of ['/qa-showcase.html', '/qa-showroom.html', '/reference-only/probe.png']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  return { htmlEntries: ['index.html'], shippedFiles: shipped.length, licenseTextsMatch: true };
}

async function rss(pid) {
  if (process.platform !== 'linux') return null;
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  const match = status.match(/^VmRSS:\s+(\d+) kB$/m);
  assert(match, 'server RSS missing');
  return Number(match[1]) * 1024;
}

export async function runScenario({ players, durationMs, label }) {
  const args = process.argv.slice(2);
  assert(
    args.every((arg) => arg === '--no-build'),
    'Usage: node scripts/{smoke,load}.mjs [--no-build]',
  );
  if (!args.includes('--no-build')) {
    const build = spawn('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'inherit',
    });
    await new Promise((done, reject) => {
      build.once('error', reject);
      build.once('exit', (code) => (code === 0 ? done() : reject(new Error(`build exit ${code}`))));
    });
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const server = spawn(process.execPath, ['--enable-source-maps', 'apps/server/dist/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      STATIC_DIR: resolve(root, 'apps/client/dist'),
      DIEP_FRIED_VERSION: commit,
      // Accelerate empty-room collection only; all gameplay/network defaults remain intact.
      EMPTY_ROOM_TTL_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let exit;
  let spawnError;
  server.once('error', (error) => (spawnError = error));
  const exited = new Promise((done) =>
    server.once('exit', (code, signal) => {
      exit = { code, signal };
      done(exit);
    }),
  );
  server.stdout.on('data', (data) => (output = (output + data).slice(-32_768)));
  server.stderr.on('data', (data) => (output = (output + data).slice(-32_768)));
  const checkServer = () => {
    if (spawnError) throw spawnError;
    assert(!exit, `server exited: ${JSON.stringify(exit)}\n${output}`);
  };
  try {
    const base = await until(() => {
      checkServer();
      const port = output.match(/sur http:\/\/127\.0\.0\.1:(\d+)/)?.[1];
      return port ? `http://127.0.0.1:${port}` : null;
    }, 'server listening on OS-assigned free port');
    const health = async () => {
      checkServer();
      const response = await fetch(base + '/healthz', { signal: AbortSignal.timeout(3_000) });
      assert.equal(response.status, 200);
      const value = await response.json();
      finite(value);
      assert.equal(value.status, 'ok');
      assert.equal(value.version, commit);
      return value;
    };
    const initial = await health();
    const audit = await productionAudit(base);
    const active = [];
    for (let i = 0; i < players; i++) {
      const client = new Client(base, i, initial.protocol);
      assert.equal((await client.wait('welcome')).server, commit);
      await client.join(
        i === 0
          ? { t: 'room.create', name: 'QA 0', mode: 'ffa', options: { maxPlayers: players } }
          : { t: 'room.join', code: active[0].joined.code, name: `QA ${i}` },
      );
      active.push(client);
    }
    await until(
      () =>
        active.every((client) => {
          client.check();
          return client.last;
        }),
      'first snapshots',
    );
    const startHealth = await health();
    const startTick = active[0].last.tick;
    assert.equal(startHealth.players, players);
    assert.equal(startHealth.network.connections, players);
    const rssStart = await rss(server.pid);
    let rssPeak = rssStart;
    let resumed = false;
    const start = performance.now();
    let nextSample = start;
    while (performance.now() - start < durationMs) {
      const elapsed = performance.now() - start;
      for (const client of active) {
        client.input(elapsed);
        assert(performance.now() - client.lastSnapshotAt < 3_000, 'snapshot stalled');
      }
      if (!resumed && elapsed > durationMs / 2) {
        const old = active[players - 1];
        await old.close();
        const replacement = new Client(base, old.index, initial.protocol);
        await replacement.wait('welcome');
        const seat = await replacement.join({
          t: 'room.join',
          code: old.joined.code,
          name: 'QA resumed',
          resumeToken: old.joined.resumeToken,
        });
        assert.equal(seat.playerId, old.joined.playerId, 'resume must preserve player ID');
        replacement.lastSnapshotAt = performance.now();
        active[players - 1] = replacement;
        resumed = true;
      }
      if (performance.now() >= nextSample) {
        assert.equal((await health()).players, players);
        const sample = await rss(server.pid);
        if (sample !== null) rssPeak = Math.max(rssPeak, sample);
        nextSample = performance.now() + 1_000;
      }
      await delay(50);
    }
    const elapsedSeconds = (performance.now() - start) / 1_000;
    const endHealth = await health();
    for (const client of clients) {
      client.check();
      assert(client.moved, `client ${client.index}: no physical movement`);
      assert(client.fired, `client ${client.index}: no barrel fired`);
      assert(client.sawShape, `client ${client.index}: no real simulation shapes`);
      assert(client.last.ackSeq > 0, `client ${client.index}: input never acknowledged`);
    }
    assert(
      [...clients].some((client) => client.sawProjectile),
      'no visible projectiles',
    );
    assert(resumed, 'reconnect not exercised');
    const rssEnd = await rss(server.pid);
    for (const client of active) {
      client.send({ t: 'room.leave' });
      assert.equal((await client.wait('room.left')).reason, 'requested');
      await client.close();
    }
    await until(
      async () => {
        const value = await health();
        return value.players === 0 && value.network.connections === 0 && value.rooms === 0;
      },
      'all seats, sockets and empty room cleaned',
      8_000,
    );
    // Check shutdown with both an occupied room and a lobby socket.
    const observer = new Client(base, players, initial.protocol);
    const lobby = new Client(base, players + 1, initial.protocol);
    await observer.wait('welcome');
    await lobby.wait('welcome');
    await observer.join({ t: 'room.create', name: 'shutdown', mode: 'ffa', options: {} });
    observer.expectedClose = lobby.expectedClose = true;
    server.kill('SIGTERM');
    assert.equal((await observer.wait('room.left')).reason, 'closed');
    await until(
      () => exit && observer.closeCode !== undefined && lobby.closeCode !== undefined,
      'graceful shutdown',
    );
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.equal(observer.closeCode, 1001);
    assert.equal(lobby.closeCode, 1001);
    const delta = (key) => endHealth.network[key] - startHealth.network[key];
    const droppedMs = endHealth.droppedSimulationMs - startHealth.droppedSimulationMs;
    console.log(
      JSON.stringify(
        {
          result: 'pass',
          scenario: label,
          commit,
          node: process.version,
          players,
          elapsedSeconds,
          tickRate: active[0].joined.config.tickRate,
          observedTickRate: (active[0].last.tick - startTick) / elapsedSeconds,
          receivedSnapshots: [...clients].reduce((sum, client) => sum + client.snapshots, 0),
          serverPayloadBytesPerSecond: delta('bytesSent') / elapsedSeconds,
          clientPayloadBytesPerSecond: delta('bytesReceived') / elapsedSeconds,
          snapshotsPerSecond: delta('snapshotsSent') / elapsedSeconds,
          snapshotsDropped: delta('snapshotsDropped'),
          droppedSimulationMs: droppedMs,
          droppedTicksEquivalent: (droppedMs * active[0].joined.config.tickRate) / 1_000,
          rssBytes: { start: rssStart, peakSampled: rssPeak, end: rssEnd },
          reconnectPreservedPlayer: true,
          cleanup: true,
          shutdownCode: 0,
          production: audit,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    for (const client of clients) client.socket.terminate();
    if (!exit && server.pid) {
      server.kill('SIGTERM');
      await Promise.race([exited, delay(3_000)]);
      if (!exit) {
        server.kill('SIGKILL');
        await exited;
      }
    }
  }
}

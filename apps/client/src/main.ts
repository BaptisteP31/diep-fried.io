import './style.css';
import type { ModeConfig, ServerMessage } from '@diep-fried/shared';
import { InputController } from './input/input-controller';
import { GameConnection, gameSocketUrl } from './net/connection';
import { worldToScreen } from './render/camera';
import { Renderer } from './render/renderer';
import { SnapshotBuffer } from './state/snapshot-buffer';
import { Menu } from './ui/menu';

/** Intervalle maximal sans envoi d'intention, même si rien ne change. */
const INPUT_KEEPALIVE_MS = 250;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
let config: ModeConfig | null = null;
let buffer: SnapshotBuffer | null = null;
let lastInput = '';
let lastInputAt = 0;

const menu = new Menu({
  create: (name, mode) => connection.send({ t: 'room.create', name, mode, options: {} }),
  join: (name, code) => connection.send({ t: 'room.join', name, code }),
  respawn: () => connection.send({ t: 'command', command: { type: 'respawn' } }),
});

const connection = new GameConnection(gameSocketUrl(location), {
  onMessage: handleMessage,
  onClose: (reason) => {
    config = null;
    buffer = null;
    menu.showLobby();
    menu.setStatus(`Déconnecté (${reason}). Recharger la page pour réessayer.`);
  },
});
menu.setStatus('Connexion…');

const input = new InputController(canvas, (stat) =>
  connection.send({ t: 'command', command: { type: 'upgradeStat', stat } }),
);

function handleMessage(message: ServerMessage): void {
  switch (message.t) {
    case 'welcome':
      return menu.setStatus('Connecté.');
    case 'room.joined': {
      config = message.config;
      const tickMs = 1000 / config.tickRate;
      buffer = new SnapshotBuffer(tickMs, tickMs * config.snapshotInterval * 2);
      return menu.showRoom(message.code);
    }
    case 'room.left':
      config = null;
      buffer = null;
      return menu.showLobby();
    case 'snapshot':
      buffer?.push(message, performance.now());
      if (message.self.alive) menu.showDeath(null);
      return;
    case 'death':
      return menu.showDeath(
        `Détruit${message.killerName ? ` par ${message.killerName}` : ''} — score ${message.score}`,
      );
    case 'notice':
      return menu.setHudStatus(message.text);
    case 'error':
      return menu.setStatus(`Erreur : ${message.message}`);
    case 'pong':
      return;
  }
}

let previousFrameAt = performance.now();
function frame(now: number): void {
  const dt = (now - previousFrameAt) / 1000;
  previousFrameAt = now;
  const current = buffer?.sample(now) ?? null;
  renderer.draw(current, config);

  const own = current?.entities.find((entity) => entity.id === current.self.entityId);
  if (own && renderer.camera) {
    const sample = input.sample(worldToScreen(renderer.camera, own), renderer.camera.scale, dt);
    const { seq: _seq, ...intent } = sample;
    const key = JSON.stringify(intent);
    if (key !== lastInput || now - lastInputAt > INPUT_KEEPALIVE_MS) {
      connection.send({ t: 'input', input: sample });
      lastInput = key;
      lastInputAt = now;
    }
  }
  requestAnimationFrame(frame);
}

renderer.resize();
window.addEventListener('resize', () => renderer.resize());
requestAnimationFrame(frame);

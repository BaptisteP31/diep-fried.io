import './style.css';
import type { ModeConfig, ServerMessage } from '@diep-fried/shared';
import { loadBindings } from './input/bindings';
import { InputController } from './input/input-controller';
import { GameConnection, gameSocketUrl } from './net/connection';
import { worldToScreen } from './render/camera';
import { drawMinimap } from './render/minimap';
import { Renderer } from './render/renderer';
import { SnapshotBuffer } from './state/snapshot-buffer';
import { ControlsModal } from './ui/controls-modal';
import { DeathScreen } from './ui/death-screen';
import { GameHud } from './ui/hud';
import { Menu } from './ui/menu';

/** Intervalle maximal sans envoi d'intention, même si rien ne change. */
const INPUT_KEEPALIVE_MS = 250;
const PING_INTERVAL_MS = 1000;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const minimapContainer = document.getElementById('minimap-container') as HTMLElement;
const minimapCtx = minimapCanvas.getContext('2d');

const renderer = new Renderer(canvas);
let config: ModeConfig | null = null;
let buffer: SnapshotBuffer | null = null;
let lastInput = '';
let lastInputAt = 0;
let currentRoomCode: string | null = null;
let currentName = localStorage.getItem('diep-fried:name') ?? 'Sans nom';
let lastServerTick = 0;

// Gestion du ping et de la latence
let nextPingId = 1;
const pingSentTimes = new Map<number, number>();

// Modal de configuration des commandes
const controlsModal = new ControlsModal({
  onBindingsChanged: (newBindings) => {
    input.setBindings(newBindings);
  },
});

// Écran de mort avec décompte de réapparition
const deathScreen = new DeathScreen({
  onRespawn: () => {
    connection.send({ t: 'command', command: { type: 'respawn' } });
  },
});

// Menu d'accueil et salon
const menu = new Menu({
  create: (name, mode) => {
    currentName = name;
    connection.send({ t: 'room.create', name, mode, options: {} });
  },
  join: (name, code, resumeToken) => {
    currentName = name;
    currentRoomCode = code;
    connection.send({
      t: 'room.join',
      name,
      code,
      ...(resumeToken ? { resumeToken } : {}),
    });
  },
  onOpenControls: () => controlsModal.show(),
});

// HUD complet de jeu (stats, évolutions, classement, ping)
const hud = new GameHud({
  onUpgradeStat: (stat) => {
    connection.send({ t: 'command', command: { type: 'upgradeStat', stat } });
  },
  onChooseClass: (classId) => {
    connection.send({ t: 'command', command: { type: 'chooseClass', classId } });
  },
  onToggleAutoFire: () => {
    input.toggleAutoFire();
    hud.setToggles(input.isAutoFire, input.isAutoSpin);
  },
  onToggleAutoSpin: () => {
    input.toggleAutoSpin();
    hud.setToggles(input.isAutoFire, input.isAutoSpin);
  },
  onOpenControls: () => controlsModal.show(),
});

// Écoute des choix de classe cliqués dans le panneau d'évolution
document.addEventListener('choose-class', (event: Event) => {
  const custom = event as CustomEvent<string>;
  if (custom.detail) {
    connection.send({
      t: 'command',
      command: { type: 'chooseClass', classId: custom.detail },
    });
  }
});

// Contrôleur d'entrées clavier et souris
const input = new InputController(canvas, {
  onStat: (stat) => {
    connection.send({ t: 'command', command: { type: 'upgradeStat', stat } });
  },
  onToggle: (_action, _enabled) => {
    hud.setToggles(input.isAutoFire, input.isAutoSpin);
  },
  bindings: loadBindings(),
});

// Connexion WebSocket au serveur
let connection: GameConnection;

function setupConnection(): void {
  connection = new GameConnection(gameSocketUrl(location), {
    onMessage: handleMessage,
    onClose: (reason) => {
      config = null;
      buffer = null;
      hud.hide();
      minimapContainer.hidden = true;
      deathScreen.hide();
      menu.showLobby();
      menu.setStatus(`Déconnecté (${reason}). Vous pouvez tenter de vous reconnecter.`);
    },
  });
}

setupConnection();
menu.setStatus('Connexion…');

function handleMessage(message: ServerMessage): void {
  switch (message.t) {
    case 'welcome':
      menu.setStatus('Connecté.');
      return;

    case 'room.joined': {
      config = message.config;
      currentRoomCode = message.code;
      const tickMs = 1000 / config.tickRate;
      buffer = new SnapshotBuffer(tickMs, tickMs * config.snapshotInterval * 2);

      // Persistance de la session pour reprise (resumeToken)
      menu.saveSession(message.code, message.resumeToken);
      menu.showRoom(message.code);

      hud.show();
      hud.setRoomCode(message.code);
      minimapContainer.hidden = false;
      deathScreen.hide();
      return;
    }

    case 'room.left':
      config = null;
      buffer = null;
      currentRoomCode = null;
      hud.hide();
      minimapContainer.hidden = true;
      deathScreen.hide();
      return menu.showLobby();

    case 'snapshot':
      lastServerTick = message.tick;
      buffer?.push(message, performance.now());

      // Mise à jour de l'état du joueur et du HUD
      hud.updateSelf(message.self, currentName);
      hud.updateLeaderboard(message.leaderboard, message.self.playerId);

      if (message.self.alive) {
        deathScreen.hide();
      } else {
        deathScreen.setTick(message.tick);
      }
      return;

    case 'death':
      deathScreen.show(message, config?.tickRate ?? 30);
      return;

    case 'notice':
      // Notification informative (arrivées, éliminations...)
      return;

    case 'pong': {
      const sent = pingSentTimes.get(message.id);
      if (sent !== undefined) {
        const rtt = Math.round(performance.now() - sent);
        pingSentTimes.delete(message.id);
        hud.setPing(rtt);
      }
      if (message.tick !== null) {
        lastServerTick = message.tick;
        deathScreen.setTick(message.tick);
      }
      return;
    }

    case 'error':
      if (message.code === 'room_not_found') {
        menu.clearSession(currentRoomCode ?? undefined);
      }
      return menu.setStatus(`Erreur : ${message.message}`);
  }
}

// Boucle périodique d'envoi du ping
setInterval(() => {
  if (config) {
    const id = nextPingId++;
    pingSentTimes.set(id, performance.now());
    connection.send({ t: 'ping', id });
    // Nettoyer les pings expirés
    if (pingSentTimes.size > 20) {
      const oldest = Array.from(pingSentTimes.keys()).slice(0, 10);
      oldest.forEach((k) => pingSentTimes.delete(k));
    }
  }
}, PING_INTERVAL_MS);

let previousFrameAt = performance.now();

function frame(now: number): void {
  const dt = (now - previousFrameAt) / 1000;
  previousFrameAt = now;

  const current = buffer?.sample(now) ?? null;
  renderer.draw(current, config, now);

  if (current) {
    deathScreen.setTick(current.tick);
  }

  // Rendu de la minicarte
  if (minimapCtx) {
    drawMinimap(minimapCtx, 130, 130, current, config);
  }

  // Échantillonnage des commandes du joueur
  const own = current?.entities.find((entity) => entity.id === current.self.entityId);
  if (own && renderer.camera && current?.self.alive) {
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

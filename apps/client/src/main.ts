import './style.css';
import type { ModeConfig, PlayerCommand, ServerMessage } from '@diep-fried/shared';
import { loadBindings } from './input/bindings';
import { InputController } from './input/input-controller';
import { GameConnection, gameSocketUrl, type RoomIntent } from './net/connection';
import { worldToScreen } from './render/camera';
import { drawMinimap } from './render/minimap';
import { Renderer } from './render/renderer';
import { SnapshotBuffer } from './state/snapshot-buffer';
import { readStored } from './state/storage';
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
let currentName = readStored('diep-fried:name') ?? 'Sans nom';
let exitStatus: string | null = null;

// Gestion du ping et de la latence
let nextPingId = 1;
const pingSentTimes = new Map<number, number>();

// Modal de configuration des commandes
const controlsModal = new ControlsModal({
  onBindingsChanged: (newBindings) => {
    input.setBindings(newBindings);
  },
  onVisibilityChanged: () => syncInputAvailability(),
});

// Écran de mort avec décompte de réapparition
const deathScreen = new DeathScreen({
  onRespawn: () => {
    if (!controlsModal.isVisible) sendCommand({ type: 'respawn' });
  },
});

// Menu d'accueil et salon
const menu = new Menu({
  create: (name, mode) => {
    enterRoom({ t: 'room.create', name, mode, options: {} });
  },
  join: (name, code, resumeToken) => {
    enterRoom({
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
    sendCommand({ type: 'upgradeStat', stat });
  },
  onChooseClass: (classId) => {
    sendCommand({ type: 'chooseClass', classId });
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

// Contrôleur d'entrées clavier et souris
const input = new InputController(canvas, {
  onStat: (stat) => {
    sendCommand({ type: 'upgradeStat', stat });
  },
  onToggle: (_action, _enabled) => {
    hud.setToggles(input.isAutoFire, input.isAutoSpin);
  },
  bindings: loadBindings(),
});

// Connexion explicite ; les intentions du menu attendent welcome.
const connection = new GameConnection(gameSocketUrl(location), {
  onMessage: handleMessage,
  onStateChange: (state, entering) => {
    menu.setBusy(entering || state === 'joining');
    if (state === 'connecting') menu.setStatus('Connexion…');
    else if (state === 'joining') menu.setStatus('Entrée dans le salon…');
  },
  onClose: (reason) => {
    resetRoom();
    menu.showLobby();
    menu.setStatus(
      exitStatus ??
        `Déconnecté (${reason}). Choisissez une entrée ou une reprise pour reconnecter.`,
    );
  },
});

function enterRoom(intent: RoomIntent): void {
  exitStatus = null;
  if (connection.enter(intent)) currentName = intent.name || 'Sans nom';
}

function sendCommand(command: PlayerCommand): void {
  if (config && !controlsModal.isVisible) connection.send({ t: 'command', command });
}

function syncInputAvailability(): void {
  input.setEnabled(!!buffer?.latest()?.self.alive && !controlsModal.isVisible);
}

function resetRoom(): void {
  config = null;
  buffer?.clear();
  buffer = null;
  currentRoomCode = null;
  lastInput = '';
  lastInputAt = 0;
  nextPingId = 1;
  pingSentTimes.clear();
  input.reset();
  input.setEnabled(false);
  renderer.reset();
  hud.reset();
  deathScreen.hide();
  minimapContainer.hidden = true;
}

input.setEnabled(false);
connection.connect();

function handleMessage(message: ServerMessage, rejectedIntent?: RoomIntent): void {
  switch (message.t) {
    case 'welcome':
      if (connection.state === 'ready') menu.setStatus('Connecté.');
      return;

    case 'room.joined': {
      resetRoom();
      exitStatus = null;
      config = message.config;
      currentRoomCode = message.code;
      const tickMs = 1000 / config.tickRate;
      buffer = new SnapshotBuffer(tickMs, tickMs * config.snapshotInterval * 2);

      // Persistance de la session pour reprise (resumeToken)
      menu.saveSession(message.code, message.resumeToken);
      menu.showRoom(message.code);

      hud.setRoomCode(message.code);
      minimapContainer.hidden = false;
      deathScreen.hide();
      return;
    }

    case 'room.left': {
      if (currentRoomCode) menu.clearSession(currentRoomCode);
      exitStatus = {
        requested: 'Vous avez quitté le salon. La session précédente est terminée.',
        closed: 'Le salon a été fermé. La session précédente est terminée.',
        kicked: 'Cette session a été remplacée ou expulsée. Aucune reprise automatique.',
      }[message.reason];
      resetRoom();
      menu.showLobby();
      menu.setStatus(exitStatus);
      return;
    }

    case 'snapshot':
      if (!config || !buffer) return;
      if (message.tick <= (buffer.latest()?.tick ?? -1)) return;
      buffer.push(message, performance.now());
      input.acknowledgeSequence(message.ackSeq);
      syncInputAvailability();

      // Mise à jour de l'état du joueur et du HUD
      hud.show();
      hud.updateSelf(message.self, currentName);
      hud.updateLeaderboard(message.leaderboard, message.self.playerId);

      deathScreen.syncSelf(message.self, message.tick, config.tickRate);
      return;

    case 'death':
      input.setEnabled(false);
      deathScreen.setTick(message.tick);
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
        deathScreen.setTick(message.tick);
      }
      return;
    }

    case 'error': {
      const failedResume = rejectedIntent?.t === 'room.join' && rejectedIntent.resumeToken;
      if (failedResume && (message.code === 'bad_message' || message.code === 'room_not_found')) {
        menu.clearSession(rejectedIntent.code);
        menu.setStatus(
          `Reprise impossible : ${message.message}. Ancien jeton supprimé. Pour un nouveau joueur, choisissez « Nouvelle entrée (sans reprise) ».`,
        );
      } else {
        menu.setStatus(`Erreur : ${message.message}`);
      }
      if (message.fatal) exitStatus = `Connexion interrompue : ${message.message}`;
      return;
    }
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

  // Rendu de la minicarte
  if (minimapCtx) {
    drawMinimap(minimapCtx, 130, 130, current, config);
  }

  // Échantillonnage des commandes du joueur
  const own = current?.entities.find((entity) => entity.id === current.self.entityId);
  if (own && renderer.camera && buffer?.latest()?.self.alive) {
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

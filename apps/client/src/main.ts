import './style.css';
import type { ModeConfig, PlayerCommand, ServerMessage } from '@diep-fried/shared';
import { loadBindings } from './input/bindings';
import { InputController } from './input/input-controller';
import { isTypingTarget } from './input/focus';
import { SandboxCommands } from './input/sandbox';
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
import { UpgradeTreeModal } from './ui/upgrade-tree-modal';
import { SandboxPanel } from './ui/sandbox-panel';
import { setupDisplaySettings } from './ui/display-settings';
import { MatchHud } from './ui/match-hud';
import { needsVisualReset } from './ui/match-model';

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
    sandboxPanel.setBindings(newBindings);
    matchHud.setBindings(newBindings);
  },
  onVisibilityChanged: () => syncInputAvailability(),
});

// Modal de l'arbre d'évolution des 54 classes
const upgradeTreeModal = new UpgradeTreeModal({
  onChooseClass: (classId) => {
    sendCommand({ type: 'chooseClass', classId });
  },
});

// Écran de mort avec décompte de réapparition
const deathScreen = new DeathScreen({
  onRespawn: () => {
    const latest = buffer?.latest();
    if (latest?.self.spectator || latest?.match?.phase === 'finished') return;
    if (!controlsModal.isVisible) sendCommand({ type: 'respawn' });
  },
});

// Menu d'accueil et salon
const menu = new Menu({
  create: (name, mode, options) => {
    enterRoom({ t: 'room.create', name, mode, options });
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

const sandboxCommands = new SandboxCommands(
  () => ({
    config,
    alive: !!buffer?.latest()?.self.alive,
    blocked: modalsOpen() || isTypingTarget(document.activeElement),
  }),
  (command) => sendCommand(command),
);
const sandboxPanel = new SandboxPanel(sandboxCommands);
sandboxPanel.setBindings(loadBindings());
const matchHud = new MatchHud(possessObjective);
matchHud.setBindings(loadBindings());
setupDisplaySettings((settings) => renderer.setDisplaySettings(settings));
document.getElementById('hud-leave')!.addEventListener('click', leaveRoom);

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
  onOpenUpgradeTree: () => {
    upgradeTreeModal.toggle();
  },
});

// Contrôleur d'entrées clavier et souris
const input = new InputController(canvas, {
  onStat: (stat) => {
    sendCommand({ type: 'upgradeStat', stat });
  },
  onToggle: (_action, _enabled) => {
    hud.setToggles(input.isAutoFire, input.isAutoSpin);
  },
  onUpgradeTree: (open) => {
    upgradeTreeModal.setHeld(open);
  },
  bindings: loadBindings(),
  onSandbox: (action) => sandboxCommands.run(action),
  onPossess: possessObjective,
  isBlocked: () => modalsOpen(),
});

// Connexion explicite ; les intentions du menu attendent welcome.
const connection = new GameConnection(gameSocketUrl(location), {
  onMessage: handleMessage,
  onStateChange: (state, entering) => {
    menu.setBusy(entering || state === 'joining' || state === 'leaving');
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
  if (command.type === 'sandbox' && !sandboxCommands.available) return;
  if (config && !controlsModal.isVisible) connection.send({ t: 'command', command });
}

function possessObjective(): void {
  const latest = buffer?.latest();
  if (!latest?.self.alive || latest.match?.phase === 'finished' || modalsOpen()) return;
  if (config?.mode === 'domination' || config?.mode === 'mothership')
    sendCommand({ type: 'possess' });
}

function modalsOpen(): boolean {
  return controlsModal.isVisible || upgradeTreeModal.isOpen();
}

function leaveRoom(): void {
  if (!currentRoomCode) return;
  // L’intention explicite invalide la reprise même si l’accusé est perdu sur le réseau.
  menu.clearSession(currentRoomCode);
  exitStatus = 'Vous avez quitté le salon. La session précédente est terminée.';
  connection.leave();
  resetRoom();
  menu.showLobby();
  menu.setStatus(exitStatus);
}

function syncInputAvailability(): void {
  const latest = buffer?.latest();
  input.setEnabled(
    !!latest?.self.alive && latest.match?.phase !== 'finished' && !controlsModal.isVisible,
  );
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
  sandboxCommands.reset();
  sandboxPanel.sync(null);
  renderer.reset();
  hud.reset();
  matchHud.reset();
  deathScreen.hide();
  upgradeTreeModal.hide();
  if (controlsModal.isVisible) controlsModal.hide();
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
      canvas.focus();

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
      const previous = buffer.latest();
      if (needsVisualReset(previous, message)) {
        buffer.clear();
        renderer.reset();
        // Garder la séquence de connexion, purger touches/tir et forcer une intention neutre.
        input.reset(false);
        lastInput = '';
        lastInputAt = 0;
        // Une mort reçue juste avant self conserve son résumé et son éliminateur.
        if (message.self.alive || previous?.match?.round !== message.match?.round)
          deathScreen.hide();
        upgradeTreeModal.hide();
      }
      buffer.push(message, performance.now());
      input.acknowledgeSequence(message.ackSeq);
      syncInputAvailability();

      // Mise à jour de l'état du joueur et du HUD
      hud.show();
      hud.updateSelf(message.self, currentName);
      hud.updateLeaderboard(message.leaderboard, message.self.playerId);
      matchHud.update(message, config);

      if (message.match?.phase === 'finished') deathScreen.hide();
      else deathScreen.syncSelf(message.self, message.tick, config.tickRate);
      return;

    case 'death':
      input.setEnabled(false);
      matchHud.notify(
        message.killerName ? `Éliminé par ${message.killerName}` : 'Vous avez été éliminé',
      );
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
  sandboxPanel.sync(config);
  matchHud.renderNotices(now);

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

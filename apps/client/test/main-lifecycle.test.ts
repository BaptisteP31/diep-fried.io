import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveModeConfig,
  PROTOCOL_VERSION,
  emptyStatLevels,
  type ClientMessage,
  type ServerMessage,
} from '@diep-fried/shared';
import { installDom, type Element } from './helpers/dom';

let el: (id: string) => Element;

const ui = vi.hoisted(() => ({
  menu: null as any,
  hud: null as any,
  death: null as any,
  input: null as any,
  renderer: null as any,
  controls: null as any,
}));
vi.mock('../src/ui/menu', () => ({
  Menu: class {
    actions: any;
    status = '';
    setStatus = vi.fn((text: string) => {
      this.status = text;
    });
    setBusy = vi.fn();
    showLobby = vi.fn();
    showRoom = vi.fn();
    saveSession = vi.fn();
    clearSession = vi.fn();
    constructor(actions: any) {
      this.actions = actions;
      ui.menu = this;
    }
  },
}));
vi.mock('../src/ui/hud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui/hud')>()),
  GameHud: class {
    reset = vi.fn();
    show = vi.fn();
    setRoomCode = vi.fn();
    setPing = vi.fn();
    setToggles = vi.fn();
    updateSelf = vi.fn();
    updateLeaderboard = vi.fn();
    constructor() {
      ui.hud = this;
    }
  },
}));
vi.mock('../src/ui/death-screen', () => ({
  DeathScreen: class {
    hide = vi.fn();
    show = vi.fn();
    setTick = vi.fn();
    syncSelf = vi.fn();
    constructor() {
      ui.death = this;
    }
  },
}));
vi.mock('../src/ui/controls-modal', () => ({
  ControlsModal: class {
    isVisible = false;
    hide = vi.fn(() => {
      this.isVisible = false;
    });
    constructor() {
      ui.controls = this;
    }
  },
}));
vi.mock('../src/input/input-controller', () => ({
  InputController: class {
    options: any;
    reset = vi.fn();
    setEnabled = vi.fn();
    acknowledgeSequence = vi.fn();
    constructor(_target: unknown, options: any) {
      this.options = options;
      ui.input = this;
    }
  },
}));
vi.mock('../src/render/renderer', () => ({
  Renderer: class {
    setDisplaySettings = vi.fn();
    reset = vi.fn();
    resize = vi.fn();
    draw = vi.fn();
    camera = null;
    constructor() {
      ui.renderer = this;
    }
  },
}));

class Socket extends EventTarget {
  static all: Socket[] = [];
  readyState = 0;
  sent: ClientMessage[] = [];
  constructor() {
    super();
    Socket.all.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(message: ServerMessage) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}
const welcome: ServerMessage = { t: 'welcome', protocol: PROTOCOL_VERSION, server: 'test' };
function joined(code = 'ABCDEF'): ServerMessage {
  return {
    t: 'room.joined',
    code,
    playerId: 1,
    config: resolveModeConfig('ffa'),
    resumeToken: 'token',
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  Socket.all = [];
  vi.stubGlobal('WebSocket', Socket);
  ({ el } = installDom());
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  await import('../src/main');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function enter(mode: 'ffa' | 'sandbox' = 'ffa') {
  ui.menu.actions.create('Alice', mode, { maxPlayers: 8, arenaSize: 'small' });
  const socket = Socket.all[0]!;
  socket.open();
  socket.receive(welcome);
  socket.receive({ ...joined(), config: resolveModeConfig(mode) } as ServerMessage);
  return socket;
}

describe('intégration du cycle client', () => {
  it('envoie les options du créateur par le vrai contrat GameConnection', () => {
    const socket = enter();
    expect(socket.sent[1]).toEqual({
      t: 'room.create',
      name: 'Alice',
      mode: 'ffa',
      options: { maxPlayers: 8, arenaSize: 'small' },
    });
  });

  it('quitter invalide la reprise même si l’accusé est perdu, bloque les actions puis permet une nouvelle entrée', () => {
    const socket = enter();
    el('hud-leave').dispatchEvent(new Event('click'));
    expect(socket.sent.at(-1)).toEqual({ t: 'room.leave' });
    expect(ui.menu.clearSession).toHaveBeenCalledWith('ABCDEF');
    expect(ui.menu.showLobby).toHaveBeenCalled();
    ui.input.options.onSandbox('levelUp');
    ui.menu.actions.create('Bob', 'ffa', {});
    expect(socket.sent.filter((message) => message.t === 'room.create')).toHaveLength(1);
    socket.receive({ t: 'room.left', reason: 'requested' });
    ui.menu.actions.create('Bob', 'ffa', {});
    expect(socket.sent.at(-1)).toEqual({ t: 'room.create', name: 'Bob', mode: 'ffa', options: {} });
  });

  it('garde la raison du départ si la connexion se ferme avant l’accusé', () => {
    const socket = enter();
    el('hud-leave').dispatchEvent(new Event('click'));
    socket.close();
    expect(ui.menu.status).toContain('Vous avez quitté');
    expect(ui.menu.clearSession).toHaveBeenCalledWith('ABCDEF');
  });
  it('les boutons du menu reconnectent réellement après fermeture et attendent welcome', () => {
    const socket = enter();
    ui.controls.isVisible = true;
    socket.close();
    expect(ui.controls.hide).toHaveBeenCalled();
    expect(ui.menu.showLobby).toHaveBeenCalled();
    expect(ui.menu.status).toContain('Déconnecté');
    expect(ui.renderer.reset).toHaveBeenCalled();
    expect(ui.input.reset).toHaveBeenCalled();
    ui.menu.actions.join('Alice', 'ABCDEF', 'token');
    const next = Socket.all[1]!;
    next.open();
    expect(next.sent.map((m) => m.t)).toEqual(['hello']);
    next.receive(welcome);
    expect(next.sent.at(-1)).toEqual({
      t: 'room.join',
      name: 'Alice',
      code: 'ABCDEF',
      resumeToken: 'token',
    });
    expect(ui.menu.status).toBe('Entrée dans le salon…');
    next.receive(joined());
    expect(ui.menu.showRoom).toHaveBeenLastCalledWith('ABCDEF');
  });

  it.each(['bad_message', 'room_not_found'] as const)(
    'supprime le jeton refusé pour %s et propose une nouvelle entrée explicite',
    (code) => {
      const socket = Socket.all[0]!;
      ui.menu.actions.join('Alice', 'ABCDEF', 'old-token');
      socket.open();
      socket.receive(welcome);
      socket.receive({ t: 'error', code, message: 'expired', fatal: false });
      expect(ui.menu.clearSession).toHaveBeenCalledWith('ABCDEF');
      expect(ui.menu.status).toContain('Nouvelle entrée (sans reprise)');
      vi.advanceTimersByTime(60_000);
      expect(socket.sent).toHaveLength(2);
      expect(Socket.all).toHaveLength(1);
    },
  );

  it.each(['requested', 'closed', 'kicked'] as const)(
    'purge la session pour room.left %s et garde la raison après fermeture',
    (reason) => {
      const socket = enter();
      ui.hud.reset.mockClear();
      ui.input.reset.mockClear();
      socket.receive({ t: 'room.left', reason });
      expect(ui.menu.clearSession).toHaveBeenCalledWith('ABCDEF');
      expect(ui.hud.reset).toHaveBeenCalled();
      expect(ui.input.reset).toHaveBeenCalled();
      expect(ui.death.hide).toHaveBeenCalled();
      const status = ui.menu.status;
      socket.close();
      expect(ui.menu.status).toBe(status);
    },
  );

  it('réconcilie la mort depuis self et remet les pings à zéro pour un autre salon', () => {
    const socket = enter();
    const self = {
      playerId: 1,
      entityId: null,
      alive: false,
      classId: 'tank',
      level: 4,
      score: 500,
      levelProgress: 0,
      statPoints: 0,
      stats: emptyStatLevels(),
      statCaps: emptyStatLevels(),
      classChoices: [],
      view: 900,
      respawnTick: 400,
    };
    socket.receive({ t: 'snapshot', tick: 300, ackSeq: 0, self, entities: [] });
    expect(ui.death.syncSelf).toHaveBeenCalledWith(self, 300, 30);
    expect(ui.input.setEnabled).toHaveBeenLastCalledWith(false);
    socket.receive({
      t: 'snapshot',
      tick: 299,
      ackSeq: 0,
      self: { ...self, alive: true },
      entities: [],
    });
    expect(ui.death.syncSelf).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(socket.sent.at(-1)).toEqual({ t: 'ping', id: 1 });
    socket.receive({ t: 'room.left', reason: 'requested' });
    ui.menu.actions.create('Bob', 'ffa');
    socket.receive(joined('GHIJKL'));
    vi.advanceTimersByTime(1000);
    expect(socket.sent.at(-1)).toEqual({ t: 'ping', id: 1 });
    expect(ui.hud.setRoomCode).toHaveBeenLastCalledWith('GHIJKL');
  });
});

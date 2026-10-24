import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseRoomOptions,
  formatBotDifficulty,
  modeDetails,
  type ClientRoomOptions,
} from '../src/ui/modes';
import { Menu } from '../src/ui/menu';
import { GameHud } from '../src/ui/hud';
import { GameConnection, type RoomIntent } from '../src/net/connection';
import { installDom, type Element } from './helpers/dom';
import {
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
  PROTOCOL_VERSION,
} from '@diep-fried/shared';

let el: (id: string) => Element;

beforeEach(() => {
  ({ el } = installDom());
});
afterEach(() => vi.unstubAllGlobals());

describe('parseRoomOptions et options de bots', () => {
  it('reste compatible avec les appels existants à 3 arguments', () => {
    const opts = parseRoomOptions('8', 'medium', 'normal');
    expect(opts).toEqual({
      maxPlayers: 8,
      arenaSize: 'medium',
      shapeDensity: 'normal',
    });
    expect(opts.botCount).toBeUndefined();
    expect(opts.botDifficulty).toBeUndefined();
  });

  it('ne convertit pas les champs vides en 0 involontairement', () => {
    const opts = parseRoomOptions('', '', '', '', '');
    expect(opts).toEqual({});
    expect(opts.botCount).toBeUndefined();
    expect(opts.botDifficulty).toBeUndefined();
  });

  it('accepte 0 pour permettre une partie sans bots', () => {
    const opts = parseRoomOptions('8', 'medium', 'normal', '0', 'normal');
    expect(opts.botCount).toBe(0);
    expect(opts.botDifficulty).toBe('normal');
  });

  it('accepte le nombre de bots entre 0 et 12 avec difficulté valide', () => {
    const easy = parseRoomOptions('', '', '', '5', 'easy');
    expect(easy.botCount).toBe(5);
    expect(easy.botDifficulty).toBe('easy');

    const hard = parseRoomOptions('', '', '', '12', 'hard');
    expect(hard.botCount).toBe(12);
    expect(hard.botDifficulty).toBe('hard');
  });

  it('rejette strictement les valeurs invalides pour botCount', () => {
    for (const invalid of ['-1', '13', '1.5', 'NaN', 'abc']) {
      expect(() => parseRoomOptions('', '', '', invalid, 'normal')).toThrow(
        'Le nombre de bots doit être un entier de 0 à 12.',
      );
    }
  });

  it('rejette strictement les valeurs invalides pour botDifficulty', () => {
    for (const invalid of ['expert', 'nightmare', '1', 'true']) {
      expect(() => parseRoomOptions('', '', '', '5', invalid)).toThrow(
        'Difficulté de bots invalide.',
      );
    }
  });

  it('rejette un nombre de bots supérieur ou égal à maxPlayers (humains + bots)', () => {
    // Si maxPlayers = 4, le joueur humain prend 1 place, donc max 3 bots
    expect(() => parseRoomOptions('4', '', '', '4', 'normal')).toThrow(
      'Le nombre de bots ne peut pas dépasser 3 pour une capacité de 4 joueurs.',
    );
    // Si maxPlayers = 1, max 0 bot
    expect(() => parseRoomOptions('1', '', '', '1', 'normal')).toThrow(
      'Le nombre de bots ne peut pas dépasser 0 pour une capacité de 1 joueur.',
    );
    // maxPlayers = 4 avec 3 bots est valide
    const valid = parseRoomOptions('4', '', '', '3', 'normal');
    expect(valid.botCount).toBe(3);
  });

  it('formate les libellés de difficulté en français', () => {
    expect(formatBotDifficulty('easy')).toBe('Facile');
    expect(formatBotDifficulty('normal')).toBe('Normale');
    expect(formatBotDifficulty('hard')).toBe('Difficile');
    expect(formatBotDifficulty(undefined)).toBe('Normale');
  });

  it('mentionne dans les règles des modes à objectifs que les bots permettent de démarrer seul', () => {
    const details = modeDetails('domination');
    expect(details.rules).toContain('2 joueurs connectés minimum');
    expect(details.rules).toContain('bots');
    expect(details.rules).toContain('seul humain');
  });
});

describe('Interface Menu et adaptation dynamique', () => {
  it('initialise les champs avec les bornes et écouteurs', () => {
    const create = vi.fn();
    new Menu({ create, join: vi.fn(), onOpenControls: vi.fn() });

    expect(el('menu-bot-count')).toBeDefined();
    expect(el('menu-bot-difficulty')).toBeDefined();
    expect(el('menu-bots-help')).toBeDefined();
  });

  it('adapte dynamiquement maxBots et restreint la valeur quand maxPlayers change', () => {
    new Menu({ create: vi.fn(), join: vi.fn(), onOpenControls: vi.fn() });

    // Initialement sans maxPlayers -> max bots = 12
    expect(el('menu-bot-count').max).toBe('12');

    // L'utilisateur saisit maxPlayers = 4
    el('menu-max-players').value = '4';
    el('menu-max-players').dispatchEvent(new Event('input'));
    expect(el('menu-bot-count').max).toBe('3');
    expect(el('menu-bots-help').textContent).toContain('4 joueurs max');
    expect(el('menu-bots-help').textContent).toContain('max. 3 bots');

    // Si l'utilisateur avait une valeur de bots supérieure à 3 (ex: 5), elle est automatiquement ajustée
    el('menu-bot-count').value = '5';
    el('menu-max-players').dispatchEvent(new Event('input'));
    expect(el('menu-bot-count').value).toBe('3');

    // Si maxPlayers est effacé, la borne redevient 12
    el('menu-max-players').value = '';
    el('menu-max-players').dispatchEvent(new Event('input'));
    expect(el('menu-bot-count').max).toBe('12');
  });

  it('transmet les options de bots renseignées à MenuActions.create', () => {
    const create = vi.fn();
    new Menu({ create, join: vi.fn(), onOpenControls: vi.fn() });

    el('menu-max-players').value = '10';
    el('menu-bot-count').value = '5';
    el('menu-bot-difficulty').value = 'hard';

    el('menu-create').dispatchEvent(new Event('click'));

    expect(create).toHaveBeenCalledWith(
      expect.any(String),
      'ffa',
      expect.objectContaining({
        maxPlayers: 10,
        botCount: 5,
        botDifficulty: 'hard',
      }),
    );
  });

  it('permet de créer un salon avec 0 bots (partie sans bots)', () => {
    const create = vi.fn();
    new Menu({ create, join: vi.fn(), onOpenControls: vi.fn() });

    el('menu-bot-count').value = '0';
    el('menu-bot-difficulty').value = 'normal';

    el('menu-create').dispatchEvent(new Event('click'));

    expect(create).toHaveBeenCalledWith(
      expect.any(String),
      'ffa',
      expect.objectContaining({
        botCount: 0,
        botDifficulty: 'normal',
      }),
    );
  });

  it('focalise le champ botCount en cas d’erreur liée aux bots', () => {
    new Menu({ create: vi.fn(), join: vi.fn(), onOpenControls: vi.fn() });

    el('menu-bot-count').value = '15'; // trop élevé
    el('menu-create').dispatchEvent(new Event('click'));

    expect(el('menu-status').textContent).toContain('entier de 0 à 12');
    expect(document.activeElement).toBe(el('menu-bot-count'));
  });
});

describe('Transmission complète JSON via GameConnection', () => {
  it('émet le JSON room.create sans perte des champs botCount et botDifficulty', () => {
    const sentMessages: string[] = [];
    const socket = new EventTarget() as WebSocket & {
      readyState: number;
      send: (m: string) => void;
    };
    socket.readyState = 1;
    socket.send = (payload: string) => {
      sentMessages.push(payload);
    };

    const connection = new GameConnection(
      'ws://localhost/ws',
      { onMessage: vi.fn(), onClose: vi.fn() },
      () => socket,
    );

    const intent: RoomIntent = {
      t: 'room.create',
      name: 'Player1',
      mode: 'ffa',
      options: {
        maxPlayers: 8,
        arenaSize: 'medium',
        shapeDensity: 'normal',
        botCount: 5,
        botDifficulty: 'normal',
      },
    };

    connection.enter(intent);
    // Simule la réception du welcome pour autoriser l'envoi de l'intention
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ t: 'welcome', protocol: PROTOCOL_VERSION, server: 'test' }),
      }),
    );

    expect(sentMessages.length).toBeGreaterThan(0);
    const createMsg = JSON.parse(sentMessages[sentMessages.length - 1]!);
    expect(createMsg).toEqual({
      t: 'room.create',
      name: 'Player1',
      mode: 'ffa',
      options: {
        maxPlayers: 8,
        arenaSize: 'medium',
        shapeDensity: 'normal',
        botCount: 5,
        botDifficulty: 'normal',
      },
    });
  });
});

describe('Indication salon dans GameHud', () => {
  it('affiche la configuration cible des bots selon la config reçue', () => {
    const hud = new GameHud({
      onUpgradeStat: vi.fn(),
      onChooseClass: vi.fn(),
      onToggleAutoFire: vi.fn(),
      onToggleAutoSpin: vi.fn(),
      onOpenControls: vi.fn(),
    });

    hud.setBots({ count: 5, difficulty: 'normal' });
    expect(el('hud-bots').textContent).toBe('Bots : 5 · Normale');

    hud.setBots({ count: 3, difficulty: 'easy' });
    expect(el('hud-bots').textContent).toBe('Bots : 3 · Facile');

    hud.setBots({ count: 8, difficulty: 'hard' });
    expect(el('hud-bots').textContent).toBe('Bots : 8 · Difficile');

    hud.setBots({ count: 0, difficulty: 'normal' });
    expect(el('hud-bots').textContent).toBe('Bots : 0');

    hud.setBots(null);
    expect(el('hud-bots').textContent).toBe('');
  });

  it('réinitialise l’indication des bots lors d’un reset du salon', () => {
    const hud = new GameHud({
      onUpgradeStat: vi.fn(),
      onChooseClass: vi.fn(),
      onToggleAutoFire: vi.fn(),
      onToggleAutoSpin: vi.fn(),
      onOpenControls: vi.fn(),
    });

    hud.setBots({ count: 5, difficulty: 'normal' });
    expect(el('hud-bots').textContent).toBe('Bots : 5 · Normale');

    hud.reset();
    expect(el('hud-bots').textContent).toBe('');
  });
});

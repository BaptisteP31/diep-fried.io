import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src';
import { decodeClientMessage, decodeServerMessage, encodeMessage } from '../src/protocol/codec';

const validInput = {
  seq: 1,
  move: { x: 0, y: 0 },
  aim: { x: 100, y: 0 },
  fire: false,
  alt: false,
};

function decode(value: unknown) {
  return decodeClientMessage(JSON.stringify(value));
}

describe('validation ponctuelle des commandes Sandbox', () => {
  it.each(['levelUp', 'cycleClass', 'selfDestruct', 'toggleGod', 'summonBoss'] as const)(
    'accepte l’action sandbox : %s',
    (action) => {
      const decoded = decode({ t: 'command', command: { type: 'sandbox', action } });
      expect(decoded).toEqual({
        ok: true,
        message: { t: 'command', command: { type: 'sandbox', action } },
      });
    },
  );

  it.each(['godMode', 'noclip', 'spawnDominator', '', 'LEVELUP'])(
    'rejette une action sandbox invalide : %s',
    (action) => {
      expect(decode({ t: 'command', command: { type: 'sandbox', action } }).ok).toBe(false);
    },
  );
});

describe('decodeClientMessage', () => {
  it('accepte chaque message client valide', () => {
    const messages = [
      { t: 'hello', protocol: 1, client: 'test' },
      {
        t: 'room.create',
        name: 'Ana',
        mode: 'ffa',
        options: { maxPlayers: 4, arenaSize: 'small', botCount: 5, botDifficulty: 'normal' },
      },
      {
        t: 'room.create',
        name: 'Ana',
        mode: 'teams2',
        options: { botCount: 0, botDifficulty: 'easy' },
      },
      {
        t: 'room.create',
        name: 'Ana',
        mode: 'maze',
        options: { botCount: 12, botDifficulty: 'hard' },
      },
      { t: 'room.join', code: 'ABC234', name: 'Ana', resumeToken: 'tok' },
      { t: 'room.leave' },
      { t: 'input', input: validInput },
      { t: 'command', command: { type: 'upgradeStat', stat: 'reload' } },
      { t: 'command', command: { type: 'chooseClass', classId: 'machine-gun' } },
      { t: 'command', command: { type: 'respawn' } },
      { t: 'ping', id: 7 },
    ];
    for (const message of messages) {
      expect(decode(message)).toEqual({ ok: true, message });
    }
  });

  it('reconstruit un objet sans les champs inconnus', () => {
    const raw = JSON.stringify({
      t: 'room.create',
      name: 'Ana',
      mode: 'ffa',
      options: { maxPlayers: 4, hack: true },
      extra: 'drop-me',
    });
    expect(decodeClientMessage(raw)).toEqual({
      ok: true,
      message: {
        t: 'room.create',
        name: 'Ana',
        mode: 'ffa',
        options: { maxPlayers: 4 },
      },
    });
  });

  it('nettoie le pseudonyme à la lecture', () => {
    const raw = JSON.stringify({ t: 'room.create', name: '  Ana\u0000  ', mode: 'ffa' });
    const result = decodeClientMessage(raw);
    expect(result.ok && result.message.t === 'room.create' && result.message.name).toBe('Ana');
  });

  it.each([
    ['JSON mal formé', '{'],
    ['tableau', '[]'],
    ['sans discriminant', JSON.stringify({ foo: 'bar' })],
    ['type inconnu', JSON.stringify({ t: 'unknown' })],
    ['mode inconnu', JSON.stringify({ t: 'room.create', name: 'a', mode: 'battle-royale' })],
    ['code de salon invalide', JSON.stringify({ t: 'room.join', code: 'trop-long', name: 'a' })],
    [
      'move hors bornes',
      JSON.stringify({ t: 'input', input: { ...validInput, move: { x: 2, y: 0 } } }),
    ],
    [
      'aim non fini',
      JSON.stringify({ t: 'input', input: { ...validInput, aim: { x: null, y: 0 } } }),
    ],
    [
      'aim trop lointain',
      JSON.stringify({ t: 'input', input: { ...validInput, aim: { x: 1e9, y: 0 } } }),
    ],
    ['seq négatif', JSON.stringify({ t: 'input', input: { ...validInput, seq: -1 } })],
    ['seq non entier', JSON.stringify({ t: 'input', input: { ...validInput, seq: 1.5 } })],
    ['fire non booléen', JSON.stringify({ t: 'input', input: { ...validInput, fire: 1 } })],
    [
      'statistique inconnue',
      JSON.stringify({ t: 'command', command: { type: 'upgradeStat', stat: 'luck' } }),
    ],
    [
      'classe mal formée',
      JSON.stringify({ t: 'command', command: { type: 'chooseClass', classId: '../x' } }),
    ],
    [
      'option hors liste',
      JSON.stringify({ t: 'room.create', name: '', mode: 'ffa', options: { arenaSize: 'huge' } }),
    ],
    [
      'botCount négatif',
      JSON.stringify({ t: 'room.create', name: '', mode: 'ffa', options: { botCount: -1 } }),
    ],
    [
      'botCount trop grand (>12)',
      JSON.stringify({ t: 'room.create', name: '', mode: 'ffa', options: { botCount: 13 } }),
    ],
    [
      'botCount non entier',
      JSON.stringify({ t: 'room.create', name: '', mode: 'ffa', options: { botCount: 3.5 } }),
    ],
    [
      'botCount non numérique',
      JSON.stringify({ t: 'room.create', name: '', mode: 'ffa', options: { botCount: '5' } }),
    ],
    [
      'botDifficulty invalide',
      JSON.stringify({
        t: 'room.create',
        name: '',
        mode: 'ffa',
        options: { botDifficulty: 'extreme' },
      }),
    ],
    [
      'message trop long',
      JSON.stringify({ t: 'ping', id: 1, pad: 'x'.repeat(LIMITS.maxClientMessageBytes) }),
    ],
  ])('rejette : %s', (_label, raw) => {
    expect(decodeClientMessage(raw).ok).toBe(false);
  });
});

describe('decodeServerMessage', () => {
  it('relit un message encodé', () => {
    const message = { t: 'pong', id: 1, tick: 42 } as const;
    expect(decodeServerMessage(encodeMessage(message))).toEqual({ ok: true, message });
  });

  it('rejette une enveloppe sans type', () => {
    expect(decodeServerMessage('{"id":1}').ok).toBe(false);
  });
});

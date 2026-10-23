import { describe, expect, it } from 'vitest';
import { LIMITS, decodeClientMessage, decodeServerMessage, encodeMessage } from '../src';

const decode = (value: unknown) => decodeClientMessage(JSON.stringify(value));

const validInput = {
  seq: 3,
  move: { x: 1, y: -0.5 },
  aim: { x: 120, y: -40 },
  fire: true,
  alt: false,
};

describe('extensions additives v1 modes et sandbox', () => {
  it.each(['teams2', 'teams4', 'maze'])('accepte le mode %s', (mode) => {
    expect(decode({ t: 'room.create', name: '', mode }).ok).toBe(true);
  });
  it.each(['levelUp', 'cycleClass', 'selfDestruct', 'toggleGod'])(
    'valide et nettoie sandbox.%s',
    (action) => {
      expect(
        decode({ t: 'command', command: { type: 'sandbox', action, level: 999, cheats: true } }),
      ).toEqual({
        ok: true,
        message: { t: 'command', command: { type: 'sandbox', action } },
      });
    },
  );
  it.each([undefined, null, true, 1, {}, [], 'levelup', 'teleport', 'constructor'])(
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
        options: { maxPlayers: 4, arenaSize: 'small' },
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
    const result = decode({ t: 'input', input: { ...validInput, teleport: true }, admin: 1 });
    expect(result).toEqual({ ok: true, message: { t: 'input', input: validInput } });
  });

  it('nettoie le pseudonyme', () => {
    const name = (raw: string) => {
      const result = decode({ t: 'room.join', code: 'ABC234', name: raw });
      return result.ok && result.message.t === 'room.join' ? result.message.name : null;
    };
    expect(name('  a\u0000b \n c  d-very-long-name')).toBe('ab c d-very-long');
    expect(name('a\tb\u200b')).toBe('a b');
  });

  it.each([
    ['JSON invalide', '{'],
    ['tableau', '[]'],
    ['type inconnu', JSON.stringify({ t: 'teleport' })],
    ['mode inconnu', JSON.stringify({ t: 'room.create', name: '', mode: 'battle', options: {} })],
    ['code ambigu', JSON.stringify({ t: 'room.join', code: 'ABC10O', name: '' })],
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

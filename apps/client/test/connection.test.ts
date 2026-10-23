import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveModeConfig,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@diep-fried/shared';
import { GameConnection, type RoomIntent } from '../src/net/connection';

class FakeSocket extends EventTarget {
  readyState = 0;
  sent: ClientMessage[] = [];
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(message: ServerMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
  send(raw: string): void {
    if (this.readyState !== 1) throw new Error('closed socket');
    this.sent.push(JSON.parse(raw));
  }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

const create: RoomIntent = { t: 'room.create', name: 'Test', mode: 'ffa', options: {} };
const resume: RoomIntent = { t: 'room.join', name: 'Test', code: 'ABCDEF', resumeToken: 'secret' };
const welcome: ServerMessage = { t: 'welcome', protocol: PROTOCOL_VERSION, server: 'test' };
const joined: ServerMessage = {
  t: 'room.joined',
  code: 'ABCDEF',
  playerId: 1,
  config: resolveModeConfig('ffa'),
  resumeToken: 'secret',
};

function harness() {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  const onMessage = vi.fn();
  const onClose = vi.fn();
  const connection = new GameConnection('ws://test/ws', { onMessage, onClose }, () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  return { sockets, connection, onMessage, onClose };
}

afterEach(() => vi.useRealTimers());

describe('cycle réseau client', () => {
  it('attend room.left avant une autre entrée et borne un départ sans réponse', () => {
    const { sockets, connection, onClose } = harness();
    connection.enter(create);
    const socket = sockets[0]!;
    socket.open();
    socket.receive(welcome);
    socket.receive(joined);
    expect(connection.leave()).toBe(true);
    expect(connection.state).toBe('leaving');
    expect(connection.leave()).toBe(false);
    expect(connection.enter(resume)).toBe(false);
    expect(connection.send({ t: 'command', command: { type: 'sandbox', action: 'levelUp' } })).toBe(
      false,
    );
    vi.advanceTimersByTime(10_000);
    expect(connection.state).toBe('disconnected');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(socket.sent.filter((message) => message.t === 'room.leave')).toHaveLength(1);
  });
  it('signale une erreur réseau une seule fois et permet un nouvel essai explicite', () => {
    const { sockets, connection, onClose } = harness();
    connection.enter(create);
    sockets[0]!.dispatchEvent(new Event('error'));
    sockets[0]!.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(connection.state).toBe('disconnected');
    connection.enter(resume);
    expect(sockets).toHaveLength(2);
  });

  it('ne laisse pas le menu bloqué si le constructeur WebSocket échoue', () => {
    const onClose = vi.fn();
    const connection = new GameConnection('ws://test/ws', { onMessage: vi.fn(), onClose }, () => {
      throw new Error('WebSocket indisponible');
    });
    expect(() => connection.enter(create)).not.toThrow();
    expect(connection.state).toBe('disconnected');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('attend welcome et bloque les doubles créations avant et après ouverture', () => {
    const { sockets, connection } = harness();
    connection.connect();
    expect(connection.enter(create)).toBe(true);
    expect(connection.enter(resume)).toBe(false);
    const socket = sockets[0]!;
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent.map((m) => m.t)).toEqual(['hello']);
    expect(connection.send({ t: 'command', command: { type: 'respawn' } })).toBe(false);
    socket.receive(welcome);
    socket.receive(welcome);
    expect(socket.sent).toEqual([expect.objectContaining({ t: 'hello' }), create]);
    expect(connection.enter(create)).toBe(false);
    socket.receive(joined);
    expect(connection.state).toBe('joined');
    expect(connection.enter(create)).toBe(false);
  });

  it('recrée une seule socket après fermeture et reprend avec le jeton après welcome', () => {
    const { sockets, connection, onMessage, onClose } = harness();
    connection.enter(create);
    sockets[0]!.open();
    sockets[0]!.receive(welcome);
    sockets[0]!.receive(joined);
    sockets[0]!.close();
    expect(connection.state).toBe('disconnected');
    expect(connection.send({ t: 'command', command: { type: 'respawn' } })).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    connection.enter(resume);
    connection.enter(resume);
    expect(sockets).toHaveLength(2);
    const next = sockets[1]!;
    next.open();
    expect(next.sent.map((m) => m.t)).toEqual(['hello']);
    const delivered = onMessage.mock.calls.length;
    sockets[0]!.receive(joined);
    sockets[0]!.close();
    expect(onMessage).toHaveBeenCalledTimes(delivered);
    expect(onClose).toHaveBeenCalledTimes(1);
    next.receive(welcome);
    expect(next.sent[1]).toEqual(resume);
    next.receive(joined);
    expect(connection.state).toBe('joined');
  });

  it.each(['bad_message', 'room_not_found'] as const)(
    'remonte %s avec la reprise refusée sans nouvelle identité implicite',
    (code) => {
      const { sockets, connection, onMessage } = harness();
      connection.enter(resume);
      const socket = sockets[0]!;
      socket.open();
      socket.receive(welcome);
      const error: ServerMessage = { t: 'error', code, message: 'expired', fatal: false };
      socket.receive(error);
      expect(onMessage).toHaveBeenLastCalledWith(error, resume);
      expect(connection.state).toBe('ready');
      vi.advanceTimersByTime(60_000);
      expect(socket.sent).toHaveLength(2);
      expect(sockets).toHaveLength(1);
      const fresh: RoomIntent = { t: 'room.join', code: 'ABCDEF', name: 'New' };
      connection.enter(fresh);
      expect(socket.sent.at(-1)).toEqual(fresh);
    },
  );

  it.each(['requested', 'closed', 'kicked'] as const)(
    'revient au lobby pour room.left %s sans rejouer une entrée',
    (reason) => {
      const { sockets, connection } = harness();
      connection.enter(resume);
      const socket = sockets[0]!;
      socket.open();
      socket.receive(welcome);
      socket.receive(joined);
      socket.receive({ t: 'room.left', reason });
      expect(connection.state).toBe('ready');
      expect(connection.send({ t: 'command', command: { type: 'respawn' } })).toBe(false);
      vi.advanceTimersByTime(60_000);
      expect(socket.sent).toHaveLength(2);
    },
  );

  it.each(['handshake', 'entrée'] as const)(
    'borne le délai de %s et attend une nouvelle action après échec',
    (phase) => {
      const { sockets, connection, onClose } = harness();
      connection.enter(resume);
      sockets[0]!.open();
      if (phase === 'entrée') sockets[0]!.receive(welcome);
      vi.advanceTimersByTime(10_000);
      expect(connection.state).toBe('disconnected');
      expect(onClose).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60_000);
      expect(sockets).toHaveLength(1);
      connection.enter(create);
      sockets[1]!.open();
      sockets[1]!.receive(welcome);
      expect(sockets[1]!.sent.at(-1)).toEqual(create);
    },
  );

  it('annule une intention perdue avant welcome, et ne la rejoue pas lors du prochain essai', () => {
    const { sockets, connection } = harness();
    connection.enter(create);
    sockets[0]!.close();
    connection.enter(resume);
    sockets[1]!.open();
    sockets[1]!.receive(welcome);
    expect(sockets[1]!.sent).toEqual([expect.objectContaining({ t: 'hello' }), resume]);
  });
});

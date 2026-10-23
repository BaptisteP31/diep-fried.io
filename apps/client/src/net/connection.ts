import {
  PROTOCOL_VERSION,
  WS_PATH,
  decodeServerMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@diep-fried/shared';

const CLIENT_ID = `diep-fried-web/${import.meta.env.MODE}`;
const REQUEST_TIMEOUT_MS = 10_000;

export type RoomIntent = Extract<ClientMessage, { t: 'room.create' | 'room.join' }>;
export type ConnectionState =
  'disconnected' | 'connecting' | 'ready' | 'joining' | 'joined' | 'leaving';

/** URL de la WebSocket de jeu, sur la même origine que la page (proxy Vite en développement). */
export function gameSocketUrl(location: Location): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${WS_PATH}`;
}

/**
 * Une seule socket et une seule intention d'entrée à la fois. La socket ouverte n'est
 * prête qu'après welcome. Après une coupure, seule une nouvelle action utilisateur
 * reconnecte : aucune boucle de retry, ni changement implicite d'identité.
 */
export class GameConnection {
  private socket: WebSocket | null = null;
  private pending: RoomIntent | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private phase: ConnectionState = 'disconnected';

  constructor(
    private readonly url: string,
    private readonly handlers: {
      onMessage: (message: ServerMessage, rejectedIntent?: RoomIntent) => void;
      onClose: (reason: string) => void;
      onStateChange?: (state: ConnectionState, entering: boolean) => void;
    },
    private readonly createSocket: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {}

  get state(): ConnectionState {
    return this.phase;
  }

  connect(): void {
    if (this.phase !== 'disconnected') return;
    this.setState('connecting');
    this.armTimeout();
    let socket: WebSocket;
    try {
      socket = this.createSocket(this.url);
      this.socket = socket;
    } catch {
      this.disconnect('connexion impossible');
      return;
    }
    socket.addEventListener('open', () => {
      if (this.socket === socket) {
        this.write({ t: 'hello', protocol: PROTOCOL_VERSION, client: CLIENT_ID });
      }
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data !== 'string') return;
      const decoded = decodeServerMessage(event.data);
      if (decoded.ok) this.receive(decoded.message);
      else console.warn('[net] message ignoré :', decoded.error);
    });
    socket.addEventListener('close', (event) => {
      if (this.socket === socket) this.disconnect(event.reason || `code ${event.code}`);
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) this.disconnect('erreur réseau');
    });
  }

  enter(intent: RoomIntent): boolean {
    if (
      this.pending ||
      this.phase === 'joined' ||
      this.phase === 'joining' ||
      this.phase === 'leaving'
    )
      return false;
    this.pending = intent;
    if (this.phase === 'disconnected') this.connect();
    else if (this.phase === 'ready') this.flushEntry();
    else this.setState(this.phase);
    return true;
  }

  /** Les commandes de jeu ne sont jamais mises en attente ou rejouées. */
  send(message: ClientMessage): boolean {
    if (message.t === 'room.leave') return this.leave();
    if (message.t === 'ping') {
      if (this.phase !== 'ready' && this.phase !== 'joined') return false;
    } else if (this.phase !== 'joined' || !['input', 'command'].includes(message.t)) {
      return false;
    }
    return this.write(message);
  }

  /** Ferme le salon courant sans rejouer d’intention ; attend l’accusé ou le timeout. */
  leave(): boolean {
    if (this.phase !== 'joined' || !this.write({ t: 'room.leave' })) return false;
    this.setState('leaving');
    this.armTimeout();
    return true;
  }

  private receive(message: ServerMessage): void {
    let rejectedIntent: RoomIntent | undefined;
    switch (message.t) {
      case 'welcome':
        if (this.phase !== 'connecting') return;
        this.clearTimeout();
        this.setState('ready');
        this.flushEntry();
        break;
      case 'room.joined':
        if (this.phase !== 'joining') return;
        this.pending = null;
        this.clearTimeout();
        this.setState('joined');
        break;
      case 'room.left':
        this.pending = null;
        this.clearTimeout();
        this.setState('ready');
        break;
      case 'error':
        if (this.phase === 'joining') {
          rejectedIntent = this.pending ?? undefined;
          this.pending = null;
          this.clearTimeout();
          this.setState('ready');
        }
        break;
      case 'snapshot':
      case 'death':
        if (this.phase !== 'joined') return;
    }
    this.handlers.onMessage(message, rejectedIntent);
    if (message.t === 'error' && message.fatal) this.disconnect(message.message);
  }

  private flushEntry(): void {
    if (!this.pending || this.phase !== 'ready') return;
    this.setState('joining');
    this.armTimeout();
    this.write(this.pending);
  }

  private write(message: ClientMessage): boolean {
    if (this.socket?.readyState !== 1) return false;
    try {
      this.socket.send(encodeMessage(message));
      return true;
    } catch {
      this.disconnect('envoi impossible');
      return false;
    }
  }

  private setState(state: ConnectionState): void {
    this.phase = state;
    this.handlers.onStateChange?.(state, this.pending !== null);
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.timer = setTimeout(
      () => this.disconnect('délai de connexion dépassé'),
      REQUEST_TIMEOUT_MS,
    );
  }

  private clearTimeout(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private disconnect(reason: string): void {
    const socket = this.socket;
    this.socket = null;
    this.pending = null;
    this.clearTimeout();
    this.setState('disconnected');
    socket?.close();
    this.handlers.onClose(reason);
  }
}

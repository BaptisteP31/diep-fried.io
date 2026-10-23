import {
  PROTOCOL_VERSION,
  WS_PATH,
  decodeServerMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@diep-fried/shared';

const CLIENT_ID = `diep-fried-web/${import.meta.env.MODE}`;

/** URL de la WebSocket de jeu, sur la même origine que la page (proxy Vite en développement). */
export function gameSocketUrl(location: Location): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${WS_PATH}`;
}

/**
 * Connexion au serveur de jeu. Envoie `hello` à l'ouverture ; les messages reçus, y compris
 * `welcome`, sont transmis tels quels à `onMessage`.
 */
export class GameConnection {
  private readonly socket: WebSocket;

  constructor(
    url: string,
    private readonly handlers: {
      onMessage: (message: ServerMessage) => void;
      onClose: (reason: string) => void;
    },
  ) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () =>
      this.send({ t: 'hello', protocol: PROTOCOL_VERSION, client: CLIENT_ID }),
    );
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const decoded = decodeServerMessage(event.data);
      if (decoded.ok) this.handlers.onMessage(decoded.message);
      else console.warn('[net] message ignoré :', decoded.error);
    });
    this.socket.addEventListener('close', (event) =>
      this.handlers.onClose(event.reason || `code ${event.code}`),
    );
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(encodeMessage(message));
  }
}

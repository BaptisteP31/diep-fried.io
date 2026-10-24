import {
  MODE_IDS,
  MAX_PLAYERS_LIMIT,
  isModeId,
  normalizeRoomCode,
  resolveModeConfig,
  type ModeId,
  type RoomOptions,
} from '@diep-fried/shared';
import { readStored, writeStored } from '../state/storage';
import { modeDetails, parseRoomOptions } from './modes';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`élément #${id} manquant`);
  return found as T;
}

export interface MenuActions {
  create(name: string, mode: ModeId, options: RoomOptions): void;
  join(name: string, code: string, resumeToken?: string): void;
  onOpenControls(): void;
}

/** Interface DOM superposée au canvas : accueil, reprise de session, commandes. */
export class Menu {
  private readonly form = element<HTMLFormElement>('menu');
  private readonly name = element<HTMLInputElement>('menu-name');
  private readonly mode = element<HTMLSelectElement>('menu-mode');
  private readonly code = element<HTMLInputElement>('menu-code');
  private readonly status = element<HTMLParagraphElement>('menu-status');
  private readonly resumeContainer = element<HTMLDivElement>('menu-resume-container');
  private readonly resumeBtn = element<HTMLButtonElement>('menu-resume-btn');
  private readonly controlsBtn = element<HTMLButtonElement>('menu-controls-btn');
  private busy = false;

  constructor(private readonly actions: MenuActions) {
    this.name.value = readStored('diep-fried:name') ?? '';
    this.code.value = new URLSearchParams(location.search).get('room') ?? '';
    this.mode.replaceChildren(
      ...MODE_IDS.map((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = modeDetails(id).label;
        return option;
      }),
    );
    const describeMode = () => {
      element('menu-mode-rules').textContent = modeDetails(this.mode.value).rules;
    };
    this.mode.addEventListener('change', describeMode);
    describeMode();
    element<HTMLInputElement>('menu-max-players').max = String(MAX_PLAYERS_LIMIT);

    const getName = () => {
      const val = this.name.value.trim();
      writeStored('diep-fried:name', val);
      return val;
    };

    element('menu-create').addEventListener('click', () => {
      if (this.busy || !isModeId(this.mode.value)) return;
      try {
        const options = parseRoomOptions(
          element<HTMLInputElement>('menu-max-players').value,
          element<HTMLSelectElement>('menu-arena-size').value,
          element<HTMLSelectElement>('menu-shape-density').value,
        );
        const minimum = resolveModeConfig(this.mode.value).match?.minPlayers;
        if (minimum && options.maxPlayers !== undefined && options.maxPlayers < minimum) {
          throw new Error(
            `Ce mode requiert ${minimum} joueurs minimum. Augmentez la capacité du salon pour pouvoir démarrer.`,
          );
        }
        actions.create(getName(), this.mode.value, options);
      } catch (error) {
        this.setStatus((error as Error).message);
        element('menu-max-players').focus();
      }
    });

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.busy) return;
      const roomCode = normalizeRoomCode(this.code.value);
      const savedToken = roomCode
        ? (readStored(`diep-fried:resume:${roomCode}`) ?? undefined)
        : undefined;
      actions.join(getName(), roomCode, savedToken);
    });

    element('menu-join-new').addEventListener('click', () => {
      if (this.busy) return;
      const code = normalizeRoomCode(this.code.value);
      this.clearSession(code);
      actions.join(getName(), code);
    });

    element('hud-copy')?.addEventListener('click', () => {
      void navigator.clipboard?.writeText(location.href);
    });

    this.resumeBtn.addEventListener('click', () => {
      if (this.busy) return;
      const lastRoom = readStored('diep-fried:lastRoom');
      if (!lastRoom) return;
      const token = readStored(`diep-fried:resume:${lastRoom}`) ?? undefined;
      if (!token) return;
      this.code.value = lastRoom;
      actions.join(getName(), lastRoom, token);
    });

    this.controlsBtn.addEventListener('click', () => {
      actions.onOpenControls();
    });

    this.checkResumeAvailability();
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const id of ['menu-create', 'menu-join', 'menu-join-new', 'menu-resume-btn']) {
      element<HTMLButtonElement>(id).disabled = busy;
    }
  }

  showLobby(): void {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    this.form.hidden = false;
    this.checkResumeAvailability();
  }

  showRoom(code: string): void {
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
    this.form.hidden = true;
  }

  checkResumeAvailability(): void {
    const lastRoom = readStored('diep-fried:lastRoom');
    const token = lastRoom ? readStored(`diep-fried:resume:${lastRoom}`) : null;
    if (lastRoom && token) {
      this.resumeContainer.hidden = false;
      this.resumeBtn.textContent = `Reprendre la partie précédente (Salon ${lastRoom})`;
    } else {
      this.resumeContainer.hidden = true;
    }
  }

  saveSession(code: string, resumeToken: string): void {
    writeStored('diep-fried:lastRoom', code);
    writeStored(`diep-fried:resume:${code}`, resumeToken);
    this.checkResumeAvailability();
  }

  clearSession(code?: string): void {
    const room = code ?? readStored('diep-fried:lastRoom');
    if (room) {
      writeStored(`diep-fried:resume:${room}`, null);
      if (readStored('diep-fried:lastRoom') === room) writeStored('diep-fried:lastRoom', null);
    }
    this.checkResumeAvailability();
  }
}

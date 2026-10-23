import { isModeId, normalizeRoomCode, type ModeId } from '@diep-fried/shared';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`élément #${id} manquant`);
  return found as T;
}

export interface MenuActions {
  create(name: string, mode: ModeId): void;
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

  constructor(private readonly actions: MenuActions) {
    this.name.value = localStorage.getItem('diep-fried:name') ?? '';
    this.code.value = new URLSearchParams(location.search).get('room') ?? '';

    const getName = () => {
      const val = this.name.value.trim();
      localStorage.setItem('diep-fried:name', val);
      return val;
    };

    element('menu-create').addEventListener('click', () => {
      if (isModeId(this.mode.value)) actions.create(getName(), this.mode.value);
    });

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const roomCode = normalizeRoomCode(this.code.value);
      const savedToken = roomCode
        ? (localStorage.getItem(`diep-fried:resume:${roomCode}`) ?? undefined)
        : undefined;
      actions.join(getName(), roomCode, savedToken);
    });

    element('hud-copy')?.addEventListener('click', () => {
      void navigator.clipboard?.writeText(location.href);
    });

    this.resumeBtn.addEventListener('click', () => {
      const lastRoom = localStorage.getItem('diep-fried:lastRoom');
      if (!lastRoom) return;
      const token = localStorage.getItem(`diep-fried:resume:${lastRoom}`) ?? undefined;
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

  showLobby(): void {
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
    const lastRoom = localStorage.getItem('diep-fried:lastRoom');
    const token = lastRoom ? localStorage.getItem(`diep-fried:resume:${lastRoom}`) : null;
    if (lastRoom && token) {
      this.resumeContainer.hidden = false;
      this.resumeBtn.textContent = `Reprendre la partie précédente (Salon ${lastRoom})`;
    } else {
      this.resumeContainer.hidden = true;
    }
  }

  saveSession(code: string, resumeToken: string): void {
    try {
      localStorage.setItem('diep-fried:lastRoom', code);
      localStorage.setItem(`diep-fried:resume:${code}`, resumeToken);
      this.checkResumeAvailability();
    } catch (err) {
      console.warn('[menu] impossible de sauvegarder la session :', err);
    }
  }

  clearSession(code?: string): void {
    try {
      if (code) {
        localStorage.removeItem(`diep-fried:resume:${code}`);
        if (localStorage.getItem('diep-fried:lastRoom') === code) {
          localStorage.removeItem('diep-fried:lastRoom');
        }
      } else {
        const lastRoom = localStorage.getItem('diep-fried:lastRoom');
        if (lastRoom) localStorage.removeItem(`diep-fried:resume:${lastRoom}`);
        localStorage.removeItem('diep-fried:lastRoom');
      }
      this.checkResumeAvailability();
    } catch {
      // ignorer
    }
  }
}

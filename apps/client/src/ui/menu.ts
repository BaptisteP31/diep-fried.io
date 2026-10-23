import { isModeId, normalizeRoomCode, type ModeId } from '@diep-fried/shared';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`élément #${id} manquant`);
  return found as T;
}

export interface MenuActions {
  create(name: string, mode: ModeId): void;
  join(name: string, code: string): void;
  respawn(): void;
}

/** Interface DOM superposée au canvas : accueil, bandeau de salon, écran de mort. */
export class Menu {
  private readonly form = element<HTMLFormElement>('menu');
  private readonly name = element<HTMLInputElement>('menu-name');
  private readonly mode = element<HTMLSelectElement>('menu-mode');
  private readonly code = element<HTMLInputElement>('menu-code');
  private readonly status = element<HTMLParagraphElement>('menu-status');
  private readonly hud = element<HTMLDivElement>('hud');
  private readonly hudRoom = element<HTMLSpanElement>('hud-room');
  private readonly hudStatus = element<HTMLSpanElement>('hud-status');
  private readonly death = element<HTMLDivElement>('death');
  private readonly deathText = element<HTMLParagraphElement>('death-text');

  constructor(actions: MenuActions) {
    this.name.value = localStorage.getItem('diep-fried:name') ?? '';
    this.code.value = new URLSearchParams(location.search).get('room') ?? '';
    const name = () => {
      localStorage.setItem('diep-fried:name', this.name.value);
      return this.name.value;
    };
    element('menu-create').addEventListener('click', () => {
      if (isModeId(this.mode.value)) actions.create(name(), this.mode.value);
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      actions.join(name(), normalizeRoomCode(this.code.value));
    });
    element('hud-copy').addEventListener('click', () => {
      void navigator.clipboard?.writeText(location.href);
    });
    element('death-respawn').addEventListener('click', () => actions.respawn());
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  showLobby(): void {
    this.form.hidden = false;
    this.hud.hidden = true;
    this.death.hidden = true;
  }

  showRoom(code: string): void {
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
    this.form.hidden = true;
    this.hud.hidden = false;
    this.hudRoom.textContent = `Salon ${code}`;
  }

  setHudStatus(text: string): void {
    this.hudStatus.textContent = text;
  }

  showDeath(text: string | null): void {
    this.death.hidden = text === null;
    this.deathText.textContent = text ?? '';
  }
}

import {
  ACTION_DESCRIPTIONS,
  formatKeyCode,
  loadBindings,
  resetBindings,
  saveBindings,
  type KeyAction,
  type KeyBindings,
} from '../input/bindings';
import { STAT_IDS } from '@diep-fried/shared';
import { SANDBOX_ACTIONS } from '../input/sandbox';

export interface ControlsModalCallbacks {
  onBindingsChanged(bindings: KeyBindings): void;
  onVisibilityChanged?(visible: boolean): void;
}

/**
 * Modal de configuration des commandes du clavier (persistance localStorage,
 * disposition physique AZERTY par défaut).
 */
export class ControlsModal {
  private readonly modal: HTMLElement;
  private readonly list: HTMLElement;
  private readonly closeBtn: HTMLElement;
  private readonly resetBtn: HTMLElement;
  private bindings: KeyBindings;
  private listeningAction: KeyAction | null = null;
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly callbacks: ControlsModalCallbacks) {
    this.modal = document.getElementById('controls-modal')!;
    this.list = document.getElementById('controls-list')!;
    this.closeBtn = document.getElementById('controls-close')!;
    this.resetBtn = document.getElementById('controls-reset')!;

    this.bindings = loadBindings();

    this.closeBtn.addEventListener('click', () => this.hide());
    this.resetBtn.addEventListener('click', () => {
      this.bindings = resetBindings();
      this.callbacks.onBindingsChanged(this.bindings);
      this.renderList();
    });

    window.addEventListener('keydown', (e) => this.onWindowKeyDown(e), true);
  }

  show(): void {
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.bindings = loadBindings();
    this.listeningAction = null;
    this.renderList();
    this.modal.hidden = false;
    this.callbacks.onVisibilityChanged?.(true);
    this.closeBtn.focus();
  }

  hide(): void {
    this.listeningAction = null;
    this.modal.hidden = true;
    this.callbacks.onVisibilityChanged?.(false);
    this.previousFocus?.focus();
  }

  get isVisible(): boolean {
    return !this.modal.hidden;
  }

  private onWindowKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible) return;

    // La capture empêche aussi les raccourcis de réapparition de recevoir Entrée/Espace.
    e.stopImmediatePropagation();

    if (e.key === 'Tab') {
      e.preventDefault();
      const buttons = [
        ...this.modal.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
        ),
      ];
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const next = (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.listeningAction) {
        this.listeningAction = null;
        this.renderList();
      } else {
        this.hide();
      }
      return;
    }

    if (!this.listeningAction) return;

    e.preventDefault();
    e.stopPropagation();

    const code = e.code;
    const action = this.listeningAction;

    // Retirer l'action de son ancienne touche si nécessaire
    const updated: KeyBindings = { ...this.bindings };
    for (const [k, a] of Object.entries(updated)) {
      if (actionsEqual(a, action)) {
        delete updated[k];
      }
    }

    // Assigner la nouvelle touche
    updated[code] = action;

    this.bindings = updated;
    saveBindings(this.bindings);
    this.callbacks.onBindingsChanged(this.bindings);

    this.listeningAction = null;
    this.renderList();
  }

  private renderList(): void {
    this.list.innerHTML = '';

    // Liste des actions à présenter
    const actions: Array<{ label: string; action: KeyAction }> = [
      { label: ACTION_DESCRIPTIONS.up ?? 'Avancer', action: { kind: 'held', action: 'up' } },
      { label: ACTION_DESCRIPTIONS.down ?? 'Reculer', action: { kind: 'held', action: 'down' } },
      { label: ACTION_DESCRIPTIONS.left ?? 'Gauche', action: { kind: 'held', action: 'left' } },
      { label: ACTION_DESCRIPTIONS.right ?? 'Droite', action: { kind: 'held', action: 'right' } },
      { label: ACTION_DESCRIPTIONS.fire ?? 'Tirer', action: { kind: 'held', action: 'fire' } },
      { label: ACTION_DESCRIPTIONS.alt ?? 'Secondaire', action: { kind: 'held', action: 'alt' } },
      {
        label: ACTION_DESCRIPTIONS.autoFire ?? 'Tir auto',
        action: { kind: 'toggle', action: 'autoFire' },
      },
      {
        label: ACTION_DESCRIPTIONS.autoSpin ?? 'Rotation auto',
        action: { kind: 'toggle', action: 'autoSpin' },
      },
      { label: 'Arbre d’évolution', action: { kind: 'toggle', action: 'upgradeTree' } },
      {
        label: 'Piloter / rendre un objectif allié proche',
        action: { kind: 'toggle', action: 'possess' },
      },
      ...SANDBOX_ACTIONS.map(({ action, label }) => ({
        label: `Bac à sable : ${label}`,
        action: { kind: 'sandbox', action } as KeyAction,
      })),
      ...STAT_IDS.map((stat) => ({
        label: ACTION_DESCRIPTIONS[stat] ?? stat,
        action: { kind: 'stat', stat } as KeyAction,
      })),
    ];

    for (const item of actions) {
      const row = document.createElement('div');
      row.className = 'controls-row';

      const label = document.createElement('span');
      label.className = 'controls-action-name';
      label.textContent = item.label;

      const keyBtn = document.createElement('button');
      keyBtn.type = 'button';
      keyBtn.className = 'controls-key-btn';

      const isCurrentListening =
        this.listeningAction !== null && actionsEqual(this.listeningAction, item.action);

      if (isCurrentListening) {
        keyBtn.textContent = 'Appuyez sur une touche...';
        keyBtn.classList.add('listening');
      } else {
        const assignedCodes = Object.entries(this.bindings)
          .filter(([_, a]) => actionsEqual(a, item.action))
          .map(([code]) => formatKeyCode(code));
        keyBtn.textContent = assignedCodes.length > 0 ? assignedCodes.join(', ') : 'Aucune';
      }

      keyBtn.addEventListener('click', () => {
        this.listeningAction = item.action;
        this.renderList();
      });

      row.appendChild(label);
      row.appendChild(keyBtn);
      this.list.appendChild(row);
      if (isCurrentListening) keyBtn.focus();
    }
  }
}

function actionsEqual(a: KeyAction, b: KeyAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'held' && b.kind === 'held') return a.action === b.action;
  if (a.kind === 'toggle' && b.kind === 'toggle') return a.action === b.action;
  if (a.kind === 'stat' && b.kind === 'stat') return a.stat === b.stat;
  if (a.kind === 'sandbox' && b.kind === 'sandbox') return a.action === b.action;
  return false;
}

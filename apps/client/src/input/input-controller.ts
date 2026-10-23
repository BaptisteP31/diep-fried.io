import type { PlayerInput, StatId, Vec2 } from '@diep-fried/shared';
import {
  DEFAULT_BINDINGS,
  loadBindings,
  moveIntent,
  type HeldAction,
  type KeyBindings,
} from './bindings';

/** Vitesse de rotation de la visée automatique, en radians par seconde (choix d'ergonomie). */
const AUTO_SPIN_SPEED = Math.PI / 2;
const AUTO_SPIN_RADIUS = 300;

export interface InputControllerOptions {
  onStat?: (stat: StatId) => void;
  onToggle?: (action: 'autoFire' | 'autoSpin', enabled: boolean) => void;
  bindings?: KeyBindings;
}

/**
 * Collecte clavier et souris et produit des intentions `PlayerInput` séquencées.
 * Les bascules (tir et rotation automatiques) sont résolues ici, côté client.
 */
export class InputController {
  private readonly held = new Set<HeldAction>();
  private readonly mouse = { x: 0, y: 0, primary: false, secondary: false };
  private autoFire = false;
  private autoSpin = false;
  private spinAngle = 0;
  private seq = 0;
  private bindings: KeyBindings;
  private readonly onStat: (stat: StatId) => void;
  private readonly onToggle:
    ((action: 'autoFire' | 'autoSpin', enabled: boolean) => void) | undefined;

  constructor(
    target: HTMLElement,
    onStatOrOptions: ((stat: StatId) => void) | InputControllerOptions,
    bindingsArg?: KeyBindings,
  ) {
    if (typeof onStatOrOptions === 'function') {
      this.onStat = onStatOrOptions;
      this.onToggle = undefined;
      this.bindings = bindingsArg ?? loadBindings();
    } else {
      this.onStat = onStatOrOptions.onStat ?? (() => {});
      this.onToggle = onStatOrOptions.onToggle;
      this.bindings = onStatOrOptions.bindings ?? bindingsArg ?? loadBindings();
    }

    window.addEventListener('keydown', (event) => this.onKey(event, true));
    window.addEventListener('keyup', (event) => this.onKey(event, false));
    window.addEventListener('blur', () => this.held.clear());
    target.addEventListener('mousemove', (event) => {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    });
    target.addEventListener('mousedown', (event) => this.onButton(event.button, true));
    window.addEventListener('mouseup', (event) => this.onButton(event.button, false));
    target.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  setBindings(newBindings: KeyBindings): void {
    this.bindings = { ...newBindings };
  }

  getBindings(): KeyBindings {
    return { ...this.bindings };
  }

  get isAutoFire(): boolean {
    return this.autoFire;
  }

  get isAutoSpin(): boolean {
    return this.autoSpin;
  }

  toggleAutoFire(): boolean {
    this.autoFire = !this.autoFire;
    this.onToggle?.('autoFire', this.autoFire);
    return this.autoFire;
  }

  toggleAutoSpin(): boolean {
    this.autoSpin = !this.autoSpin;
    this.onToggle?.('autoSpin', this.autoSpin);
    return this.autoSpin;
  }

  /**
   * Intention courante. `tankScreen` est la position écran du tank piloté et `scale` le
   * nombre de pixels CSS par unité monde.
   */
  sample(tankScreen: Vec2, scale: number, dtSeconds: number): PlayerInput {
    let aim = {
      x: (this.mouse.x - tankScreen.x) / scale,
      y: (this.mouse.y - tankScreen.y) / scale,
    };
    if (this.autoSpin) {
      this.spinAngle = (this.spinAngle + AUTO_SPIN_SPEED * dtSeconds) % (2 * Math.PI);
      aim = {
        x: Math.cos(this.spinAngle) * AUTO_SPIN_RADIUS,
        y: Math.sin(this.spinAngle) * AUTO_SPIN_RADIUS,
      };
    }
    return {
      seq: ++this.seq,
      move: moveIntent(this.held),
      aim,
      fire: this.autoFire || this.mouse.primary || this.held.has('fire'),
      alt: this.mouse.secondary || this.held.has('alt'),
    };
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }
    const action = this.bindings[event.code];
    if (!action) return;
    event.preventDefault();
    if (action.kind === 'held') {
      if (down) this.held.add(action.action);
      else this.held.delete(action.action);
      return;
    }
    if (!down || event.repeat) return;
    if (action.kind === 'stat') {
      this.onStat(action.stat);
    } else if (action.action === 'autoFire') {
      this.toggleAutoFire();
    } else if (action.action === 'autoSpin') {
      this.toggleAutoSpin();
    }
    // `upgradeTree` : réservé à l'interface de l'arbre d'évolution.
  }

  private onButton(button: number, down: boolean): void {
    if (button === 0) this.mouse.primary = down;
    if (button === 2) this.mouse.secondary = down;
  }
}

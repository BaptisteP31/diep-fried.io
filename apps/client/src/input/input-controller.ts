import type { PlayerInput, StatId, Vec2 } from '@diep-fried/shared';
import { loadBindings, moveIntent, type HeldAction, type KeyBindings } from './bindings';

/** Vitesse de rotation de la visée automatique, en radians par seconde (choix d'ergonomie). */
const AUTO_SPIN_SPEED = Math.PI / 2;
const AUTO_SPIN_RADIUS = 300;

export interface InputControllerOptions {
  onStat?: (stat: StatId) => void;
  onToggle?: (action: 'autoFire' | 'autoSpin', enabled: boolean) => void;
  onUpgradeTree?: (open: boolean) => void;
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
  private enabled = true;
  private bindings: KeyBindings;
  private readonly onStat: (stat: StatId) => void;
  private readonly onToggle:
    ((action: 'autoFire' | 'autoSpin', enabled: boolean) => void) | undefined;
  private readonly onUpgradeTree: ((open: boolean) => void) | undefined;

  constructor(
    target: HTMLElement,
    onStatOrOptions: ((stat: StatId) => void) | InputControllerOptions,
    bindingsArg?: KeyBindings,
  ) {
    if (typeof onStatOrOptions === 'function') {
      this.onStat = onStatOrOptions;
      this.onToggle = undefined;
      this.onUpgradeTree = undefined;
      this.bindings = bindingsArg ?? loadBindings();
    } else {
      this.onStat = onStatOrOptions.onStat ?? (() => {});
      this.onToggle = onStatOrOptions.onToggle;
      this.onUpgradeTree = onStatOrOptions.onUpgradeTree;
      this.bindings = onStatOrOptions.bindings ?? bindingsArg ?? loadBindings();
    }

    window.addEventListener('keydown', (event) => this.onKey(event, true));
    window.addEventListener('keyup', (event) => this.onKey(event, false));
    window.addEventListener('blur', () => this.reset(false));
    target.addEventListener('mousemove', (event) => {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    });
    target.addEventListener('mousedown', (event) => this.onButton(event.button, true));
    window.addEventListener('mouseup', (event) => this.onButton(event.button, false));
    target.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  setBindings(newBindings: KeyBindings): void {
    this.reset(false);
    this.bindings = { ...newBindings };
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.reset(false);
  }

  reset(resetSequence = true): void {
    this.held.clear();
    this.mouse.primary = false;
    this.mouse.secondary = false;
    this.autoFire = false;
    this.autoSpin = false;
    this.spinAngle = 0;
    if (resetSequence) this.seq = 0;
    this.onToggle?.('autoFire', false);
    this.onToggle?.('autoSpin', false);
    this.onUpgradeTree?.(false);
  }

  acknowledgeSequence(seq: number): void {
    this.seq = Math.max(this.seq, seq);
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
    if (!this.enabled) return false;
    this.autoFire = !this.autoFire;
    this.onToggle?.('autoFire', this.autoFire);
    return this.autoFire;
  }

  toggleAutoSpin(): boolean {
    if (!this.enabled) return false;
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
      move: this.enabled ? moveIntent(this.held) : { x: 0, y: 0 },
      aim,
      fire: this.enabled && (this.autoFire || this.mouse.primary || this.held.has('fire')),
      alt: this.enabled && (this.mouse.secondary || this.held.has('alt')),
    };
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    // Une touche relâchée reste relâchée même si le focus a changé entre-temps.
    const action = this.bindings[event.code];
    if (!down && action?.kind === 'held') this.held.delete(action.action);
    if (!this.enabled || event.defaultPrevented) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.closest('button, [role="dialog"]')))
    ) {
      return;
    }
    if (!action) return;
    event.preventDefault();

    if (action.kind === 'toggle' && action.action === 'upgradeTree') {
      if (down) {
        if (!event.repeat) this.onUpgradeTree?.(true);
      } else {
        this.onUpgradeTree?.(false);
      }
      return;
    }

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
  }

  private onButton(button: number, down: boolean): void {
    if (down && !this.enabled) return;
    if (button === 0) this.mouse.primary = down;
    if (button === 2) this.mouse.secondary = down;
  }
}

import { STAT_IDS, type StatId, type Vec2 } from '@diep-fried/shared';

/**
 * Actions du clavier, associées par `KeyboardEvent.code` (position physique de la touche).
 * Ainsi WASD correspond à ZQSD sur un clavier AZERTY sans configuration.
 */
export type HeldAction = 'up' | 'down' | 'left' | 'right' | 'fire' | 'alt';
export type ToggleAction = 'autoFire' | 'autoSpin' | 'upgradeTree';
export type KeyAction =
  | { kind: 'held'; action: HeldAction }
  | { kind: 'toggle'; action: ToggleAction }
  | { kind: 'stat'; stat: StatId };

export type KeyBindings = Readonly<Record<string, KeyAction>>;

const held = (action: HeldAction): KeyAction => ({ kind: 'held', action });
const toggle = (action: ToggleAction): KeyAction => ({ kind: 'toggle', action });

export const DEFAULT_BINDINGS: KeyBindings = {
  KeyW: held('up'),
  ArrowUp: held('up'),
  KeyS: held('down'),
  ArrowDown: held('down'),
  KeyA: held('left'),
  ArrowLeft: held('left'),
  KeyD: held('right'),
  ArrowRight: held('right'),
  Space: held('fire'),
  ShiftLeft: held('alt'),
  ShiftRight: held('alt'),
  KeyE: toggle('autoFire'),
  KeyC: toggle('autoSpin'),
  KeyY: toggle('upgradeTree'),
  ...Object.fromEntries(
    STAT_IDS.map((stat, index) => [`Digit${index + 1}`, { kind: 'stat', stat } as KeyAction]),
  ),
};

/** Direction de déplacement unitaire (ou nulle) à partir des actions maintenues. */
export function moveIntent(heldActions: ReadonlySet<HeldAction>): Vec2 {
  const x = Number(heldActions.has('right')) - Number(heldActions.has('left'));
  const y = Number(heldActions.has('down')) - Number(heldActions.has('up'));
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

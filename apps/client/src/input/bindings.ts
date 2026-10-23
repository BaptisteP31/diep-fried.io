import { STAT_IDS, type StatId, type Vec2 } from '@diep-fried/shared';
import type { SandboxAction } from './sandbox';

/**
 * Actions du clavier, associées par `KeyboardEvent.code` (position physique de la touche).
 * Ainsi WASD correspond à ZQSD sur un clavier AZERTY sans configuration.
 */
export type HeldAction = 'up' | 'down' | 'left' | 'right' | 'fire' | 'alt';
export type ToggleAction = 'autoFire' | 'autoSpin' | 'upgradeTree';
export type KeyAction =
  | { kind: 'held'; action: HeldAction }
  | { kind: 'toggle'; action: ToggleAction }
  | { kind: 'sandbox'; action: SandboxAction }
  | { kind: 'stat'; stat: StatId };

export type KeyBindings = Record<string, KeyAction>;

const held = (action: HeldAction): KeyAction => ({ kind: 'held', action });
const toggle = (action: ToggleAction): KeyAction => ({ kind: 'toggle', action });

export const DEFAULT_BINDINGS: Readonly<Record<string, KeyAction>> = {
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
  KeyK: { kind: 'sandbox', action: 'levelUp' },
  Backslash: { kind: 'sandbox', action: 'cycleClass' },
  KeyO: { kind: 'sandbox', action: 'selfDestruct' },
  Semicolon: { kind: 'sandbox', action: 'toggleGod' },
  ...Object.fromEntries(
    STAT_IDS.map((stat, index) => [`Digit${index + 1}`, { kind: 'stat', stat } as KeyAction]),
  ),
};

export const BINDINGS_STORAGE_KEY = 'diep-fried:bindings';

/** Noms français lisibles pour les actions configurables. */
export const ACTION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  up: 'Avancer (Haut)',
  down: 'Reculer (Bas)',
  left: 'Aller à gauche',
  right: 'Aller à droite',
  fire: 'Tirer',
  alt: 'Action secondaire (repousser drones)',
  autoFire: 'Tir automatique [E]',
  autoSpin: 'Rotation automatique [C]',
  upgradeTree: "Arbre d'évolution [Y]",
  healthRegen: '1 - Régénération de santé',
  maxHealth: '2 - Santé max',
  bodyDamage: '3 - Dégâts de corps',
  bulletSpeed: '4 - Vitesse des tirs',
  bulletPenetration: '5 - Pénétration des tirs',
  bulletDamage: '6 - Dégâts des tirs',
  reload: '7 - Rechargement',
  movementSpeed: '8 - Vitesse de déplacement',
};

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      (globalThis as { localStorage?: Storage }).localStorage
    ) {
      return (globalThis as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Navigateur en mode privé strict ou sans accès
  }
  return null;
}

/** Direction de déplacement unitaire (ou nulle) à partir des actions maintenues. */
export function moveIntent(heldActions: ReadonlySet<HeldAction>): Vec2 {
  const x = Number(heldActions.has('right')) - Number(heldActions.has('left'));
  const y = Number(heldActions.has('down')) - Number(heldActions.has('up'));
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/**
 * Charge les touches depuis le localStorage, ou renvoie les raccourcis par défaut.
 */
export function loadBindings(storageOverride?: Storage): KeyBindings {
  try {
    const storage = storageOverride ?? getStorage();
    if (!storage) return { ...DEFAULT_BINDINGS };
    const raw = storage.getItem(BINDINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return { ...DEFAULT_BINDINGS };
    if (!Object.values(parsed).every(isKeyAction)) return { ...DEFAULT_BINDINGS };
    // saveBindings stocke la configuration complète, y compris les touches retirées.
    return parsed as KeyBindings;
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

function isKeyAction(value: unknown): value is KeyAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  if (action.kind === 'held')
    return ['up', 'down', 'left', 'right', 'fire', 'alt'].includes(String(action.action));
  if (action.kind === 'toggle')
    return ['autoFire', 'autoSpin', 'upgradeTree'].includes(String(action.action));
  if (action.kind === 'sandbox')
    return ['levelUp', 'cycleClass', 'selfDestruct', 'toggleGod'].includes(String(action.action));
  return action.kind === 'stat' && STAT_IDS.includes(action.stat as StatId);
}

/**
 * Enregistre les raccourcis dans le localStorage.
 */
export function saveBindings(bindings: KeyBindings, storageOverride?: Storage): void {
  try {
    const storage = storageOverride ?? getStorage();
    if (!storage) return;
    storage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
  } catch (err) {
    console.warn('[input] impossible de sauvegarder les touches :', err);
  }
}

/**
 * Réinitialise les raccourcis aux valeurs par défaut.
 */
export function resetBindings(storageOverride?: Storage): KeyBindings {
  try {
    const storage = storageOverride ?? getStorage();
    if (storage) storage.removeItem(BINDINGS_STORAGE_KEY);
  } catch {
    // ignorer
  }
  return { ...DEFAULT_BINDINGS };
}

/**
 * Traduit un `KeyboardEvent.code` en nom de touche plus familier en français.
 */
export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) {
    const letter = code.slice(3);
    // Indications pour les touches AZERTY vs QWERTY courantes
    if (letter === 'W') return 'Z / W';
    if (letter === 'A') return 'Q / A';
    return letter;
  }
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Backslash':
      return '\\ (position physique)';
    case 'Semicolon':
      return '; (position physique)';
    case 'Space':
      return 'Espace';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ShiftLeft':
      return 'Maj Gauche';
    case 'ShiftRight':
      return 'Maj Droite';
    case 'ControlLeft':
      return 'Ctrl Gauche';
    case 'ControlRight':
      return 'Ctrl Droite';
    default:
      return code;
  }
}

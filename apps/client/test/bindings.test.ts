import { beforeEach, describe, expect, it } from 'vitest';
import { STAT_IDS } from '@diep-fried/shared';
import {
  BINDINGS_STORAGE_KEY,
  DEFAULT_BINDINGS,
  formatKeyCode,
  loadBindings,
  moveIntent,
  resetBindings,
  saveBindings,
  type HeldAction,
  type KeyBindings,
} from '../src/input/bindings';

describe('moveIntent', () => {
  const intent = (...actions: HeldAction[]) => moveIntent(new Set(actions));

  it('normalise les diagonales', () => {
    const { x, y } = intent('up', 'right');
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
  });

  it('annule les directions opposées', () => {
    expect(intent('left', 'right')).toEqual({ x: 0, y: 0 });
    expect(intent()).toEqual({ x: 0, y: 0 });
  });
});

describe('DEFAULT_BINDINGS', () => {
  it('associe les chiffres 1 à 8 aux statistiques dans l’ordre du contrat', () => {
    STAT_IDS.forEach((stat, index) => {
      expect(DEFAULT_BINDINGS[`Digit${index + 1}`]).toEqual({ kind: 'stat', stat });
    });
  });

  it('utilise des codes physiques, donc ZQSD en AZERTY', () => {
    // Sur AZERTY, la touche Z produit event.code === 'KeyW', Q => 'KeyA'.
    expect(DEFAULT_BINDINGS.KeyW).toEqual({ kind: 'held', action: 'up' });
    expect(DEFAULT_BINDINGS.KeyA).toEqual({ kind: 'held', action: 'left' });
  });

  it('définit les raccourcis de tir et rotation automatiques sur E et C', () => {
    expect(DEFAULT_BINDINGS.KeyE).toEqual({ kind: 'toggle', action: 'autoFire' });
    expect(DEFAULT_BINDINGS.KeyC).toEqual({ kind: 'toggle', action: 'autoSpin' });
  });
});

describe('configuration et persistance des touches', () => {
  let mockStorage: Storage;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };
  });

  it('charge les raccourcis par défaut si rien n’est stocké', () => {
    const bindings = loadBindings(mockStorage);
    expect(bindings.KeyW).toEqual({ kind: 'held', action: 'up' });
    expect(bindings.KeyE).toEqual({ kind: 'toggle', action: 'autoFire' });
  });

  it('sauvegarde et recharge les modifications de l’utilisateur', () => {
    const custom: KeyBindings = {
      ...DEFAULT_BINDINGS,
      KeyT: { kind: 'toggle', action: 'autoFire' },
    };
    saveBindings(custom, mockStorage);

    const reloaded = loadBindings(mockStorage);
    expect(reloaded.KeyT).toEqual({ kind: 'toggle', action: 'autoFire' });
  });

  it('réinitialise les raccourcis aux valeurs par défaut', () => {
    mockStorage.setItem(
      BINDINGS_STORAGE_KEY,
      JSON.stringify({ KeyX: { kind: 'held', action: 'fire' } }),
    );
    const restored = resetBindings(mockStorage);
    expect(restored.KeyW).toEqual({ kind: 'held', action: 'up' });
    expect(mockStorage.getItem(BINDINGS_STORAGE_KEY)).toBeNull();
  });

  it('ne restaure pas une ancienne touche après un rebind puis rechargement', () => {
    const custom: KeyBindings = {
      ...DEFAULT_BINDINGS,
      KeyT: { kind: 'toggle', action: 'autoFire' },
    };
    delete custom.KeyE;
    saveBindings(custom, mockStorage);
    expect(loadBindings(mockStorage).KeyE).toBeUndefined();
    expect(loadBindings(mockStorage).KeyT).toEqual({ kind: 'toggle', action: 'autoFire' });
  });

  it('ignore une configuration corrompue au lieu de faire planter les entrées', () => {
    mockStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify({ KeyW: null }));
    expect(loadBindings(mockStorage)).toEqual(DEFAULT_BINDINGS);
  });

  it('formate les codes de touches pour l’affichage en français', () => {
    expect(formatKeyCode('KeyW')).toBe('Z / W');
    expect(formatKeyCode('KeyA')).toBe('Q / A');
    expect(formatKeyCode('Space')).toBe('Espace');
    expect(formatKeyCode('ArrowUp')).toBe('↑');
    expect(formatKeyCode('Digit1')).toBe('1');
  });
});

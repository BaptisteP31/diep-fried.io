import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveModeConfig } from '@diep-fried/shared';
import { SandboxCommands, type SandboxAction } from '../src/input/sandbox';
import { InputController } from '../src/input/input-controller';
import {
  DEFAULT_BINDINGS,
  loadBindings,
  saveBindings,
  type KeyBindings,
} from '../src/input/bindings';
import { installDom } from './helpers/dom';

let dom: ReturnType<typeof installDom>;
beforeEach(() => {
  dom = installDom();
});
afterEach(() => vi.unstubAllGlobals());

describe('commandes Sandbox', () => {
  it('refuse hors mode, sans autorisation, mort et pendant une modale', () => {
    let config = resolveModeConfig('ffa');
    let alive = true;
    let blocked = false;
    const send = vi.fn();
    const commands = new SandboxCommands(() => ({ config, alive, blocked }), send);
    const actions: SandboxAction[] = ['levelUp', 'cycleClass', 'selfDestruct', 'toggleGod'];
    actions.forEach((action) => commands.run(action));
    config = resolveModeConfig('sandbox');
    config.sandbox.cheats = false;
    actions.forEach((action) => commands.run(action));
    config.sandbox.cheats = true;
    alive = false;
    actions.forEach((action) => commands.run(action));
    alive = true;
    blocked = true;
    actions.forEach((action) => commands.run(action));
    expect(send).not.toHaveBeenCalled();
    blocked = false;
    actions.forEach((action) => commands.run(action));
    expect(send.mock.calls.map(([command]) => command.action)).toEqual(actions);
  });

  it('borne la répétition de K sans file d’attente et réinitialise la limite au changement de salon', () => {
    let now = 0;
    const send = vi.fn();
    const commands = new SandboxCommands(
      () => ({ config: resolveModeConfig('sandbox'), alive: true, blocked: false }),
      send,
      () => now,
    );
    for (now = 0; now < 1000; now++) commands.run('levelUp');
    expect(send).toHaveBeenCalledTimes(8);
    commands.reset();
    commands.run('levelUp');
    expect(send).toHaveBeenCalledTimes(9);
  });

  it('utilise les codes contractuels, ne répète que levelUp, et neutralise saisies/modales', () => {
    const onSandbox = vi.fn();
    let blocked = false;
    const input = new InputController(dom.el('game') as unknown as HTMLElement, {
      onSandbox,
      isBlocked: () => blocked,
    });
    const key = (code: string, repeat = false, target: EventTarget = dom.win) => {
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      Object.assign(event, { code, repeat });
      dom.win.dispatchEvent(event);
    };
    for (const code of ['KeyK', 'Backslash', 'KeyO', 'Semicolon']) {
      key(code);
      key(code, true);
    }
    expect(onSandbox.mock.calls.map(([action]) => action)).toEqual([
      'levelUp',
      'levelUp',
      'cycleClass',
      'selfDestruct',
      'toggleGod',
    ]);
    onSandbox.mockClear();
    key('KeyK', false, dom.el('menu-name'));
    const dialog = dom.el('controls-modal');
    key('KeyO', false, dialog);
    blocked = true;
    key('Backslash');
    input.setEnabled(false);
    blocked = false;
    key('Semicolon');
    expect(onSandbox).not.toHaveBeenCalled();
  });

  it('conserve les raccourcis Sandbox personnalisés après rechargement', () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    };
    const bindings: KeyBindings = {
      ...DEFAULT_BINDINGS,
      KeyL: { kind: 'sandbox', action: 'levelUp' },
    };
    delete bindings.KeyK;
    saveBindings(bindings, storage);
    expect(loadBindings(storage).KeyK).toBeUndefined();
    expect(loadBindings(storage).KeyL).toEqual({ kind: 'sandbox', action: 'levelUp' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStatLevels, type SelfState } from '@diep-fried/shared';
import { DeathScreen } from '../src/ui/death-screen';
import { InputController } from '../src/input/input-controller';
import { Menu } from '../src/ui/menu';
import { readStored } from '../src/state/storage';

/** Petit DOM pour tester les comportements, sans ajouter de dépendance navigateur. */
class Element extends EventTarget {
  hidden = true;
  disabled = false;
  textContent = '';
  value = '';
  isContentEditable = false;
  closest(): null {
    return null;
  }
}
class TextInput extends Element {}
let elements: Map<string, Element>;
let win: EventTarget;

function el(id: string): Element {
  if (!elements.has(id)) elements.set(id, new Element());
  return elements.get(id)!;
}

function key(type: string, code: string, target: EventTarget = win): void {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat: false });
  target.dispatchEvent(event);
}

function self(overrides: Partial<SelfState> = {}): SelfState {
  return {
    playerId: 1,
    entityId: null,
    alive: false,
    classId: 'tank',
    level: 12,
    score: 1234,
    levelProgress: 0,
    statPoints: 0,
    stats: emptyStatLevels(),
    statCaps: emptyStatLevels(),
    classChoices: [],
    view: 900,
    respawnTick: 120,
    ...overrides,
  };
}

beforeEach(() => {
  elements = new Map();
  win = new EventTarget();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { getElementById: el });
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('HTMLInputElement', TextInput);
  vi.stubGlobal('HTMLTextAreaElement', TextInput);
  vi.stubGlobal('HTMLSelectElement', TextInput);
  vi.stubGlobal('location', { search: '' });
});
afterEach(() => vi.unstubAllGlobals());

describe('mort pendant une déconnexion', () => {
  it('affiche le résumé autoritaire self et permet respawn sans événement death', () => {
    const respawn = vi.fn();
    const screen = new DeathScreen({ onRespawn: respawn });
    screen.syncSelf(self(), 90, 30);
    expect(screen.isVisible).toBe(true);
    expect(el('death-killer').textContent).toBe('Responsable inconnu');
    expect(el('death-stats').textContent).toContain('Niveau 12');
    expect(el('death-stats').textContent).toContain('État actuel');
    expect(el('death-respawn').disabled).toBe(true);
    key('keydown', 'Enter');
    expect(respawn).not.toHaveBeenCalled();
    screen.syncSelf(self(), 120, 30);
    expect(el('death-respawn').disabled).toBe(false);
    key('keydown', 'Enter');
    expect(respawn).toHaveBeenCalledTimes(1);
    screen.syncSelf(self({ alive: true }), 121, 30);
    expect(screen.isVisible).toBe(false);
    key('keydown', 'Enter');
    expect(respawn).toHaveBeenCalledTimes(1);
  });

  it('ne fabrique pas de délai de respawn si self ne le fournit pas, et purge la mort précédente', () => {
    const screen = new DeathScreen({ onRespawn: vi.fn() });
    screen.show({ ...self(), tick: 200, killerName: 'Ancien', respawnTick: 250 });
    screen.hide();
    screen.syncSelf(self({ respawnTick: null, score: 2, level: 1 }), 10, 30);
    expect(el('death-killer').textContent).not.toContain('Ancien');
    expect(el('death-stats').textContent).toContain('score 2');
    expect(el('death-respawn').disabled).toBe(true);
    expect(el('death-respawn').textContent).toBe('En attente du serveur…');
  });
});

describe('neutralisation des entrées', () => {
  it('désactive mouvement, souris, bascules et statistiques pendant une modale puis repart au repos', () => {
    const onStat = vi.fn();
    const input = new InputController(new Element() as unknown as HTMLElement, { onStat });
    key('keydown', 'KeyW');
    key('keydown', 'KeyE');
    expect(input.sample({ x: 0, y: 0 }, 1, 0).fire).toBe(true);
    input.setEnabled(false);
    key('keydown', 'Digit1');
    key('keydown', 'KeyE');
    expect(input.sample({ x: 0, y: 0 }, 1, 0)).toMatchObject({
      move: { x: 0, y: 0 },
      fire: false,
      alt: false,
    });
    expect(onStat).not.toHaveBeenCalled();
    input.setEnabled(true);
    expect(input.sample({ x: 0, y: 0 }, 1, 0)).toMatchObject({ move: { x: 0, y: 0 }, fire: false });
  });

  it('purge souris et bascules au blur et réinitialise la séquence au changement de salon', () => {
    const target = new Element();
    const input = new InputController(target as unknown as HTMLElement, {});
    const down = new Event('mousedown');
    Object.assign(down, { button: 0 });
    target.dispatchEvent(down);
    input.toggleAutoSpin();
    input.acknowledgeSequence(50);
    expect(input.sample({ x: 0, y: 0 }, 1, 0).seq).toBe(51);
    win.dispatchEvent(new Event('blur'));
    expect(input.isAutoSpin).toBe(false);
    expect(input.sample({ x: 0, y: 0 }, 1, 0).fire).toBe(false);
    input.reset();
    expect(input.sample({ x: 0, y: 0 }, 1, 0).seq).toBe(1);
  });
});

describe('stockage indisponible', () => {
  it('démarre le menu, conserve la reprise en mémoire et efface un jeton malgré une erreur de stockage', () => {
    const denied = () => {
      throw new Error('storage denied');
    };
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied, removeItem: denied });
    const create = vi.fn();
    const join = vi.fn();
    const menu = new Menu({ create, join, onOpenControls: vi.fn() });
    el('menu-mode').value = 'ffa';
    el('menu-create').dispatchEvent(new Event('click'));
    expect(create).toHaveBeenCalledWith('', 'ffa');
    menu.saveSession('ABCDEF', 'secret');
    el('menu-resume-btn').dispatchEvent(new Event('click'));
    expect(join).toHaveBeenLastCalledWith('', 'ABCDEF', 'secret');
    el('menu-code').value = 'ABCDEF';
    el('menu-join-new').dispatchEvent(new Event('click'));
    expect(join).toHaveBeenLastCalledWith('', 'ABCDEF');
    expect(readStored('diep-fried:resume:ABCDEF')).toBe(null);
    expect(el('menu-resume-container').hidden).toBe(true);
  });
});

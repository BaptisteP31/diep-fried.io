import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStatLevels, type SelfState } from '@diep-fried/shared';
import { DeathScreen } from '../src/ui/death-screen';
import { InputController } from '../src/input/input-controller';
import { Menu } from '../src/ui/menu';
import { readStored } from '../src/state/storage';
import { Element, installDom } from './helpers/dom';
import { MODE_IDS, resolveModeConfig } from '@diep-fried/shared';
import { SandboxCommands } from '../src/input/sandbox';
import { SandboxPanel } from '../src/ui/sandbox-panel';
import { loadBindings } from '../src/input/bindings';
import { modeDetails } from '../src/ui/modes';

/** Petit DOM pour tester les comportements, sans ajouter de dépendance navigateur. */
let win: EventTarget;
let el: (id: string) => Element;

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
  ({ win, el } = installDom());
});
afterEach(() => vi.unstubAllGlobals());

describe('mort pendant une déconnexion', () => {
  it('affiche explicitement le spectateur et refuse clic/Entrée après tout délai', () => {
    const respawn = vi.fn();
    const screen = new DeathScreen({ onRespawn: respawn });
    screen.syncSelf(self({ spectator: true, respawnTick: null }), 90, 30);
    screen.setTick(100000);
    expect(el('death-title').textContent).toBe('Spectateur');
    expect(el('death-respawn').textContent).toBe('Réapparition au prochain round');
    expect(el('death-respawn').disabled).toBe(true);
    el('death-respawn').dispatchEvent(new Event('click'));
    key('keydown', 'Enter');
    key('keydown', 'Space');
    expect(respawn).not.toHaveBeenCalled();
    screen.syncSelf(self({ alive: true, spectator: false }), 100001, 30);
    expect(screen.isVisible).toBe(false);
  });
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
  it('conserve la séquence mais ne rejoue pas le mouvement/tir du round précédent', () => {
    const onPossess = vi.fn();
    const input = new InputController(new Element() as unknown as HTMLElement, { onPossess });
    key('keydown', 'KeyW');
    key('keydown', 'KeyE');
    key('keydown', 'KeyH');
    expect(onPossess).toHaveBeenCalledOnce();
    input.acknowledgeSequence(50);
    input.reset(false);
    const repeat = new Event('keydown', { cancelable: true });
    Object.assign(repeat, { code: 'KeyW', repeat: true });
    win.dispatchEvent(repeat);
    expect(input.sample({ x: 0, y: 0 }, 1, 0)).toMatchObject({
      seq: 51,
      move: { x: 0, y: 0 },
      fire: false,
    });
    key('keyup', 'KeyW');
    key('keydown', 'KeyW');
    expect(input.sample({ x: 0, y: 0 }, 1, 0).move.y).toBe(-1);
  });
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
    expect(create).toHaveBeenCalledWith('', 'ffa', {});
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

describe('modes et options du menu', () => {
  it('décrit les six modes à objectifs et refuse une capacité qui ne permet pas de démarrer', () => {
    const create = vi.fn();
    new Menu({ create, join: vi.fn(), onOpenControls: vi.fn() });
    for (const mode of ['domination', 'tag', 'ctf', 'breakout', 'survival', 'mothership']) {
      expect(modeDetails(mode).rules).toContain('2 joueurs connectés minimum');
      expect(modeDetails(mode).rules).not.toContain('Mode proposé par le serveur');
    }
    el('menu-mode').value = 'ctf';
    el('menu-max-players').value = '1';
    el('menu-create').dispatchEvent(new Event('click'));
    expect(create).not.toHaveBeenCalled();
    expect(el('menu-status').textContent).toContain('2 joueurs minimum');
  });
  it('propose tous les MODE_IDS, les règles et un libellé de secours pour un futur mode', () => {
    new Menu({ create: vi.fn(), join: vi.fn(), onOpenControls: vi.fn() });
    expect(el('menu-mode').children.map((option) => option.value)).toEqual([...MODE_IDS]);
    expect(el('menu-mode').children.every((option) => !!option.textContent)).toBe(true);
    el('menu-mode').value = 'teams2';
    el('menu-mode').dispatchEvent(new Event('change'));
    expect(el('menu-mode-rules').textContent).toContain('Deux équipes');
    expect(modeDetails('futureMode').label).toBe('futureMode');
  });

  it('transmet les options validées, refuse les bornes et protège les entrées pendant la requête', () => {
    const create = vi.fn();
    const menu = new Menu({ create, join: vi.fn(), onOpenControls: vi.fn() });
    el('menu-max-players').value = '12';
    el('menu-arena-size').value = 'small';
    el('menu-shape-density').value = 'high';
    el('menu-create').dispatchEvent(new Event('click'));
    expect(create).toHaveBeenLastCalledWith(expect.any(String), 'ffa', {
      maxPlayers: 12,
      arenaSize: 'small',
      shapeDensity: 'high',
    });
    create.mockClear();
    for (const invalid of ['0', '33', '1.5', 'NaN']) {
      el('menu-max-players').value = invalid;
      el('menu-create').dispatchEvent(new Event('click'));
      expect(el('menu-status').textContent).toContain('entier de 1 à 32');
    }
    expect(create).not.toHaveBeenCalled();
    el('menu-max-players').value = '32';
    menu.setBusy(true);
    el('menu-create').dispatchEvent(new Event('click'));
    expect(create).not.toHaveBeenCalled();
  });
});

describe('surface Sandbox', () => {
  it('cache et refuse les boutons hors Sandbox ou sans autorisation, puis envoie les intentions réelles', () => {
    let config = resolveModeConfig('ffa');
    let blocked = false;
    const send = vi.fn();
    const commands = new SandboxCommands(() => ({ config, alive: true, blocked }), send);
    const panel = new SandboxPanel(commands);
    panel.setBindings(loadBindings());
    panel.sync(config);
    const click = () => el('sandbox-panel').children[0]!.dispatchEvent(new Event('click'));
    click();
    expect(send).not.toHaveBeenCalled();
    expect(el('sandbox-panel').hidden).toBe(true);
    config = resolveModeConfig('sandbox');
    panel.sync(config);
    expect(el('sandbox-panel').hidden).toBe(false);
    click();
    expect(send).toHaveBeenCalledWith({ type: 'sandbox', action: 'levelUp' });
    blocked = true;
    el('sandbox-panel').children[1]!.dispatchEvent(new Event('click'));
    expect(send).toHaveBeenCalledTimes(1);
    config.sandbox.cheats = false;
    panel.sync(config);
    expect(el('sandbox-panel').hidden).toBe(true);
  });
});

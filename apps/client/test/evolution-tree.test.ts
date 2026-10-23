import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASS_DEFINITIONS,
  getClassDefinition,
  type ClassId,
  type SelfState,
  STAT_IDS,
} from '@diep-fried/shared';
import { drawClassThumbnail, GameHud } from '../src/ui/hud';

/** Mock simple de DOM sans ajouter de dépendance jsdom */
class MockClassList {
  private classes = new Set<string>();
  add(cls: string) {
    this.classes.add(cls);
  }
  remove(cls: string) {
    this.classes.delete(cls);
  }
  toggle(cls: string, force?: boolean) {
    if (force !== undefined) {
      if (force) this.classes.add(cls);
      else this.classes.delete(cls);
      return force;
    }
    if (this.classes.has(cls)) {
      this.classes.delete(cls);
      return false;
    }
    this.classes.add(cls);
    return true;
  }
  contains(cls: string): boolean {
    return this.classes.has(cls);
  }
}

class MockElement extends EventTarget {
  hidden = false;
  disabled = false;
  textContent = '';
  style: Record<string, any> = { width: '', setProperty: vi.fn() };
  classList = new MockClassList();
  dataset: Record<string, string> = {};
  children: MockElement[] = [];

  set className(val: string) {
    val
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => this.classList.add(c));
  }

  appendChild(child: MockElement) {
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    return child;
  }

  remove() {
    // detach from parent
  }

  getContext() {
    return null;
  }

  querySelector(selector: string): MockElement | null {
    if (selector === '.stat-bar') {
      return this.children.find((c) => c.classList.contains('stat-bar')) ?? null;
    }
    return null;
  }
}

describe('Arbre d’évolution et couverture des 54 classes', () => {
  it('contient exactement 54 classes contractuelles dans le catalogue partagé', () => {
    const classIds = Object.keys(CLASS_DEFINITIONS) as ClassId[];
    expect(classIds).toHaveLength(54);
  });

  it('répartit les 54 classes selon les paliers de niveau 1, 15, 30 et 45', () => {
    const byLevel: Record<number, ClassId[]> = { 1: [], 15: [], 30: [], 45: [] };
    for (const [id, def] of Object.entries(CLASS_DEFINITIONS)) {
      expect(byLevel[def.level]).toBeDefined();
      byLevel[def.level]!.push(id as ClassId);
    }

    expect(byLevel[1]).toHaveLength(1); // Tank
    expect(byLevel[15]).toHaveLength(4); // Twin, Sniper, Machine Gun, Flank Guard
    expect(byLevel[30]).toHaveLength(13); // Tier 3
    expect(byLevel[45]).toHaveLength(36); // Tier 4
    expect(
      byLevel[1]!.length + byLevel[15]!.length + byLevel[30]!.length + byLevel[45]!.length,
    ).toBe(54);
  });

  it('génère sans erreur une miniature lisible pour chacune des 54 classes', () => {
    const classIds = Object.keys(CLASS_DEFINITIONS) as ClassId[];

    for (const classId of classIds) {
      const canvas = {
        width: 54,
        height: 54,
        getContext: () => ({
          clearRect: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          closePath: vi.fn(),
          arc: vi.fn(),
          rect: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
        }),
      } as unknown as HTMLCanvasElement;

      expect(() => drawClassThumbnail(canvas, classId)).not.toThrow();
    }
  });

  describe('Famille Smasher (Smasher, Spike, Landmine, Auto-Smasher)', () => {
    const smasherClasses: ClassId[] = ['smasher', 'spike', 'landmine', 'auto-smasher'];

    it('identifie les 4 membres de la famille Smasher avec leurs plafonds de stats', () => {
      for (const id of smasherClasses) {
        const def = getClassDefinition(id)!;
        expect(def).toBeDefined();

        // Les 4 statistiques de tir sont plafonnées à 0 pour smasher, spike, landmine
        if (id !== 'auto-smasher') {
          expect(def.statCaps?.bulletSpeed).toBe(0);
          expect(def.statCaps?.bulletPenetration).toBe(0);
          expect(def.statCaps?.bulletDamage).toBe(0);
          expect(def.statCaps?.reload).toBe(0);
        }

        // Les 4 statistiques de corps sont plafonnées à 10
        expect(def.statCaps?.healthRegen).toBe(10);
        expect(def.statCaps?.maxHealth).toBe(10);
        expect(def.statCaps?.bodyDamage).toBe(10);
        expect(def.statCaps?.movementSpeed).toBe(10);
      }
    });

    describe('Masquage des stats à cap 0 dans le HUD', () => {
      let elements: Map<string, MockElement>;

      beforeEach(() => {
        elements = new Map();
        const getEl = (id: string) => {
          if (!elements.has(id)) elements.set(id, new MockElement());
          return elements.get(id)!;
        };

        vi.stubGlobal('document', {
          getElementById: getEl,
          createElement: (_tag: string) => new MockElement(),
        });
        vi.stubGlobal('HTMLElement', MockElement);
        vi.stubGlobal('HTMLButtonElement', MockElement);
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it('masque et désactive les statistiques à cap 0 pour un Smasher', () => {
        const hud = new GameHud({
          onUpgradeStat: vi.fn(),
          onChooseClass: vi.fn(),
          onToggleAutoFire: vi.fn(),
          onToggleAutoSpin: vi.fn(),
          onOpenControls: vi.fn(),
        });

        const smasherSelf: SelfState = {
          playerId: 1,
          entityId: 1,
          classId: 'smasher',
          level: 30,
          score: 50000,
          statPoints: 5,
          alive: true,
          stats: {
            healthRegen: 3,
            maxHealth: 5,
            bodyDamage: 7,
            bulletSpeed: 0,
            bulletPenetration: 0,
            bulletDamage: 0,
            reload: 0,
            movementSpeed: 4,
          },
          statCaps: {
            healthRegen: 10,
            maxHealth: 10,
            bodyDamage: 10,
            movementSpeed: 10,
            bulletSpeed: 0,
            bulletPenetration: 0,
            bulletDamage: 0,
            reload: 0,
          },
          levelProgress: 0.5,
          classChoices: ['landmine', 'spike', 'auto-smasher'],
          view: 900,
          respawnTick: null,
        };

        hud.updateSelf(smasherSelf);

        // Récupérer les lignes de stats créées dans stats-panel
        const statsPanel = elements.get('stats-panel')!;
        const statRows = statsPanel.children.filter((c) => c.dataset.stat);

        expect(statRows).toHaveLength(8);

        const zeroStats = ['bulletSpeed', 'bulletPenetration', 'bulletDamage', 'reload'];
        for (const stat of zeroStats) {
          const row = statRows.find((r) => r.dataset.stat === stat)!;
          expect(row).toBeDefined();
          expect(row.hidden).toBe(true);
          expect(row.classList.contains('stat-disabled')).toBe(true);
          const btn = row.children.find((c) => c.classList.contains('stat-plus-btn'))!;
          expect(btn).toBeDefined();
          expect(btn.disabled).toBe(true);
        }

        const activeStats = ['healthRegen', 'maxHealth', 'bodyDamage', 'movementSpeed'];
        for (const stat of activeStats) {
          const row = statRows.find((r) => r.dataset.stat === stat)!;
          expect(row).toBeDefined();
          expect(row.hidden).toBe(false);
          expect(row.classList.contains('stat-disabled')).toBe(false);
        }
      });
    });
  });
});

import { CLASS_DEFINITIONS, type ClassDefinition, type ClassId } from '@diep-fried/shared';
import { drawClassThumbnail } from './hud';

export interface UpgradeTreeModalCallbacks {
  onChooseClass?(classId: ClassId): void;
}

/** Tiers d'évolution par niveau de déblocage. */
const TIERS: ReadonlyArray<{ level: number; label: string }> = [
  { level: 1, label: 'Niveau 1 — Classe de départ' },
  { level: 15, label: 'Niveau 15 — Premier palier' },
  { level: 30, label: 'Niveau 30 — Deuxième palier' },
  { level: 45, label: 'Niveau 45 — Classes ultimes' },
];

/**
 * Modal d'affichage de l'arbre complet des 54 classes d'évolution.
 * Peut être maintenu ouvert avec la touche [Y], ouvert via le bouton HUD,
 * ou fermé avec Échap / le bouton de fermeture.
 */
export class UpgradeTreeModal {
  private readonly modal: HTMLElement | null;
  private readonly closeBtn: HTMLElement | null;
  private readonly container: HTMLElement | null;
  private isHeldOpen = false;

  constructor(private readonly callbacks: UpgradeTreeModalCallbacks = {}) {
    this.modal =
      typeof document !== 'undefined' && typeof document.getElementById === 'function'
        ? document.getElementById('upgrade-tree-modal')
        : null;
    this.closeBtn =
      typeof document !== 'undefined' && typeof document.getElementById === 'function'
        ? document.getElementById('upgrade-tree-close')
        : null;
    this.container =
      typeof document !== 'undefined' && typeof document.getElementById === 'function'
        ? document.getElementById('upgrade-tree-content')
        : null;

    this.closeBtn?.addEventListener?.('click', () => this.hide());
    this.modal?.addEventListener?.('click', (event) => {
      if (event.target === this.modal) this.hide();
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && this.modal && !this.modal.hidden) {
          event.preventDefault();
          this.hide();
        }
      });
    }

    if (
      this.container &&
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function'
    ) {
      this.renderTree();
    }
  }

  show(): void {
    if (this.modal) this.modal.hidden = false;
  }

  hide(): void {
    this.isHeldOpen = false;
    if (this.modal) this.modal.hidden = true;
  }

  toggle(): boolean {
    if (this.modal) {
      if (this.modal.hidden) {
        this.show();
        return true;
      }
      this.hide();
      return false;
    }
    return false;
  }

  setHeld(down: boolean): void {
    if (down) {
      this.isHeldOpen = true;
      this.show();
    } else if (this.isHeldOpen) {
      this.hide();
    }
  }

  isOpen(): boolean {
    return !!this.modal && !this.modal.hidden;
  }

  private renderTree(): void {
    if (!this.container || typeof document.createElement !== 'function') return;
    this.container.innerHTML = '';

    // Regroupement des 54 classes par niveau
    const classesByTier = new Map<number, ClassDefinition[]>();
    for (const tier of TIERS) {
      classesByTier.set(tier.level, []);
    }

    for (const def of Object.values(CLASS_DEFINITIONS)) {
      const list = classesByTier.get(def.level);
      if (list) {
        list.push(def);
      }
    }

    for (const tier of TIERS) {
      const section = document.createElement('div');
      section.className = 'tree-tier-section';

      const heading = document.createElement('h3');
      heading.className = 'tree-tier-heading';
      heading.textContent = tier.label;
      section.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'tree-tier-grid';

      const classes = classesByTier.get(tier.level) ?? [];
      for (const def of classes) {
        const card = document.createElement('div');
        card.className = 'tree-class-card';
        card.dataset.classId = def.id;

        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        canvas.className = 'tree-class-thumb';
        drawClassThumbnail(canvas, def.id);

        const name = document.createElement('div');
        name.className = 'tree-class-name';
        name.textContent = def.name;

        card.appendChild(canvas);
        card.appendChild(name);

        card.addEventListener('click', () => {
          this.callbacks.onChooseClass?.(def.id);
        });

        grid.appendChild(card);
      }

      section.appendChild(grid);
      this.container.appendChild(section);
    }
  }
}

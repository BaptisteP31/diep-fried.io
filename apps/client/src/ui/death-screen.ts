import type { DeathInfo, SelfState } from '@diep-fried/shared';
import { formatScore } from './hud';

export interface DeathScreenCallbacks {
  onRespawn(): void;
}

/**
 * Écran de mort : affiche l'éliminateur, le score, le niveau et
 * gère le décompte avant réapparition autorisée (`respawnTick`).
 */
export class DeathScreen {
  private readonly container: HTMLElement;
  private readonly killerText: HTMLElement;
  private readonly statsText: HTMLElement;
  private readonly respawnBtn: HTMLButtonElement;

  private deathInfo: (Omit<DeathInfo, 'respawnTick'> & { respawnTick: number | null }) | null =
    null;
  private fromSnapshot = false;
  private currentTick = 0;
  private tickRate = 30;
  private spectator = false;

  constructor(private readonly callbacks: DeathScreenCallbacks) {
    this.container = document.getElementById('death')!;
    this.killerText = document.getElementById('death-killer')!;
    this.statsText = document.getElementById('death-stats')!;
    this.respawnBtn = document.getElementById('death-respawn') as HTMLButtonElement;

    this.respawnBtn.addEventListener('click', () => {
      if (!this.respawnBtn.disabled) this.callbacks.onRespawn();
    });

    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          'input, textarea, select, button, [role="dialog"], [contenteditable="true"]',
        )
      )
        return;
      if (this.isVisible && (e.code === 'Enter' || e.code === 'Space')) {
        if (!this.respawnBtn.disabled) {
          e.preventDefault();
          this.callbacks.onRespawn();
        }
      }
    });
  }

  get isVisible(): boolean {
    return !this.container.hidden;
  }

  show(info: DeathInfo, tickRate = 30): void {
    this.fromSnapshot = false;
    this.deathInfo = info;
    this.tickRate = tickRate;
    this.container.hidden = false;

    if (info.killerName) {
      this.killerText.textContent = `Éliminé par ${info.killerName}`;
    } else {
      this.killerText.textContent = 'Responsable inconnu';
    }

    this.statsText.textContent = `Score final : ${formatScore(info.score)} — Niveau ${info.level}`;
    this.updateRespawnCountdown();
  }

  hide(): void {
    this.container.hidden = true;
    this.deathInfo = null;
    this.currentTick = 0;
    this.fromSnapshot = false;
    this.spectator = false;
    this.container.classList.remove('spectator');
    this.respawnBtn.disabled = true;
  }

  /** Une reprise peut manquer death : self est suffisant pour afficher la réapparition. */
  syncSelf(self: SelfState, tick: number, tickRate: number): void {
    if (self.alive) {
      this.hide();
      return;
    }
    this.currentTick = tick;
    this.tickRate = tickRate;
    this.spectator = self.spectator === true;
    this.container.classList.toggle('spectator', this.spectator);
    document.getElementById('death-title')!.textContent = this.spectator
      ? 'Spectateur'
      : 'Vous êtes éliminé';
    if (!this.deathInfo) {
      this.show(
        { ...self, tick, killerName: null, respawnTick: self.respawnTick ?? tick },
        tickRate,
      );
      this.fromSnapshot = true;
    }
    this.deathInfo!.respawnTick = self.respawnTick;
    if (this.spectator)
      this.killerText.textContent =
        'Éliminé ou arrivé en cours de manche · retour au prochain round';
    if (this.fromSnapshot) {
      this.statsText.textContent = `État actuel : score ${formatScore(self.score)} — Niveau ${self.level}`;
    }
    this.updateRespawnCountdown();
  }

  setTick(currentTick: number): void {
    this.currentTick = currentTick;
    if (this.isVisible && this.deathInfo) {
      this.updateRespawnCountdown();
    }
  }

  private updateRespawnCountdown(): void {
    if (!this.deathInfo) return;
    if (this.spectator) {
      this.respawnBtn.disabled = true;
      this.respawnBtn.textContent = 'Réapparition au prochain round';
      return;
    }
    const respawnTick = this.deathInfo.respawnTick;
    if (respawnTick === null) {
      this.respawnBtn.disabled = true;
      this.respawnBtn.textContent = 'En attente du serveur…';
      return;
    }
    if (this.currentTick < respawnTick) {
      const remainingTicks = Math.max(0, respawnTick - this.currentTick);
      const remainingSec = Math.ceil(remainingTicks / this.tickRate);
      this.respawnBtn.disabled = true;
      this.respawnBtn.textContent = `Réapparition dans ${remainingSec} s...`;
    } else {
      this.respawnBtn.disabled = false;
      this.respawnBtn.textContent = 'Réapparaître (Entrée)';
    }
  }
}

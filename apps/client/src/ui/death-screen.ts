import type { DeathInfo } from '@diep-fried/shared';
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

  private deathInfo: DeathInfo | null = null;
  private currentTick = 0;
  private tickRate = 30;

  constructor(private readonly callbacks: DeathScreenCallbacks) {
    this.container = document.getElementById('death')!;
    this.killerText = document.getElementById('death-killer')!;
    this.statsText = document.getElementById('death-stats')!;
    this.respawnBtn = document.getElementById('death-respawn') as HTMLButtonElement;

    this.respawnBtn.addEventListener('click', () => {
      if (!this.respawnBtn.disabled) this.callbacks.onRespawn();
    });

    window.addEventListener('keydown', (e) => {
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
    this.deathInfo = info;
    this.tickRate = tickRate;
    this.container.hidden = false;

    if (info.killerName) {
      this.killerText.textContent = `Éliminé par ${info.killerName}`;
    } else {
      this.killerText.textContent = 'Votre tank a été détruit';
    }

    this.statsText.textContent = `Score final : ${formatScore(info.score)} — Niveau ${info.level}`;
    this.updateRespawnCountdown();
  }

  hide(): void {
    this.container.hidden = true;
    this.deathInfo = null;
  }

  setTick(currentTick: number): void {
    this.currentTick = currentTick;
    if (this.isVisible && this.deathInfo) {
      this.updateRespawnCountdown();
    }
  }

  private updateRespawnCountdown(): void {
    if (!this.deathInfo) return;
    const respawnTick = this.deathInfo.respawnTick;
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

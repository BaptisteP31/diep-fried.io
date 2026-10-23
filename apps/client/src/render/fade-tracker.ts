import type { EntityState } from '@diep-fried/shared';

export interface FadingEntity {
  entity: EntityState;
  startTimeMs: number;
  durationMs: number;
}

/**
 * Suivi des entités qui disparaissent de l'écran ou sont détruites.
 * Permet un estompage doux (fondu) plutôt qu'une coupure brutale de l'affichage.
 */
export class FadeTracker {
  private previousEntities = new Map<number, EntityState>();
  private fading = new Map<number, FadingEntity>();

  constructor(private readonly defaultDurationMs = 200) {}

  /**
   * Met à jour le suivi avec les entités reçues dans l'image courante.
   */
  update(currentEntities: readonly EntityState[], nowMs: number): void {
    const currentIds = new Set(currentEntities.map((e) => e.id));

    // Si une entité qui était en fondu réapparaît, on retire son fondu
    for (const id of currentIds) {
      this.fading.delete(id);
    }

    // Détecte les entités présentes au tour précédent mais absentes de ce tour
    for (const [id, entity] of this.previousEntities) {
      if (!currentIds.has(id) && !this.fading.has(id)) {
        this.fading.set(id, {
          entity,
          startTimeMs: nowMs,
          durationMs: this.defaultDurationMs,
        });
      }
    }

    // Met à jour la liste des dernières entités vues
    this.previousEntities.clear();
    for (const entity of currentEntities) {
      this.previousEntities.set(entity.id, entity);
    }

    // Nettoie les fondus expirés
    for (const [id, item] of this.fading) {
      if (nowMs - item.startTimeMs >= item.durationMs) {
        this.fading.delete(id);
      }
    }
  }

  /**
   * Renvoie les entités en cours de disparition avec leur coefficient d'opacité résiduel (1 -> 0).
   */
  getFading(nowMs: number): Array<{ entity: EntityState; alpha: number }> {
    const result: Array<{ entity: EntityState; alpha: number }> = [];
    for (const [id, item] of this.fading) {
      const elapsed = nowMs - item.startTimeMs;
      if (elapsed < item.durationMs) {
        const factor = 1 - elapsed / item.durationMs;
        result.push({
          entity: item.entity,
          alpha: Math.max(0, Math.min(1, factor)),
        });
      } else {
        this.fading.delete(id);
      }
    }
    return result;
  }

  clear(): void {
    this.previousEntities.clear();
    this.fading.clear();
  }
}

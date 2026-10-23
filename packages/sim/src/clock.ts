/**
 * Accumulateur à pas fixe : convertit un temps réel écoulé en nombre de ticks à simuler.
 * Pur (aucune lecture d'horloge) ; l'appelant fournit les millisecondes écoulées.
 * Au-delà de `maxStepsPerAdvance`, le retard est abandonné plutôt que rattrapé,
 * pour éviter qu'un serveur surchargé ne s'enfonce.
 */
export class FixedStepClock {
  readonly stepMs: number;
  private accumulatorMs = 0;
  private droppedMs = 0;

  constructor(
    tickRate: number,
    private readonly maxStepsPerAdvance = 5,
  ) {
    if (!(tickRate > 0)) throw new RangeError('tickRate doit être positif');
    this.stepMs = 1000 / tickRate;
  }

  /** Ajoute `elapsedMs` et renvoie le nombre de ticks à exécuter maintenant. */
  advance(elapsedMs: number): number {
    this.accumulatorMs += Math.max(0, elapsedMs);
    let steps = Math.floor(this.accumulatorMs / this.stepMs);
    this.accumulatorMs -= steps * this.stepMs;
    if (steps > this.maxStepsPerAdvance) {
      this.droppedMs += (steps - this.maxStepsPerAdvance) * this.stepMs;
      steps = this.maxStepsPerAdvance;
    }
    return steps;
  }

  /** Temps simulé abandonné depuis la création, en millisecondes (métrique de surcharge). */
  get totalDroppedMs(): number {
    return this.droppedMs;
  }
}

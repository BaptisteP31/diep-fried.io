/**
 * Calcul du recul visuel des canons à partir du tick du dernier tir.
 *
 * @param currentTick Tick rendu (peut être fractionnaire lors de l'interpolation).
 * @param shotTick Tick auquel le tir a eu lieu (-1 ou undefined si jamais).
 * @param durationTicks Durée de l'animation de recul en ticks (4 ticks = ~133 ms à 30 Hz).
 * @returns Facteur de recul entre 0 (repos) et 1 (recul maximal au moment du tir).
 */
export function calculateBarrelRecoil(
  currentTick: number,
  shotTick: number | undefined,
  durationTicks = 4,
): number {
  if (shotTick === undefined || shotTick < 0 || durationTicks <= 0) return 0;
  const elapsed = currentTick - shotTick;
  if (elapsed < 0 || elapsed >= durationTicks) return 0;
  // Décroissance quadratique fluide (recul sec puis retour souple vers la position de repos)
  const remaining = 1 - elapsed / durationTicks;
  return remaining * remaining;
}

/**
 * Déplacement arrière du canon en unités monde.
 *
 * @param barrelLength Longueur nominale du canon (multiplicateur du rayon).
 * @param tankRadius Rayon de collision du corps du tank.
 * @param recoilFactor Facteur calculé par `calculateBarrelRecoil`.
 * @param recoilMultiplier Multiplicateur de recul propre à la définition du canon (défaut 1).
 */
export function calculateRecoilOffset(
  barrelLength: number,
  tankRadius: number,
  recoilFactor: number,
  recoilMultiplier = 1,
): number {
  if (recoilFactor <= 0 || recoilMultiplier <= 0) return 0;
  // Recul maximum de l'ordre de 20% de la longueur du canon
  return barrelLength * tankRadius * 0.2 * recoilFactor * recoilMultiplier;
}

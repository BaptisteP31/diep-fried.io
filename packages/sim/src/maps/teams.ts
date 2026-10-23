import type { MapZone, Rect, TeamId } from '@diep-fried/shared';
import {
  MAZE_LIMITS,
  type TeamBaseInfo,
  type TeamLayoutOptions,
  type TeamLayoutResult,
} from './types';

/**
 * Valide les dimensions de l'arène et les paramètres pour l'agencement des bases.
 */
function validateTeamArena(
  width: number,
  height: number,
  teamCount: number,
  ratio: number,
  margin: number,
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError(
      `Dimensions d'arène invalides: width=${width}, height=${height}. Attendu: nombres finis > 0.`,
    );
  }

  if (teamCount !== 2 && teamCount !== 4) {
    throw new Error(
      `Nombre d'équipes non supporté: ${teamCount}. Seuls 2 et 4 équipes sont pris en charge.`,
    );
  }

  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 0.5) {
    throw new RangeError(
      `baseSizeRatio invalide: ${ratio}. Doit être compris dans l'intervalle (0, 0.5).`,
    );
  }

  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError(`spawnMargin invalide: ${margin}. Doit être >= 0.`);
  }

  if (
    width < MAZE_LIMITS.minArenaDimension ||
    height < MAZE_LIMITS.minArenaDimension ||
    width > MAZE_LIMITS.maxArenaDimension ||
    height > MAZE_LIMITS.maxArenaDimension
  ) {
    throw new RangeError(
      `Dimensions hors bornes: ${width}x${height}. Doit être compris entre ${MAZE_LIMITS.minArenaDimension} et ${MAZE_LIMITS.maxArenaDimension}.`,
    );
  }
}

/**
 * Calcule l'agencement structuré des bases d'équipes pour 2 ou 4 équipes.
 *
 * Principes de conception diep-fried.io :
 * - 2 équipes : bases latérales occupant toute la hauteur sur les flancs ouest (Team 1) et est (Team 2).
 *   Séparation centrale garantie pour permettre les combats et le placement de couloirs.
 * - 4 équipes : bases carrées disposées aux quatre coins cardinaux :
 *   - Team 1 (Bleu) : Coin Nord-Ouest (0, 0)
 *   - Team 2 (Rouge) : Coin Sud-Est (opposé diagonal)
 *   - Team 3 (Vert) : Coin Nord-Est
 *   - Team 4 (Violet) : Coin Sud-Ouest
 * - Chaque base englobe une zone 'base' (pourtour protecteur) et une zone 'spawn'
 *   (centrée avec spawnMargin pour éviter que les tanks ne réapparaissent sur la ligne de front).
 */
export function generateTeamLayoutResult(
  width: number,
  height: number,
  teamCount: 2 | 4,
  options: TeamLayoutOptions = {},
): TeamLayoutResult {
  const ratio = options.baseSizeRatio ?? MAZE_LIMITS.defaultBaseSizeRatio;
  const margin = options.spawnMargin ?? MAZE_LIMITS.defaultSpawnMargin;

  validateTeamArena(width, height, teamCount, ratio, margin);

  const minCorridor = MAZE_LIMITS.defaultTankRadius * 4; // Espace minimal entre bases

  const teamInfos: TeamBaseInfo[] = [];

  if (teamCount === 2) {
    const baseWidth = Math.round(width * ratio);
    const separation = width - 2 * baseWidth;

    if (separation < minCorridor) {
      throw new Error(
        `Arène trop étroite (${width}) pour accueillir deux bases de largeur ${baseWidth} avec un corridor minimal de ${minCorridor}.`,
      );
    }

    if (baseWidth <= 2 * margin) {
      throw new Error(
        `Largeur de base insuffisante (${baseWidth}) pour la marge de spawn (${margin}).`,
      );
    }

    // Team 1 (Bleu) - Flanc Ouest
    const base1: Rect = { x: 0, y: 0, width: baseWidth, height };
    const spawn1: Rect = {
      x: margin,
      y: margin,
      width: baseWidth - 2 * margin,
      height: height - 2 * margin,
    };
    teamInfos.push({ team: 1 as TeamId, baseArea: base1, spawnArea: spawn1 });

    // Team 2 (Rouge) - Flanc Est
    const base2: Rect = { x: width - baseWidth, y: 0, width: baseWidth, height };
    const spawn2: Rect = {
      x: width - baseWidth + margin,
      y: margin,
      width: baseWidth - 2 * margin,
      height: height - 2 * margin,
    };
    teamInfos.push({ team: 2 as TeamId, baseArea: base2, spawnArea: spawn2 });
  } else {
    // 4 équipes aux 4 coins
    const baseSize = Math.round(Math.min(width, height) * ratio);
    const sepX = width - 2 * baseSize;
    const sepY = height - 2 * baseSize;

    if (sepX < minCorridor || sepY < minCorridor) {
      throw new Error(
        `Arène trop étroite (${width}x${height}) pour 4 bases de taille ${baseSize} (séparations: ${sepX}x${sepY}, min attendu: ${minCorridor}).`,
      );
    }

    if (baseSize <= 2 * margin) {
      throw new Error(
        `Taille de base insuffisante (${baseSize}) pour la marge de spawn (${margin}).`,
      );
    }

    // Team 1 : Nord-Ouest
    teamInfos.push({
      team: 1 as TeamId,
      baseArea: { x: 0, y: 0, width: baseSize, height: baseSize },
      spawnArea: {
        x: margin,
        y: margin,
        width: baseSize - 2 * margin,
        height: baseSize - 2 * margin,
      },
    });

    // Team 2 : Sud-Est (opposé direct)
    teamInfos.push({
      team: 2 as TeamId,
      baseArea: {
        x: width - baseSize,
        y: height - baseSize,
        width: baseSize,
        height: baseSize,
      },
      spawnArea: {
        x: width - baseSize + margin,
        y: height - baseSize + margin,
        width: baseSize - 2 * margin,
        height: baseSize - 2 * margin,
      },
    });

    // Team 3 : Nord-Est
    teamInfos.push({
      team: 3 as TeamId,
      baseArea: { x: width - baseSize, y: 0, width: baseSize, height: baseSize },
      spawnArea: {
        x: width - baseSize + margin,
        y: margin,
        width: baseSize - 2 * margin,
        height: baseSize - 2 * margin,
      },
    });

    // Team 4 : Sud-Ouest
    teamInfos.push({
      team: 4 as TeamId,
      baseArea: { x: 0, y: height - baseSize, width: baseSize, height: baseSize },
      spawnArea: {
        x: margin,
        y: height - baseSize + margin,
        width: baseSize - 2 * margin,
        height: baseSize - 2 * margin,
      },
    });
  }

  const zones: MapZone[] = [];
  for (const t of teamInfos) {
    zones.push({
      kind: 'base',
      team: t.team,
      area: t.baseArea,
    });
    zones.push({
      kind: 'spawn',
      team: t.team,
      area: t.spawnArea,
    });
  }

  return {
    zones,
    teams: teamInfos,
  };
}

/**
 * Génère la liste des zones de carte (MapZone[] partagées) pour 2 ou 4 équipes.
 * Prêt à être assigné directement à ModeConfig.map.zones.
 */
export function generateTeamLayout(
  width: number,
  height: number,
  teamCount: 2 | 4,
  options?: TeamLayoutOptions,
): MapZone[] {
  return generateTeamLayoutResult(width, height, teamCount, options).zones;
}

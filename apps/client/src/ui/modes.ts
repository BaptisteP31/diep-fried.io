import { MAX_PLAYERS_LIMIT, type RoomOptions } from '@diep-fried/shared';

/** Catalogue éditorial facultatif : MODE_IDS reste la source des modes disponibles. */
const DETAILS: Readonly<Record<string, { label: string; rules: string }>> = {
  ffa: {
    label: 'Chacun pour soi (FFA)',
    rules:
      'Tous les autres tanks sont adversaires. Détruisez les formes et progressez pour monter au classement.',
  },
  sandbox: {
    label: 'Bac à sable',
    rules:
      'Entraînement libre : commandes de niveau, classe et invulnérabilité autorisées par le serveur. Réapparition sans délai et score conservé.',
  },
  teams2: {
    label: '2 équipes',
    rules:
      'Deux équipes se partagent l’arène. Pas de tirs alliés ; rejoignez vos équipiers et affrontez l’équipe adverse.',
  },
  teams4: {
    label: '4 équipes',
    rules:
      'Quatre équipes se disputent l’arène. Pas de tirs alliés ; progressez avec vos équipiers.',
  },
  maze: {
    label: 'Labyrinthe',
    rules:
      'Chacun pour soi dans une arène avec des murs infranchissables. Utilisez les passages pour combattre et progresser.',
  },
};

export function modeDetails(id: string): { label: string; rules: string } {
  return (
    DETAILS[id] ?? {
      label: id,
      rules: 'Mode proposé par le serveur. Les règles et options sont fixées par sa configuration.',
    }
  );
}

/** Champs vides = preset du mode. Les valeurs invalides ne sont jamais corrigées silencieusement. */
export function parseRoomOptions(
  maxPlayers: string,
  arenaSize: string,
  shapeDensity: string,
): RoomOptions {
  const options: RoomOptions = {};
  if (maxPlayers !== '') {
    const count = Number(maxPlayers);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PLAYERS_LIMIT) {
      throw new Error(`Le nombre de joueurs doit être un entier de 1 à ${MAX_PLAYERS_LIMIT}.`);
    }
    options.maxPlayers = count;
  }
  if (arenaSize !== '') {
    if (arenaSize !== 'small' && arenaSize !== 'medium' && arenaSize !== 'large')
      throw new Error('Taille d’arène invalide.');
    options.arenaSize = arenaSize;
  }
  if (shapeDensity !== '') {
    if (shapeDensity !== 'low' && shapeDensity !== 'normal' && shapeDensity !== 'high')
      throw new Error('Densité de formes invalide.');
    options.shapeDensity = shapeDensity;
  }
  return options;
}

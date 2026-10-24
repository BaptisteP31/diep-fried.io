import {
  MAX_PLAYERS_LIMIT,
  resolveModeConfig,
  isModeId,
  type RoomOptions,
} from '@diep-fried/shared';

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
  domination: {
    label: 'Domination',
    rules:
      'Capturez les quatre Dominators en détruisant leurs défenses. Contrôlez-les tous pour gagner. H permet de piloter ou rendre un objectif allié proche.',
  },
  tag: {
    label: 'Conversion (Tag)',
    rules:
      'Convertissez les adversaires à votre équipe en les éliminant. La dernière équipe restante gagne la manche.',
  },
  ctf: {
    label: 'Capture du drapeau',
    rules:
      'Rapportez le drapeau adverse à votre base avec votre propre drapeau à la maison. Touchez votre drapeau tombé pour le ramener ; sinon son retour est automatique. Trois captures pour gagner, ou meilleur score au temps limite.',
  },
  breakout: {
    label: 'Conquête (Breakout)',
    rules:
      'Occupez les territoires pour les capturer et marquer des points. La progression est gelée si plusieurs équipes sont présentes. Atteignez 600 points, ou le meilleur score au temps limite.',
  },
  survival: {
    label: 'Survie',
    rules:
      'Restez dans le cercle sûr : la zone extérieure inflige des dégâts et le cercle rétrécit. Le dernier survivant gagne. Les éliminés et les arrivants en cours de manche regardent jusqu’au round suivant.',
  },
  mothership: {
    label: 'Vaisseaux-mères',
    rules:
      'Protégez votre vaisseau-mère et détruisez celui des adversaires. H permet de piloter ou rendre un vaisseau allié proche.',
  },
};

export function modeDetails(id: string): { label: string; rules: string } {
  const details = DETAILS[id] ?? {
    label: id,
    rules: 'Mode proposé par le serveur. Les règles et options sont fixées par sa configuration.',
  };
  const minPlayers = isModeId(id) ? resolveModeConfig(id).match?.minPlayers : undefined;
  return {
    ...details,
    rules: `${details.rules}${minPlayers ? ` ${minPlayers} joueurs connectés minimum pour démarrer ; partagez le code du salon.` : ''}`,
  };
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

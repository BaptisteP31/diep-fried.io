/**
 * Version du protocole client-serveur. Incrémenter à chaque changement incompatible
 * des messages ou des états (champ retiré, renommé, sens modifié). Un champ optionnel
 * ajouté reste compatible. Client et serveur doivent annoncer la même version.
 */
export const PROTOCOL_VERSION = 1;

/** Chemin HTTP de la connexion WebSocket de jeu. */
export const WS_PATH = '/ws';

/** Chemin HTTP de l'état de santé du serveur. */
export const HEALTH_PATH = '/healthz';

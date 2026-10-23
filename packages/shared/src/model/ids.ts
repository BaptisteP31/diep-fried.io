/**
 * Identifiants partagés. Tous sont des entiers positifs attribués par le serveur
 * et uniques pendant la vie d'un salon ; ils ne sont jamais réutilisés.
 */

/** Entité simulée (tank, projectile, forme...). */
export type EntityId = number;

/** Joueur humain d'un salon. Distinct de l'entité qu'il pilote, qui change à chaque vie. */
export type PlayerId = number;

/** Numéro de pas de simulation, depuis 0 à la création du salon. */
export type Tick = number;

/**
 * Équipe d'une entité. Deux entités de même équipe ne se blessent pas (sauf `friendlyFire`).
 * - `NEUTRAL_TEAM` : formes et entités sans camp.
 * - 1..4 : équipes déclarées par `ModeConfig.teams`.
 * - >= `FIRST_SOLO_TEAM` : équipes individuelles des modes sans équipes (FFA).
 */
export type TeamId = number;

export const NEUTRAL_TEAM: TeamId = 0;
export const FIRST_SOLO_TEAM: TeamId = 100;

/** Identifiant textuel de classe de tank (`tank`, `twin`, `machine-gun`...). */
export type ClassId = string;

export const CLASS_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

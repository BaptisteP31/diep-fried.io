import type { ShapeKind, StatId, TeamColor } from '@diep-fried/shared';

/**
 * Couleurs relevées sur les variables CSS du client original
 * (docs/research/rendering-assets/verified-css-tokens.json). Ce sont des valeurs de couleur,
 * pas du code ; épaisseurs et dimensions restent nos choix.
 */
export const PALETTE = {
  background: '#cccccc',
  grid: 'rgba(0, 0, 0, 0.1)',
  outsideArena: 'rgba(0, 0, 0, 0.1)',
  mazeWall: '#bbbbbb',
  outline: 'rgba(0, 0, 0, 0.25)',
  barrel: '#999999',
  barrelOutline: '#555555',
  friendly: '#00b2e1',
  enemy: '#f14e54',
  neutral: '#999999',
  healthBack: '#555555',
  healthFill: '#85e37d',
  textStroke: '#393939',
  text: '#ffffff',
  // Jetons vérifiés pour le HUD et l'interface
  scoreBarFill: '#43ff91',
  xpBarFill: '#ffde43',
  leaderboardBarFill: '#64ff8c',
  barBackground: 'rgba(0, 0, 0, 0.45)',
  minimapBackground: 'rgba(205, 205, 205, 0.75)',
  minimapBorder: '#797979',
  minimapArrow: '#000000',
  statBack: 'rgba(0, 0, 0, 0.25)',
} as const;

export const TEAM_COLORS: Readonly<Record<TeamColor, string>> = {
  blue: '#00b2e1',
  red: '#f14e54',
  green: '#00e16e',
  purple: '#bf7ff5',
};

export const SHAPE_COLORS: Readonly<Record<ShapeKind, string>> = {
  square: '#ffe869',
  triangle: '#fc7677',
  pentagon: '#768dfc',
  alphaPentagon: '#768dfc',
  crasher: '#f177dd',
};

export const SHINY_COLOR = '#8aff69';

/**
 * Couleurs officielles vérifiées des 8 barres de statistiques (--theme-color-uiColor1..8).
 */
export const STAT_COLORS: Readonly<Record<StatId, string>> = {
  healthRegen: '#43fff9',
  maxHealth: '#82ff43',
  bodyDamage: '#ff4343',
  bulletSpeed: '#ffde43',
  bulletPenetration: '#437fff',
  bulletDamage: '#8543ff',
  reload: '#f943ff',
  movementSpeed: '#fcad76',
};

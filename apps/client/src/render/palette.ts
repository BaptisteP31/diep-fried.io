import type { ShapeKind, TeamColor } from '@diep-fried/shared';

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

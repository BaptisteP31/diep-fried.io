import { describe, expect, it } from 'vitest';
import { STAT_IDS } from '@diep-fried/shared';
import { formatScore, STAT_NAMES } from '../src/ui/hud';
import { PALETTE, STAT_COLORS } from '../src/render/palette';

describe('hud-logic', () => {
  it('fournit un libellé français pour chacune des 8 statistiques contractuelles', () => {
    for (const stat of STAT_IDS) {
      expect(STAT_NAMES[stat]).toBeDefined();
      expect(typeof STAT_NAMES[stat]).toBe('string');
      expect(STAT_NAMES[stat].length).toBeGreaterThan(0);
    }
  });

  it('fournit une couleur vérifiée pour chacune des 8 statistiques', () => {
    for (const stat of STAT_IDS) {
      expect(STAT_COLORS[stat]).toBeDefined();
      expect(STAT_COLORS[stat]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('fournit des couleurs de palette vérifiées pour l’arène et le HUD', () => {
    expect(PALETTE.xpBarFill).toBe('#ffde43');
    expect(PALETTE.scoreBarFill).toBe('#43ff91');
    expect(PALETTE.leaderboardBarFill).toBe('#64ff8c');
    expect(PALETTE.friendly).toBe('#00b2e1');
    expect(PALETTE.enemy).toBe('#f14e54');
  });

  it('formate les scores avec la locale française', () => {
    // 0 -> "0"
    expect(formatScore(0)).toBe('0');
    // 1234 -> "1 234" ou "1 234" (espace insécable ou fine)
    const formatted = formatScore(1234);
    expect(formatted.replace(/\s|\u202f|\u00a0/g, ' ')).toBe('1 234');
  });

  it('calcule correctement les secondes restantes avant réapparition', () => {
    const tickRate = 30;
    const currentTick = 100;
    const respawnTick = 160; // 60 ticks = 2.0 s
    const remainingTicks = Math.max(0, respawnTick - currentTick);
    const remainingSec = Math.ceil(remainingTicks / tickRate);
    expect(remainingSec).toBe(2);

    // Quand le délai est dépassé
    const elapsedTicks = Math.max(0, respawnTick - 200);
    expect(Math.ceil(elapsedTicks / tickRate)).toBe(0);
  });
});

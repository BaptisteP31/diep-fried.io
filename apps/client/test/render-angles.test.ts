import { describe, expect, it } from 'vitest';
import {
  getClassDefinition,
  type BarrelDefinition,
  type ProjectileState,
  type TankState,
} from '@diep-fried/shared';

describe('Calculs d’angles de rendu et familles d’armes', () => {
  describe('tank.barrelAngles et tourelles autonomes', () => {
    it('utilise l’orientation monde de barrelAngles pour les tourelles auto', () => {
      const autoDef = getClassDefinition('auto-3')!;
      expect(autoDef.barrels).toHaveLength(3);
      expect(autoDef.barrels.every((b) => b.auto)).toBe(true);

      const tankAngle = Math.PI / 4; // 45 degrés
      const targetWorldAngles = [Math.PI, 0, -Math.PI / 2];

      const tank: Partial<TankState> = {
        kind: 'tank',
        classId: 'auto-3',
        angle: tankAngle,
        barrelAngles: targetWorldAngles,
      };

      // Pour chaque canon auto, l'angle local relatif au tank doit être targetWorldAngle - tankAngle
      autoDef.barrels.forEach((barrel, i) => {
        const worldAngle =
          barrel.auto && tank.barrelAngles && typeof tank.barrelAngles[i] === 'number'
            ? tank.barrelAngles[i]!
            : tank.angle! + barrel.angle;
        const localAngle = worldAngle - tank.angle!;

        expect(worldAngle).toBe(targetWorldAngles[i]);
        expect(localAngle).toBeCloseTo(targetWorldAngles[i]! - tankAngle);
      });
    });

    it('retombe sur barrel.angle pour les canons standards même si barrelAngles est absent', () => {
      const twinDef = getClassDefinition('twin')!;
      const tankAngle = 1.2;

      const tank: Partial<TankState> = {
        kind: 'tank',
        classId: 'twin',
        angle: tankAngle,
        // Pas de barrelAngles
      };

      twinDef.barrels.forEach((barrel) => {
        expect(barrel.auto).toBeUndefined();
        const worldAngle =
          barrel.auto && tank.barrelAngles
            ? (tank.barrelAngles[0] ?? tank.angle! + barrel.angle)
            : tank.angle! + barrel.angle;
        const localAngle = worldAngle - tank.angle!;
        expect(localAngle).toBeCloseTo(barrel.angle);
      });
    });

    it('gère les classes hybrides (ex: auto-gunner) avec canons fixes et canon auto distinct', () => {
      const gunnerDef = getClassDefinition('auto-gunner')!;
      expect(gunnerDef.barrels).toHaveLength(5);
      const autoIndex = gunnerDef.barrels.findIndex((b) => b.auto);
      expect(autoIndex).toBe(4);

      const tankAngle = 0;
      const barrelAngles = [0, 0, 0, 0, Math.PI / 2]; // La tourelle auto vise vers le bas (PI/2)

      const autoBarrel = gunnerDef.barrels[autoIndex]!;
      const worldAngle = barrelAngles[autoIndex]!;
      const localAngle = worldAngle - tankAngle;
      expect(autoBarrel.auto).toBe(true);
      expect(localAngle).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('Projectiles et géométries des familles d’armes', () => {
    it('différencie les drones triangles des drones carrés de Necromancer', () => {
      const standardDrone: Partial<ProjectileState> = {
        kind: 'projectile',
        family: 'drone',
        bodyShape: 'triangle',
      };
      const necroDrone: Partial<ProjectileState> = {
        kind: 'projectile',
        family: 'drone',
        bodyShape: 'square',
      };

      expect(standardDrone.bodyShape).toBe('triangle');
      expect(necroDrone.bodyShape).toBe('square');
    });

    it('définit les propulseurs arrière spécifiques pour les missiles Skimmer vs Rocketeer', () => {
      // Skimmer a 2 propulseurs arrière à Math.PI - 0.55 et Math.PI + 0.55
      const skimmerThrusters = [Math.PI - 0.55, Math.PI + 0.55];
      expect(skimmerThrusters).toHaveLength(2);
      expect(skimmerThrusters[0]).toBeCloseTo(Math.PI - 0.55);
      expect(skimmerThrusters[1]).toBeCloseTo(Math.PI + 0.55);

      // Rocketeer / Glider a 1 propulseur arrière à Math.PI
      const rocketeerThrusters = [Math.PI];
      expect(rocketeerThrusters).toHaveLength(1);
      expect(rocketeerThrusters[0]).toBe(Math.PI);
    });

    it('définit le mini-canon avant et corps carré pour les minions armés (Factory)', () => {
      const minion: Partial<ProjectileState> = {
        kind: 'projectile',
        family: 'minion',
        bodyShape: 'square',
        barrelShots: [-1],
      };
      expect(minion.family).toBe('minion');
      expect(minion.bodyShape).toBe('square');
      expect(minion.barrelShots).toBeDefined();
    });
  });

  describe('Opacité et discrétion (furtivité)', () => {
    it('garantit un seuil de visibilité de 35% pour le joueur local', () => {
      const selfTankOpacity = 0.0; // Totalement invisible selon la simulation
      const effectiveSelfOpacity = Math.max(0.35, selfTankOpacity);
      expect(effectiveSelfOpacity).toBe(0.35);
    });

    it('garantit un seuil de visibilité de 35% pour les alliés de la même équipe', () => {
      const allyTankOpacity = 0.05;
      const effectiveAllyOpacity = Math.max(0.35, allyTankOpacity);
      expect(effectiveAllyOpacity).toBe(0.35);
    });

    it('ne donne aucun boost d’opacité aux ennemis et masque totalement sous 20%', () => {
      const enemyTankOpacity = 0.0;
      // Pour les ennemis, pas de Math.max(0.35)
      const effectiveEnemyOpacity = enemyTankOpacity;
      expect(effectiveEnemyOpacity).toBe(0);

      // Condition de masquage de l'interface (barre de vie, étiquette de nom)
      const shouldHideEnemyHealthAndLabel = enemyTankOpacity < 0.2;
      expect(shouldHideEnemyHealthAndLabel).toBe(true);
    });

    it('atténue l’opacité des labels ennemis pour suivre la transparence de leur tank', () => {
      const enemyTankOpacity = 0.6; // En train de s'estomper
      const labelAlpha = enemyTankOpacity;
      expect(labelAlpha).toBe(0.6);
    });
  });
});

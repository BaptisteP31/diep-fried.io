import type { ClassId, StatId } from '@diep-fried/shared';

export interface BuildArchetype {
  name: string;
  preferredClasses: ClassId[];
  statOrder: StatId[];
}

export const BOT_BUILDS: BuildArchetype[] = [
  {
    name: 'twin-penta',
    preferredClasses: ['penta-shot', 'triple-shot', 'twin'],
    statOrder: [
      'bulletDamage',
      'bulletPenetration',
      'reload',
      'bulletSpeed',
      'movementSpeed',
      'maxHealth',
      'healthRegen',
      'bodyDamage',
    ],
  },
  {
    name: 'machinegun-annihilator',
    preferredClasses: ['annihilator', 'destroyer', 'machine-gun'],
    statOrder: [
      'bulletDamage',
      'bulletPenetration',
      'bulletSpeed',
      'reload',
      'movementSpeed',
      'maxHealth',
      'healthRegen',
      'bodyDamage',
    ],
  },
  {
    name: 'sniper-ranger',
    preferredClasses: ['ranger', 'assassin', 'sniper'],
    statOrder: [
      'bulletSpeed',
      'bulletDamage',
      'bulletPenetration',
      'reload',
      'movementSpeed',
      'maxHealth',
      'healthRegen',
      'bodyDamage',
    ],
  },
  {
    name: 'flank-booster',
    preferredClasses: ['booster', 'tri-angle', 'flank-guard'],
    statOrder: [
      'movementSpeed',
      'bulletDamage',
      'bulletPenetration',
      'reload',
      'maxHealth',
      'healthRegen',
      'bulletSpeed',
      'bodyDamage',
    ],
  },
  {
    name: 'triplet',
    preferredClasses: ['triplet', 'triple-shot', 'twin'],
    statOrder: [
      'bulletDamage',
      'bulletPenetration',
      'reload',
      'bulletSpeed',
      'movementSpeed',
      'maxHealth',
      'healthRegen',
      'bodyDamage',
    ],
  },
];

# Audit indépendant classes / équipes / Maze / Sandbox

Audit du 23 octobre 2026, base `c8d4e41c42228f63691861c5be024f4130daaab7`.
Cette base contient classes `2a29e1c`, équipes/Maze/Sandbox `c6f20d2` et corrections de maps `a33caad` (intégration `c8d4e41`).
Lecture seule du runtime : aucun changement de `world.ts`, des modèles, du client ou des coefficients. Les tests d'audit sont temporaires et non suivis ; seul ce rapport est destiné au commit.

## Suivi d'intégration

- Findings 3 et 4 : corrigés par le lot rendu `bd986eb`, postérieur à la base auditée (caméra Predator et angles des tourelles consommés par le renderer).
- Finding 2 : le coordinateur ajoute le dessin de la carte résolue (murs et frontières de base), avec test dédié ; minimap inchangée.
- Findings 1 et 5 : corrections intégrées depuis `e68f75b`, avec 11 tests dédiés : minions hors base vulnérables et positions ennemies totalement camouflées omises des snapshots. Le client évite déjà les fantômes de disparition des classes furtives ennemies.

## Baseline et méthode

- Consignes `/home/baptiste/.codex/RTK.md` appliquées : commandes shell via `rtk`.
- Environnement : Node `v26.12.1`, npm `12.2.1`. Dépendances initialement absentes (`vitest` et `tsc` introuvables) ; `rtk npm ci` réussit sans changement du lockfile.
- Baseline avant ajout des tests temporaires : `rtk npm test` → **25 fichiers, 330 tests réussis** ; `rtk npm run typecheck` → **réussi**.
- Repros supplémentaires : `rtk proxy npx vitest run apps/client/test/classes-teams-audit.tmp.test.ts --reporter=verbose` → **11 tests réussis**. Ces tests de caractérisation affirment le comportement défectueux observé ; leur succès ne signifie pas que les défauts sont corrigés.
- Validation finale avec les tests temporaires : `rtk npm test` → **26 fichiers, 341 tests réussis** ; `rtk npm run typecheck` → **réussi** ; formatage vérifié avec `rtk npm run format:check`. L'avertissement Node sur `localStorage` apparaît aussi dans la baseline et ne fait pas échouer les tests.
- Les scénarios utilisent `createSimulation`, `addPlayer`, `setInput`, `queueCommand`, `step`, `snapshotFor`, `prepareModeConfig`, le codec public et `Renderer.draw`. Aucun accès aux collections ou méthodes privées de World. Les fixtures niveau 45 et sans formes accélèrent la préparation ; les commandes `chooseClass` suivent les arêtes normales de l'arbre. Les repros Factory et camouflage fonctionnent avec `sandbox.cheats=false`.
- Vérification du rendu par enregistrement des appels Canvas du vrai `Renderer`, sans navigateur ni comparaison visuelle de captures.

## Findings prouvés — cinq au maximum

### 1. P1 — Factory déploie des minions invulnérables et offensifs depuis sa base

**Sources :** `packages/sim/src/world.ts:458`, `:768`, `:1135`, `:1151`.

`protectedDrone` étend la protection du propriétaire à ses drones/minions, quelle que soit leur position. `canDamage` refuse alors aussi les attaques adverses contre ces minions. Pourtant la branche Factory permet toujours un tir secondaire manuel ; la balle créée est de famille `bullet` et échappe à `protectedDrone`. Le joueur peut donc rester indéfiniment protégé dans sa base et attaquer avec des unités indestructibles en territoire neutre.

**Repro API exact :** tests `Factory : minions invulnérables...` et `Factory : même faille...` en annexe. Sur fixture resserrée, Factory reste `(200,500)` dans sa base ; l'Annihilator adverse tire sur les minions. Au tick **223**, la cible est passée de **243 à 93 PV** ; les six minions sont toujours à **98/98 PV**, à des abscisses **515,9 à 760,9**, hors de la base finissant à `x=300`. Le contrôle sans zone de base constate effectivement des minions endommagés.

**Confirmation sur layout standard :** `prepareModeConfig(resolveModeConfig('teams2', {arenaSize:'small'}), 1)`, sans carte personnalisée. Factory immobile à `(265,6636609882 ; 72,8515197872)` dans la base `x=0..450`. L'adversaire rejoint `(1000 ; 72,8515197872)` par les seuls inputs de déplacement. Il meurt au tick **704** alors qu'aucun minion n'a perdu de PV et que le propriétaire est toujours protégé. Aucune commande Sandbox n'intervient.

**Correction recommandée :** distinguer la protection temporaire de spawn de celle due à la présence physique en base. Une unité de joueur sortie de la base doit pouvoir subir des dégâts. Si une protection offensive de spawn est maintenue sur les unités, l'appliquer aussi à l'autorisation des tirs secondaires afin d'éviter ce contournement. Ajouter un test Factory/base et son contrôle vulnérable.

### 2. P1 — Les murs Maze et les zones de base ne sont pas dessinés

**Source :** `apps/client/src/render/renderer.ts:74–155` (`draw`) et `:165` (`drawOutsideArena`).

La carte est transmise au client, mais le rendu ne lit ni `config.map.walls` ni `config.map.zones`. Les collisions et sanctuaires existent côté serveur sans indication de leur géométrie sur le terrain. Un joueur Maze heurte donc des murs invisibles ; en équipes il ne voit pas les frontières des bases.

**Repro API exact :** test `Maze et bases : ajouter des obstacles...`. Avec une caméra centrée en `(200,500)`, le mur `(400,0,20,1000)` et la base de gauche sont dans la fenêtre affichée. Dessiner le même snapshot avec cette carte puis avec `{walls:[],zones:[]}` produit **exactement les mêmes appels et affectations Canvas**, sur deux renderers neufs.

**Correction recommandée :** dessiner les zones et murs de la carte résolue en coordonnées monde, sous les entités, et représenter les frontières protégées. Aucun changement de collision ou de coefficient n'est nécessaire.

### 3. P2 — Predator décale l'intérêt serveur mais pas la caméra affichée

**Sources :** `packages/sim/src/world.ts:517–522`, `:1396–1397` ; `apps/client/src/render/renderer.ts:77–85`.

Le serveur publie bien `cameraOffset` et centre son filtrage des entités sur ce décalage. `Renderer.draw` centre toujours la caméra sur les coordonnées du tank. Alt ne produit donc pas le déplacement optique attendu ; les fenêtres de visibilité serveur et client divergent.

**Repro API exact :** test `caméra Predator...`. Après `Tank → Sniper → Hunter → Predator`, input `{alt:true,aim:{x:1,y:0}}`, un tick : le snapshot porte `{cameraOffset:{x:650,y:0}}`. Le vrai `Renderer.draw(snapshot,config,0)` donne pourtant `renderer.camera.center === {x:tank.x,y:tank.y}` au lieu de `{x:tank.x+650,y:tank.y}`. L'élargissement FOV ordinaire est, lui, transmis et utilisé via `self.view`.

**Correction recommandée :** centrer le client sur le tank plus son `cameraOffset`, avec la même convention que `snapshotFor`, puis vérifier recentrage au relâchement et changement de classe. Le serveur produit ici la donnée attendue ; le défaut est sa consommation côté client.

### 4. P2 — Les tourelles automatiques sont dessinées dans une autre direction que leurs tirs

**Sources :** `packages/sim/src/world.ts:479–487`, `:1424–1425` ; `apps/client/src/render/renderer.ts:230–237`.

Le serveur calcule et publie des `barrelAngles` absolus pour les canons autonomes. Le client les ignore et dessine chaque canon avec `tank.angle + definition.barrels[i].angle`. Les balles partent correctement vers la cible serveur, mais pas selon les canons affichés.

**Repro API exact :** test `auto-tank...`. Deux adversaires horizontaux, Auto Tank visant verticalement après expiration des protections : `tank.angle = π/2`, `barrelAngles = [0,0,0,0]`. Les rotations Canvas enregistrées sont pourtant `[π/2,0,π/2,π,3π/2]` : rotation du corps puis géométries statiques. Le premier canon affiché pointe à `π/2` alors que son tir part à `0`.

**Correction recommandée :** utiliser l'angle serveur absolu de chaque canon quand il existe ; sous la rotation actuelle du corps, appliquer `barrelAngles[i] - tank.angle`. Garder la géométrie relative comme repli pour les classes sans angles publiés et interpoler les angles via le chemin angulaire court.

### 5. P2 — Le camouflage laisse les positions exactes dans les snapshots ennemis

**Source :** `packages/sim/src/world.ts:1390–1427` (`snapshotFor`).

Le filtrage de visibilité dépend de la distance mais pas du camouflage. Un client adverse reçoit encore l'identité, la classe, les coordonnées exactes et les PV d'un tank à `opacity=0`. Le client standard le masque visuellement ; un client modifié peut simplement ignorer l'opacité et le suivre/cibler. Ce finding concerne la divulgation réseau, pas une incapacité du fondu à fonctionner dans le client standard.

**Repro API exact :** test `stealth : positions exactes...`. Pour chacun de `Stalker`, `Manager`, `Landmine`, choisir la classe par l'arbre normal et attendre **500 ticks** immobile. `snapshotFor(1)` donne bien une opacité nulle. `snapshotFor(2).entities` contient néanmoins le même tank, avec `x` et `y` strictement identiques. Aucun pouvoir Sandbox ni accès mémoire serveur n'est nécessaire.

**Correction recommandée :** au seuil d'invisibilité totale, omettre le tank des snapshots adverses tout en le conservant dans la simulation autoritaire pour les collisions et tirs manuels. Préserver l'état propre du joueur et la politique alliée choisie. Éviter également qu'une suppression pour camouflage ne déclenche un fondu de disparition révélant encore la position.

## Contrôles sans finding supplémentaire

- **Évolutions / tirs :** les 54 classes sont atteignables à niveau 45 via leurs arêtes normales. Tous les canons productifs sont observés en tir ; les canons `conversionOnly` de Necromancer et les classes de contact sont traités selon leur fonctionnement prévu. Les tirs autonomes émis dès le tick du changement de classe sont inclus dans le relevé.
- **Caps / points :** matrice indépendante **54 classes × 8 stats** ; 20 demandes par statistique ne dépassent pas le cap et la réserve reste `33 - points dépensés`. Aucun dépassement reproduit. Baseline : remboursement Smasher des quatre stats de tir, caps corps à 10 et Auto Smasher à 7 pour le tir réussissent.
- **Necromancer :** baseline conversion unique avec exactement 10 XP, amorçage contact, infection et plafonds `14 + 4 × Reload` à Reload 0/7 réussis ; aucun duplicata ou emballement de conversion reproduit.
- **Factory / nettoyage :** baseline population 6, tirs des minions, suppression des unités à mort/changement de classe/déconnexion réussis. Le finding 1 concerne leur protection hors base, pas un dépassement de population.
- **Tirs alliés / bases :** tests existants de non-dégâts alliés, protection de base et gardes réussis. Matrice supplémentaire sur Tank, Overseer, Factory, Necromancer, Skimmer, Rocketeer, Glider, Firework et Tri-Trapper : aucun projectile observé pénétrant la base adverse ni dégât à son occupant. Necromancer n'a pas de carrés dans cette fixture : cette entrée ne prouve pas un essaim converti contre la base ; les drones productibles sont couverts par Overseer/Factory.
- **Maze :** baseline LoS des tourelles, drones/minions bloqués, sortie des canons près d'un mur fin et projectiles rapides arrêtés réussis. Contrôle supplémentaire : **12 graines**, **32 joueurs**, 60 formes par carte ; tous les corps visibles aux joueurs au spawn sont hors murs. Puis 100 ticks de tirs par graine, en alternant Skimmer/Rocketeer/Glider/Firework : aucune pénétration observée. Aucun contournement/infiltration reproduit dans cet échantillon ; ce n'est pas une preuve exhaustive de toute géométrie.
- **Sandbox / FFA :** les options JSON forgées `options.sandbox.cheats=true` et `options.cheats=true` sont éliminées par le codec. Les quatre commandes Sandbox restent sans effet en FFA, god compris. Baseline : refus avec `cheats=false` dans les cinq modes et réinitialisation du god à mort/respawn réussis.
- **Équipe au respawn :** tests existants de répartition 2/4 équipes, conservation du camp après suicide/respawn et réutilisation du camp libéré réussis. La reprise réseau garde le siège et le même joueur de simulation à la lecture de `Room.resume` ; pas de nouveau test de reconnexion bout en bout ajouté ici.
- **Crash / coût :** aucun crash, état non fini ou boucle non bornée reproduit avec les scénarios autorisés exécutés. Pas de benchmark de charge exhaustive à 32 joueurs et 512 projectiles par propriétaire ; ne pas interpréter cela comme une garantie de performance ou de fidélité parfaite.

## Rejouer les preuves

Le fichier temporaire de ce worktree est `apps/client/test/classes-teams-audit.tmp.test.ts` (non commité). La copie exacte ci-dessous permet de le recréer dans un autre checkout sans dépendre d'un artefact non suivi. Exécuter ensuite :

```sh
rtk npm ci
rtk proxy npx vitest run apps/client/test/classes-teams-audit.tmp.test.ts --reporter=verbose
```

<details>
<summary>Source TypeScript autonome des 11 tests temporaires</summary>

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  CLASS_DEFINITIONS,
  STAT_IDS,
  decodeClientMessage,
  resolveModeConfig,
  type ModeConfig,
  type PlayerInput,
  type TankState,
  type ProjectileState,
} from '@diep-fried/shared';
import { createSimulation, prepareModeConfig, type Simulation } from '../../../packages/sim/src';
import { circleVsWalls } from '../../../packages/sim/src/maps';
import { Renderer } from '../src/render/renderer';

function own(s: Simulation, id = 1): TankState {
  const snap = s.snapshotFor(id)!;
  const t = snap.entities.find((e) => e.id === snap.self.entityId);
  if (t?.kind !== 'tank') throw Error(`dead player ${id} tick ${s.tick}`);
  return t;
}
function shots(s: Simulation, id = 1): ProjectileState[] {
  return s.snapshotFor(id)!.entities.filter((e): e is ProjectileState => e.kind === 'projectile');
}
function input(s: Simulation, id = 1, patch: Partial<PlayerInput> = {}) {
  s.setInput(id, {
    seq: s.tick + 1,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    alt: false,
    ...patch,
  });
}
function step(s: Simulation, n: number) {
  for (let i = 0; i < n; i++) s.step();
}
function choose(s: Simulation, target: string, id = 1) {
  const path = (at: string): string[] | undefined => {
    if (at === target) return [];
    for (const child of CLASS_DEFINITIONS[at]!.upgradesTo) {
      const tail = path(child);
      if (tail) return [child, ...tail];
    }
  };
  for (const classId of path('tank')!) s.queueCommand(id, { type: 'chooseClass', classId });
  s.step();
  expect(s.snapshotFor(id)!.self.classId).toBe(target);
}
function duel(): ModeConfig {
  const c = resolveModeConfig('teams2');
  c.progression.startLevel = 45;
  c.shapes.targetCount = 0;
  c.arena = { width: 2000, height: 1000 };
  c.map.zones = [
    { kind: 'base', team: 1, area: { x: 0, y: 0, width: 300, height: 1000 } },
    { kind: 'spawn', team: 1, area: { x: 175, y: 475, width: 50, height: 50 } },
    { kind: 'base', team: 2, area: { x: 1700, y: 0, width: 300, height: 1000 } },
    { kind: 'spawn', team: 2, area: { x: 725, y: 475, width: 50, height: 50 } },
  ];
  return c;
}
function create(c: ModeConfig, players = 2): Simulation {
  const s = createSimulation({ config: c, seed: 1 });
  for (let id = 1; id <= players; id++) s.addPlayer(id, { name: `P${id}` });
  s.step();
  return s;
}

describe('audit temporaire — preuves, pas corrections', () => {
  it('54 classes × 8 stats : caps et 33 points sans dépassement', () => {
    for (const classId of Object.keys(CLASS_DEFINITIONS))
      for (const stat of STAT_IDS) {
        const c = resolveModeConfig('ffa');
        c.progression.startLevel = 45;
        c.shapes.targetCount = 0;
        const s = create(c, 1);
        choose(s, classId);
        for (let i = 0; i < 20; i++) s.queueCommand(1, { type: 'upgradeStat', stat });
        s.step();
        const self = s.snapshotFor(1)!.self;
        expect(self.stats[stat], `${classId} ${stat}`).toBe(self.statCaps[stat]);
        expect(self.statPoints).toBe(33 - self.stats[stat]);
      }
  });

  it('FFA : options de triche forgées éliminées et commandes sandbox sans effet', () => {
    const decoded = decodeClientMessage(
      JSON.stringify({
        t: 'room.create',
        name: 'x',
        mode: 'ffa',
        options: { sandbox: { cheats: true }, cheats: true },
      }),
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || decoded.message.t !== 'room.create') throw Error('bad fixture');
    const s = create(resolveModeConfig(decoded.message.mode, decoded.message.options), 1);
    step(s, 100);
    const before = s.snapshotFor(1)!.self;
    for (const action of ['toggleGod', 'levelUp', 'cycleClass', 'selfDestruct'] as const)
      s.queueCommand(1, { type: 'sandbox', action });
    s.step();
    expect(s.snapshotFor(1)!.self).toEqual(before);
    expect(own(s).spawnProtected).toBe(false);
  });

  it('base adverse : aucune infiltration tirs, drones ou missiles sur 9 classes', () => {
    for (const classId of [
      'tank',
      'overseer',
      'factory',
      'necromancer',
      'skimmer',
      'rocketeer',
      'glider',
      'firework',
      'tri-trapper',
    ]) {
      const c = duel();
      c.map.zones.find((z) => z.kind === 'spawn' && z.team === 1)!.area.x = 1425;
      c.map.zones.find((z) => z.kind === 'spawn' && z.team === 2)!.area.x = 1775;
      const s = create(c);
      choose(s, classId);
      input(s, 1, { fire: true, aim: { x: 500, y: 0 } });
      for (let i = 0; i < 180 && s.snapshotFor(1)!.self.alive; i++) {
        s.step();
        const target = own(s, 2);
        expect(target.health).toBe(target.maxHealth);
        for (const p of shots(s).filter((p) => p.team === 1))
          expect(p.x + p.radius).toBeLessThanOrEqual(1700 + 1e-5);
      }
    }
  });

  it('54 classes : évolutions normales et activation de tous les canons productifs', () => {
    for (const [id, def] of Object.entries(CLASS_DEFINITIONS)) {
      const c = duel();
      c.map.zones = c.map.zones.filter((z) => z.kind !== 'base');
      const s = create(c);
      step(s, 91);
      choose(s, id);
      input(s, 1, { fire: true, aim: { x: 550, y: 0 } });
      const fired = new Set<number>();
      own(s).barrelShots.forEach((tick, index) => {
        if (tick >= 0) fired.add(index);
      });
      for (let n = 0; n < 70; n++) {
        s.step();
        own(s).barrelShots.forEach((tick, index) => {
          if (tick === s.tick) fired.add(index);
        });
      }
      for (let i = 0; i < def.barrels.length; i++)
        if (!def.barrels[i]!.conversionOnly) expect(fired.has(i), `${id} canon ${i}`).toBe(true);
    }
  });

  it('Maze : 12 graines, 32 joueurs, spawns et missiles hors murs', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const c = prepareModeConfig(
        resolveModeConfig('maze', { arenaSize: 'small', maxPlayers: 32 }),
        seed,
      );
      c.progression.startLevel = 45;
      c.shapes.targetCount = 60;
      const s = createSimulation({ config: c, seed });
      for (let id = 1; id <= 32; id++) s.addPlayer(id, { name: `P${id}` });
      s.step();
      for (let id = 1; id <= 32; id++)
        for (const body of s.snapshotFor(id)!.entities)
          expect(
            circleVsWalls(body.x, body.y, body.radius, c.map.walls),
            `seed ${seed} entity ${body.id}`,
          ).toBe(false);
      choose(s, ['skimmer', 'rocketeer', 'glider', 'firework'][(seed - 1) % 4]!);
      input(s, 1, { fire: true, aim: { x: 700, y: 300 } });
      for (let n = 0; n < 100; n++) {
        s.step();
        for (const body of s.snapshotFor(1)!.entities)
          expect(
            circleVsWalls(body.x, body.y, body.radius, c.map.walls),
            `seed ${seed} tick ${s.tick} entity ${body.id}`,
          ).toBe(false);
      }
    }
  });

  it('stealth : positions exactes diffusées aux adversaires malgré opacity=0', () => {
    for (const classId of ['stalker', 'manager', 'landmine']) {
      const c = duel();
      c.map.zones = c.map.zones.filter((z) => z.kind !== 'base');
      const s = create(c);
      choose(s, classId);
      step(s, 500);
      const hidden = own(s);
      expect(hidden.opacity).toBe(0);
      const leaked = s.snapshotFor(2)!.entities.find((e) => e.id === hidden.id);
      expect(leaked?.kind).toBe('tank');
      expect(leaked).toMatchObject({ x: hidden.x, y: hidden.y, opacity: 0 });
    }
  });

  it('Factory : minions invulnérables hors base mais balles secondaires offensives', () => {
    const s = create(duel());
    choose(s, 'factory');
    choose(s, 'annihilator', 2);
    for (let i = 0; i < 7; i++) s.queueCommand(2, { type: 'upgradeStat', stat: 'maxHealth' });
    step(s, 100);
    let offensive = false,
      hitMinion = false,
      minionsOutside = false;
    const ids = new Set<number>();
    for (let i = 0; i < 120 && s.snapshotFor(2)!.self.alive; i++) {
      const a = own(s),
        b = own(s, 2);
      const minions = shots(s).filter((p) => p.family === 'minion');
      minionsOutside ||= minions.some((p) => p.x - p.radius > 300);
      input(s, 1, { fire: true, aim: { x: 550, y: 0 } });
      const target = minions.find((p) => p.x > 450) ?? a;
      input(s, 2, { fire: true, aim: { x: target.x - b.x, y: target.y - b.y } });
      s.step();
      offensive ||= own(s, 2).health < b.health;
      for (const m of shots(s).filter((p) => p.family === 'minion')) {
        ids.add(m.id);
        hitMinion ||= m.health! < m.maxHealth!;
      }
      expect(own(s).spawnProtected).toBe(true);
    }
    console.log('FACTORY', {
      tick: s.tick,
      offensive,
      hitMinion,
      minionsOutside,
      ids: [...ids],
      enemyHP: own(s, 2).health,
      minions: shots(s)
        .filter((p) => p.family === 'minion')
        .map((p) => ({ id: p.id, x: p.x, y: p.y, h: p.health, max: p.maxHealth })),
    });
    expect(minionsOutside).toBe(true);
    expect(offensive).toBe(true);
    expect(hitMinion).toBe(false);

    // Même API et mêmes tirs adverses, sans la protection de base : les minions perdent de la vie.
    const exposed = duel();
    exposed.map.zones = exposed.map.zones.filter((z) => z.kind !== 'base');
    const control = create(exposed);
    choose(control, 'factory');
    choose(control, 'annihilator', 2);
    for (let i = 0; i < 7; i++) control.queueCommand(2, { type: 'upgradeStat', stat: 'maxHealth' });
    step(control, 100);
    let damaged = false;
    for (let i = 0; i < 120 && control.snapshotFor(2)!.self.alive; i++) {
      const a = own(control),
        b = own(control, 2);
      const target = shots(control).find((p) => p.family === 'minion' && p.x > 450) ?? a;
      input(control, 1, { fire: true, aim: { x: 550, y: 0 } });
      input(control, 2, { fire: true, aim: { x: target.x - b.x, y: target.y - b.y } });
      control.step();
      damaged ||= shots(control).some((p) => p.family === 'minion' && p.health! < p.maxHealth!);
    }
    expect(damaged).toBe(true);
  });

  it('Factory : même faille sur le layout teams2 standard, ennemi sorti de sa base par déplacement', () => {
    const c = prepareModeConfig(resolveModeConfig('teams2', { arenaSize: 'small' }), 1);
    c.progression.startLevel = 45;
    c.shapes.targetCount = 0;
    const s = create(c);
    choose(s, 'factory');
    choose(s, 'annihilator', 2);
    for (let i = 0; i < 7; i++) s.queueCommand(2, { type: 'upgradeStat', stat: 'maxHealth' });
    const base = c.map.zones.find((z) => z.kind === 'base' && z.team === own(s).team)!;
    const destination = { x: base.area.x + base.area.width + 550, y: own(s).y };
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    for (let i = 0; i < 600; i++) {
      const b = own(s, 2);
      input(s, 2, {
        move: { x: clamp((destination.x - b.x) / 50), y: clamp((destination.y - b.y) / 50) },
      });
      s.step();
    }
    expect(Math.hypot(own(s, 2).x - destination.x, own(s, 2).y - destination.y)).toBeLessThan(1);
    let offensive = false,
      hurt = false;
    for (let i = 0; i < 120 && s.snapshotFor(2)!.self.alive; i++) {
      const a = own(s),
        b = own(s, 2);
      const target =
        shots(s).find((p) => p.family === 'minion' && p.x > base.area.width + 100) ?? a;
      input(s, 1, { fire: true, aim: { x: b.x - a.x, y: b.y - a.y } });
      input(s, 2, { fire: true, aim: { x: target.x - b.x, y: target.y - b.y } });
      s.step();
      offensive ||= !s.snapshotFor(2)!.self.alive || own(s, 2).health < b.health;
      hurt ||= shots(s).some((p) => p.family === 'minion' && p.health! < p.maxHealth!);
      expect(own(s).spawnProtected).toBe(true);
    }
    expect(offensive).toBe(true);
    expect(hurt).toBe(false);
    console.log('FACTORY_STANDARD', {
      tick: s.tick,
      base,
      owner: { x: own(s).x, y: own(s).y },
      destination,
      enemyAlive: s.snapshotFor(2)!.self.alive,
    });
  });

  it('caméra Predator : état serveur reçu mais décalage ignoré par Renderer.draw', () => {
    const c = resolveModeConfig('sandbox');
    c.shapes.targetCount = 0;
    c.progression.startLevel = 45;
    const s = create(c, 1);
    choose(s, 'predator');
    input(s, 1, { alt: true });
    s.step();
    const snap = s.snapshotFor(1)!,
      t = own(s);
    const ops: unknown[][] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_o, key) =>
          (...args: unknown[]) =>
            ops.push([key, ...args]),
        set: () => true,
      },
    );
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const r = new Renderer({
      getContext: () => ctx,
      clientWidth: 1200,
      clientHeight: 800,
    } as unknown as HTMLCanvasElement);
    r.resize();
    r.draw(snap, s.config, 0);
    expect(t.cameraOffset).toEqual({ x: 650, y: 0 });
    expect(r.camera!.center).toEqual({ x: t.x, y: t.y });
    expect(r.camera!.center.x).not.toBe(t.x + t.cameraOffset!.x);
    vi.unstubAllGlobals();
  });

  it('Maze et bases : ajouter des obstacles visibles à config ne change aucune opération Canvas', () => {
    const c = duel();
    c.map.walls = [{ x: 400, y: 0, width: 20, height: 1000 }];
    const s = create(c),
      snap = s.snapshotFor(1)!;
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const render = (config: ModeConfig) => {
      const ops: unknown[][] = [];
      const ctx = new Proxy(
        {},
        {
          get:
            (_o, key) =>
            (...args: unknown[]) =>
              ops.push([key, ...args]),
          set: (_o, key, value) => {
            ops.push(['set', key, value]);
            return true;
          },
        },
      );
      const r = new Renderer({
        getContext: () => ctx,
        clientWidth: 1200,
        clientHeight: 800,
      } as unknown as HTMLCanvasElement);
      r.resize();
      r.draw(snap, config, 0);
      return ops;
    };
    expect(render(c)).toEqual(render({ ...c, map: { walls: [], zones: [] } }));
    vi.unstubAllGlobals();
  });

  it('auto-tank : les angles serveur des tourelles ne sont pas utilisés au dessin', () => {
    const c = duel();
    c.map.zones = c.map.zones.filter((z) => z.kind !== 'base');
    const s = create(c);
    choose(s, 'auto-tank');
    step(s, 100);
    input(s, 1, { aim: { x: 0, y: 1 } });
    s.step();
    const t = own(s),
      snap = s.snapshotFor(1)!;
    expect(t.barrelAngles).toBeDefined();
    expect(t.barrelAngles![0]).not.toBeCloseTo(t.angle, 3);
    const rotations: number[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_o, key) =>
          (...args: unknown[]) => {
            if (key === 'rotate') rotations.push(args[0] as number);
          },
        set: () => true,
      },
    );
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const r = new Renderer({
      getContext: () => ctx,
      clientWidth: 1200,
      clientHeight: 800,
    } as unknown as HTMLCanvasElement);
    r.resize();
    r.draw({ ...snap, entities: [t] }, s.config, 0);
    expect(rotations).toEqual([
      t.angle,
      ...CLASS_DEFINITIONS['auto-tank']!.barrels.map((b) => b.angle),
    ]);
    console.log('AUTO', {
      bodyAngle: t.angle,
      serverAngles: t.barrelAngles,
      renderRotations: rotations,
    });
    vi.unstubAllGlobals();
  });
});
```

</details>

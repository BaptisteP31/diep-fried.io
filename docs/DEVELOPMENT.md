# Développement de diep-fried.io

Objectif : jeu autonome open source et auto-hébergeable inspiré du gameplay classique de Diep.io, avec salons privés, progression, classes, équipes et modes à objectifs. Pas de dépendance aux services du jeu original, à sa boutique ou à ses ressources propriétaires.

## Jalons

1. Contrats, socle TypeScript et critères d'acceptation.
2. Partie privée FFA/Sandbox : connexion, déplacement, tirs, formes, santé, score, mort et réapparition.
3. Progression, classes et familles d'armes complètes.
4. Équipes, Maze et modes à objectifs, IA et boss.
5. Fidélité, interface complète, stabilité et auto-hébergement.

## Organisation

`main` conserve les jalons validés ; `integration` reçoit les changements relus. Une tâche d'implémentation utilise une branche et un worktree dédiés. Les agents livrent des commits et leur validation au coordinateur, qui intègre les dépendances dans l'ordre. Les constantes proposées sont distinguées des observations vérifiées.

Les références locales `docs/research/asset-collection/reference-only/` sont ignorées par Git. Seuls les assets dont la redistribution est établie sont intégrés à la production, avec leurs licences.

## Démarrage

Node ≥ 22.12 et npm sont requis.

```bash
npm ci          # installation à partir du lockfile
npm run dev     # serveur :8080 et client :5173 (http://localhost:5173)
npm run check   # typecheck, tests et format
npm run build && npm start   # version auto-hébergée sur :8080
```

## État

Jalon 1 : socle TypeScript, contrats partagés, serveur de salons et client Canvas minimal avec une simulation provisoire. Architecture, API et critères du jalon 2 : [architecture.md](architecture.md).

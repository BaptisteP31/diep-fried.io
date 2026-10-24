# Interface utilisateur des options de bots (diep-fried.io)

Ce document décrit l'implémentation des réglages de bots pour les salons privés côté client (`apps/client/`), le contrat de données local et les limites de validation.

## 1. Contrat et types locaux

En attendant la fusion par l'agent parent des extensions du contrat partagé (`@diep-fried/shared`), le client utilise une intersection additive stricte :

```ts
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type RoomBotOptions = {
  botCount?: number;
  botDifficulty?: BotDifficulty;
};

export type ClientRoomOptions = RoomOptions & RoomBotOptions;

export type ClientModeConfig = ModeConfig & {
  bots?: {
    count: number;
    difficulty: BotDifficulty;
  };
};
```

Cette structure garantit :

- L'absence de régression ou de dépendance bloquante envers la branche du sous-agent backend.
- L'absence de `any` ou de suppressions TypeScript (`@ts-ignore`).
- Une fusion transparente sans conflit lorsque `RoomOptions` et `ModeConfig` seront complétés en amont.

## 2. Options de création de salon

Dans le formulaire de création de salon (`#menu`), deux nouveaux champs sont intégrés dans la grille responsive `.room-option-fields` :

1. **Nombre de bots** (`#menu-bot-count`) :
   - Entier de `0` à `12`.
   - Valeur par défaut : `5`.
   - Valeur `0` : autorise explicitement une partie sans bots.
   - Champ vide : ne force pas `0`, laisse le serveur appliquer son préréglage éventuel.

2. **Difficulté des bots** (`#menu-bot-difficulty`) :
   - Choix : `Facile` (`easy`), `Normale` (`normal`, sélectionné par défaut), `Difficile` (`hard`).

3. **Validation et parsing** (`parseRoomOptions`) :
   - Reste 100 % rétrocompatible avec les appels à 3 arguments.
   - Contrôle strict des entiers et des énumérations ; aucune correction silencieuse de valeur corrompue.
   - Vérifie que `botCount <= maxPlayers - 1` si `maxPlayers` est spécifié (le joueur humain créateur occupant au moins 1 place).
   - En cas d'erreur de saisie, le message d'erreur est affiché dans `#menu-status` et le focus clavier est placé sur le champ incriminé.

## 3. Dynamique de capacité et remplacement

- **Capacité globale** : `maxPlayers` compte l'ensemble des tanks connectés (humains + bots).
- **Adaptation de la borne** : la saisie de `maxPlayers` ajuste dynamiquement `menu-bot-count.max` à `Math.min(12, Math.max(0, maxPlayers - 1))`, et réajuste immédiatement la valeur courante de `menu-bot-count` si elle dépassait la nouvelle borne.
- **Remplacement** : l'aide sous le formulaire (`#menu-bots-help`) précise que les amis qui rejoignent le salon par code remplacent automatiquement les bots si la capacité maximale est atteinte.
- **Modes à objectifs** : la description des modes exigeant un minimum de participants (`minPlayers: 2`) mentionne explicitement que les bots comptent dans l'effectif et permettent de lancer une manche seul humain.

## 4. Transmission réseau et protocole

- Les options sont transmises via `MenuActions.create(name, mode, options)` et `GameConnection.enter({ t: 'room.create', name, mode, options })`.
- Le message JSON WebSocket émis conserve l'intégralité des champs `botCount` et `botDifficulty` dans `options` sans perte ni altération.
- Aucun changement n'est apporté au format des commandes en jeu ni aux intentions périodiques (`input`, `PlayerInput`).

## 5. Indication en jeu et leaderboard

- **Bandeau HUD** : un élément dédié (`#hud-bots`) affiche `'Bots : 5 · Normale'` (ou `'Bots : 0'`) dès la réception de `room.joined` avec `config.bots`.
- **Sémantique cible** : cette indication reflète la configuration cible définie pour le salon, et ne prétend pas représenter le décompte instantané exact des bots actuellement en vie ou en cours de réapparition.
- **Leaderboard** : les bots sont identifiés par le préfixe conventionnel `[BOT]` généré par le serveur dans leur pseudonyme. Le client affiche fidèlement les noms du classement sans inventer de badge d'identité certifiée (évitant ainsi de marquer faussement un vrai joueur ayant un nom approchant).
- **Aucun admin runtime** : aucune interface en cours de jeu ne permet d'ajouter/retirer des bots ou de modifier leur difficulté en direct (non demandé par les spécifications).

## 6. Accessibilité

- Tous les nouveaux champs disposent de libellés `<label>`, de types sémantiques (`number`, `select`) et de descriptions associées (`aria-describedby="menu-bots-help"`).
- La navigation au clavier (Tabulation, Entrée, flèches) et la gestion du focus d'erreur sont assurées.
- La grille CSS utilise `grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr))` pour conserver un rendu responsive sur mobile et écrans étroits.

## 7. Limites et qualification (QA)

- **Backend initial sans bots** : le serveur local de cette branche n'a pas encore reçu l'implémentation complète de la simulation des bots menée par l'autre agent dans son propre périmètre.
- **Périmètre des tests locaux** :
  - Validation complète de `parseRoomOptions` (compatibilité 3 arguments, valeurs 0..12, gestion des chaînes vides, rejets des valeurs hors limites, plafonnement relatif à `maxPlayers`).
  - Validation du comportement DOM du menu, de l'adaptation dynamique des bornes et du placement de focus.
  - Validation de la sérialisation JSON WebSocket par `GameConnection`.
  - Validation de l'affichage et de la réinitialisation de l'indication HUD.
- **Intégration finale** : le test de gameplay en temps réel avec IA active et remplacement des bots par des joueurs humains sera exécuté par l'agent parent après réconciliation des deux branches.

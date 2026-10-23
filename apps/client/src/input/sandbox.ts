import type { ModeConfig, PlayerCommand } from '@diep-fried/shared';

export type SandboxAction = Extract<PlayerCommand, { type: 'sandbox' }>['action'];
export const SANDBOX_ACTIONS: ReadonlyArray<{ action: SandboxAction; label: string }> = [
  { action: 'levelUp', label: 'Gagner un niveau' },
  { action: 'cycleClass', label: 'Classe suivante' },
  { action: 'selfDestruct', label: 'Autodestruction' },
  { action: 'toggleGod', label: 'Basculer l’invulnérabilité' },
];

/** Garde commune aux boutons et raccourcis. Le serveur décide de l’effet réel. */
export class SandboxCommands {
  private lastLevelAt = -Infinity;

  constructor(
    private readonly context: () => { config: ModeConfig | null; alive: boolean; blocked: boolean },
    private readonly send: (command: PlayerCommand) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get available(): boolean {
    const { config, alive, blocked } = this.context();
    return config?.mode === 'sandbox' && config.sandbox.cheats && alive && !blocked;
  }

  run(action: SandboxAction): void {
    if (!this.available) return;
    if (action === 'levelUp') {
      const now = this.now();
      // Au plus huit montées par seconde, même avec répétition clavier ou clics rapides.
      if (now - this.lastLevelAt < 125) return;
      this.lastLevelAt = now;
    }
    this.send({ type: 'sandbox', action });
  }

  reset(): void {
    this.lastLevelAt = -Infinity;
  }
}

import type { ModeConfig } from '@diep-fried/shared';
import { formatKeyCode, type KeyBindings } from '../input/bindings';
import { SANDBOX_ACTIONS, type SandboxCommands } from '../input/sandbox';

export class SandboxPanel {
  private readonly panel = document.getElementById('sandbox-panel')!;
  private readonly buttons: HTMLButtonElement[] = [];

  constructor(private readonly commands: SandboxCommands) {
    for (const { action } of SANDBOX_ACTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', () => commands.run(action));
      this.buttons.push(button);
      this.panel.appendChild(button);
    }
  }

  setBindings(bindings: KeyBindings): void {
    SANDBOX_ACTIONS.forEach(({ action, label }, index) => {
      const keys = Object.entries(bindings)
        .filter(([, binding]) => binding.kind === 'sandbox' && binding.action === action)
        .map(([code]) => formatKeyCode(code));
      this.buttons[index]!.textContent = `${label} (${keys.join(', ') || 'sans raccourci'})`;
    });
  }

  sync(config: ModeConfig | null): void {
    this.panel.hidden = config?.mode !== 'sandbox' || !config.sandbox.cheats;
    for (const button of this.buttons) button.disabled = !this.commands.available;
  }
}

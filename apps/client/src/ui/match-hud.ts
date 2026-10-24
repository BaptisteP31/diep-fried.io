import {
  getSpecialClassDefinition,
  type ModeConfig,
  type SnapshotPayload,
} from '@diep-fried/shared';
import { formatKeyCode, type KeyBindings } from '../input/bindings';
import { TEAM_COLORS } from '../render/palette';
import { matchHeading, objectiveLabel, objectiveText, scoreText, teamName } from './match-model';
import { modeDetails } from './modes';

/** Présentation des états reçus ; les commandes restent validées par le serveur. */
export class MatchHud {
  private readonly panel = document.getElementById('match-hud')!;
  private readonly title = document.getElementById('match-title')!;
  private readonly phase = document.getElementById('match-phase')!;
  private readonly scores = document.getElementById('match-scores')!;
  private readonly objectives = document.getElementById('match-objectives')!;
  private readonly possess = document.getElementById('match-possess') as HTMLButtonElement;
  private readonly notices = document.getElementById('game-notices')!;
  private previous: SnapshotPayload | undefined;
  private seenBosses = new Set<number>();
  private messages: { text: string; expires: number }[] = [];
  private possessKeys = 'H';
  private objectiveKey = '';

  constructor(onPossess: () => void) {
    this.possess.addEventListener('click', onPossess);
  }

  setBindings(bindings: KeyBindings): void {
    this.possessKeys =
      Object.entries(bindings)
        .filter(([, a]) => a.kind === 'toggle' && a.action === 'possess')
        .map(([key]) => formatKeyCode(key))
        .join(', ') || 'sans raccourci';
  }

  reset(): void {
    this.panel.hidden = true;
    this.notices.hidden = true;
    this.previous = undefined;
    this.seenBosses.clear();
    this.messages = [];
    this.objectiveKey = '';
    this.objectives.replaceChildren();
  }

  notify(text: string, now = performance.now()): void {
    this.messages.push({ text, expires: now + 5000 });
    this.messages = this.messages.slice(-3);
    this.renderNotices(now);
  }

  renderNotices(now: number): void {
    this.messages = this.messages.filter((m) => m.expires > now);
    this.notices.textContent = this.messages.map((m) => m.text).join('\n');
    this.notices.hidden = !this.messages.length;
  }

  update(snapshot: SnapshotPayload, config: ModeConfig): void {
    const match = snapshot.match;
    const before = this.previous?.match;
    if (before && match && before.round !== match.round) this.seenBosses.clear();
    for (const entity of snapshot.entities) {
      if (
        entity.kind !== 'tank' ||
        getSpecialClassDefinition(entity.classId)?.role !== 'boss' ||
        this.seenBosses.has(entity.id)
      )
        continue;
      this.seenBosses.add(entity.id);
      this.notify(`Boss visible : ${entity.name}`);
    }
    if (match && before) {
      if (match.phase !== before.phase || match.round !== before.round)
        this.notify(matchHeading(match, config, snapshot.tick));
      if (match.round === before.round)
        for (const objective of match.objectives) {
          const old = before.objectives.find((o) => o.id === objective.id);
          if (
            old &&
            (old.team !== objective.team ||
              old.flag?.status !== objective.flag?.status ||
              old.possessedBy !== objective.possessedBy)
          ) {
            this.notify(
              `${objectiveLabel(objective)} · ${objectiveText(objective, config, snapshot.tick)}`,
            );
          }
        }
      if (this.previous?.self.possessing !== snapshot.self.possessing)
        this.notify(
          snapshot.self.possessing !== undefined
            ? 'Contrôle de l’objectif confirmé'
            : 'Contrôle de votre tank rétabli',
        );
      if (this.previous?.self.spectator !== snapshot.self.spectator && snapshot.self.spectator)
        this.notify('Spectateur · retour au prochain round');
    }
    this.previous = snapshot;
    this.panel.hidden = !match;
    if (!match) return;
    this.title.textContent = `${modeDetails(config.mode).label} · Manche ${match.round}`;
    this.phase.textContent = matchHeading(match, config, snapshot.tick);
    this.panel.dataset.phase = match.phase;
    this.scores.textContent = scoreText(match, config);
    const rows = match.objectives.map((o) => ({
      label: objectiveLabel(o),
      text: objectiveText(o, config, snapshot.tick),
      color: config.teams.find((t) => t.id === o.team)?.color,
    }));
    const key = JSON.stringify(rows);
    if (key !== this.objectiveKey) {
      this.objectiveKey = key;
      this.objectives.replaceChildren(
        ...rows.map((row) => {
          const element = document.createElement('li');
          const label = document.createElement('strong');
          label.textContent = row.label;
          label.style.color = row.color ? TEAM_COLORS[row.color] : '#ddd';
          const text = document.createElement('span');
          text.textContent = row.text;
          element.appendChild(label);
          element.appendChild(text);
          return element;
        }),
      );
    }
    this.possess.hidden = config.mode !== 'domination' && config.mode !== 'mothership';
    this.possess.disabled = !snapshot.self.alive || match.phase === 'finished';
    this.possess.textContent =
      snapshot.self.possessing !== undefined
        ? `[${this.possessKeys}] Rendre le contrôle`
        : `[${this.possessKeys}] Piloter un objectif allié proche`;
    this.possess.title =
      'Approchez un objectif allié libre puis activez la commande. Le serveur valide la proximité.';
    const own = snapshot.entities.find((e) => e.id === snapshot.self.entityId);
    if (own && config.teams.length) this.title.textContent += ` · ${teamName(config, own.team)}`;
  }
}

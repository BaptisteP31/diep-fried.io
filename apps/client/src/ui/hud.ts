import {
  getClassDefinition,
  STAT_IDS,
  type ClassId,
  type LeaderboardEntry,
  type SelfState,
  type StatId,
} from '@diep-fried/shared';
import { PALETTE, STAT_COLORS } from '../render/palette';

export const STAT_NAMES: Readonly<Record<StatId, string>> = {
  healthRegen: 'Régénération santé',
  maxHealth: 'Santé max',
  bodyDamage: 'Dégâts de corps',
  bulletSpeed: 'Vitesse des tirs',
  bulletPenetration: 'Pénétration des tirs',
  bulletDamage: 'Dégâts des tirs',
  reload: 'Rechargement',
  movementSpeed: 'Vitesse déplacement',
};

export interface HudCallbacks {
  onUpgradeStat(stat: StatId): void;
  onChooseClass(classId: ClassId): void;
  onToggleAutoFire(): void;
  onToggleAutoSpin(): void;
  onOpenControls(): void;
}

/**
 * Gestion du HUD en jeu :
 * - Niveau / Score / Barre d'expérience
 * - 8 statistiques amovibles / améliorables
 * - Évolutions de classe disponibles
 * - Classement
 * - Latence (ping) et bascules de tir / rotation auto
 */
export class GameHud {
  private readonly container: HTMLElement;
  private readonly roomCode: HTMLElement;
  private readonly pingText: HTMLElement;
  private readonly autoFireBadge: HTMLElement;
  private readonly autoSpinBadge: HTMLElement;
  private readonly controlsBtn: HTMLElement;

  private readonly leaderboardPanel: HTMLElement;
  private readonly leaderboardList: HTMLElement;

  private readonly classChoicesPanel: HTMLElement;
  private readonly classChoicesList: HTMLElement;

  private readonly statsPanel: HTMLElement;
  private readonly statsPoints: HTMLElement;
  private readonly statRows = new Map<
    StatId,
    {
      row: HTMLElement;
      nameText: HTMLElement;
      segments: HTMLElement[];
      btn: HTMLButtonElement;
    }
  >();

  private readonly bottomHud: HTMLElement;
  private readonly playerName: HTMLElement;
  private readonly scoreText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly levelText: HTMLElement;

  private lastClassChoicesKey = '';
  private lastLeaderboard: LeaderboardEntry[] = [];

  constructor(callbacks: HudCallbacks) {
    this.container = document.getElementById('hud')!;
    this.roomCode = document.getElementById('hud-room')!;
    this.pingText = document.getElementById('hud-ping')!;
    this.autoFireBadge = document.getElementById('hud-autofire')!;
    this.autoSpinBadge = document.getElementById('hud-autospin')!;
    this.controlsBtn = document.getElementById('hud-controls-btn')!;

    this.leaderboardPanel = document.getElementById('leaderboard')!;
    this.leaderboardList = document.getElementById('leaderboard-list')!;

    this.classChoicesPanel = document.getElementById('class-choices')!;
    this.classChoicesList = document.getElementById('class-choices-list')!;

    this.statsPanel = document.getElementById('stats-panel')!;
    this.statsPoints = document.getElementById('stats-points')!;

    this.bottomHud = document.getElementById('bottom-hud')!;
    this.playerName = document.getElementById('hud-player-name')!;
    this.scoreText = document.getElementById('hud-score')!;
    this.xpFill = document.getElementById('hud-xp-fill')!;
    this.levelText = document.getElementById('hud-level-text')!;

    this.autoFireBadge.addEventListener('click', () => callbacks.onToggleAutoFire());
    this.autoSpinBadge.addEventListener('click', () => callbacks.onToggleAutoSpin());
    this.controlsBtn.addEventListener('click', () => callbacks.onOpenControls());

    // Construction du panneau des 8 statistiques
    STAT_IDS.forEach((stat, index) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.style.setProperty('--stat-color', STAT_COLORS[stat]);

      const key = document.createElement('span');
      key.className = 'stat-key';
      key.textContent = `[${index + 1}]`;

      const name = document.createElement('span');
      name.className = 'stat-name';
      name.textContent = STAT_NAMES[stat];

      const bar = document.createElement('div');
      bar.className = 'stat-bar';

      const segments: HTMLElement[] = [];
      const defaultCap = 7;
      for (let s = 0; s < defaultCap; s++) {
        const seg = document.createElement('div');
        seg.className = 'stat-segment';
        bar.appendChild(seg);
        segments.push(seg);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stat-plus-btn';
      btn.textContent = '+';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onUpgradeStat(stat);
      });

      row.addEventListener('click', () => {
        if (!btn.disabled) callbacks.onUpgradeStat(stat);
      });

      row.appendChild(key);
      row.appendChild(name);
      row.appendChild(bar);
      row.appendChild(btn);
      this.statsPanel.appendChild(row);

      this.statRows.set(stat, { row, nameText: name, segments, btn });
    });
  }

  show(): void {
    this.container.hidden = false;
    this.leaderboardPanel.hidden = false;
    this.statsPanel.hidden = false;
    this.bottomHud.hidden = false;
  }

  hide(): void {
    this.container.hidden = true;
    this.leaderboardPanel.hidden = true;
    this.classChoicesPanel.hidden = true;
    this.statsPanel.hidden = true;
    this.bottomHud.hidden = true;
  }

  setRoomCode(code: string): void {
    this.roomCode.textContent = `Salon ${code}`;
  }

  setPing(ms: number | null): void {
    this.pingText.textContent = ms !== null ? `Ping : ${ms} ms` : 'Ping : --';
  }

  setToggles(autoFire: boolean, autoSpin: boolean): void {
    this.autoFireBadge.classList.toggle('active', autoFire);
    this.autoSpinBadge.classList.toggle('active', autoSpin);
  }

  updateSelf(self: SelfState, ownName?: string): void {
    // 1. Barre XP et score
    const def = getClassDefinition(self.classId);
    const className = def?.name ?? self.classId;
    const displayName = ownName ? `${ownName} — ${className}` : className;
    this.playerName.textContent = displayName;
    this.scoreText.textContent = `Score : ${formatScore(self.score)}`;
    this.levelText.textContent = `Niveau ${self.level}`;
    const progressPercent = Math.max(0, Math.min(100, self.levelProgress * 100));
    this.xpFill.style.width = `${progressPercent}%`;

    // 2. Statistiques
    const hasPoints = self.statPoints > 0;
    this.statsPoints.textContent = hasPoints
      ? `x${self.statPoints} point${self.statPoints > 1 ? 's' : ''}`
      : '';
    this.statsPanel.classList.toggle('has-points', hasPoints);

    for (const stat of STAT_IDS) {
      const item = this.statRows.get(stat);
      if (!item) continue;
      const currentLevel = self.stats[stat] ?? 0;
      const cap = self.statCaps[stat] ?? 7;

      // Ajuster le nombre de segments si le plafond diffère de 7
      while (item.segments.length < cap) {
        const seg = document.createElement('div');
        seg.className = 'stat-segment';
        item.row.querySelector('.stat-bar')?.appendChild(seg);
        item.segments.push(seg);
      }
      while (item.segments.length > cap) {
        const seg = item.segments.pop();
        seg?.remove();
      }

      // Remplissage des segments
      item.segments.forEach((seg, i) => {
        seg.classList.toggle('filled', i < currentLevel);
      });

      const canUpgrade = hasPoints && currentLevel < cap;
      item.btn.disabled = !canUpgrade;
      item.btn.hidden = !hasPoints && currentLevel >= cap;
    }

    // 3. Choix de classes
    this.updateClassChoices(self.classChoices);
  }

  updateClassChoices(choices: ClassId[]): void {
    const key = choices.join(',');
    if (key === this.lastClassChoicesKey) return;
    this.lastClassChoicesKey = key;

    if (choices.length === 0) {
      this.classChoicesPanel.hidden = true;
      this.classChoicesList.innerHTML = '';
      return;
    }

    this.classChoicesPanel.hidden = false;
    this.classChoicesList.innerHTML = '';

    for (const classId of choices) {
      const def = getClassDefinition(classId);
      const name = def?.name ?? classId;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'class-choice-card';

      // Aperçu visuel en canvas
      const canvas = document.createElement('canvas');
      canvas.width = 54;
      canvas.height = 54;
      drawClassThumbnail(canvas, classId);

      const label = document.createElement('span');
      label.className = 'class-choice-label';
      label.textContent = name;

      card.appendChild(canvas);
      card.appendChild(label);
      card.addEventListener('click', () => {
        const evt = new CustomEvent('choose-class', { detail: classId, bubbles: true });
        this.classChoicesPanel.dispatchEvent(evt);
      });
      this.classChoicesList.appendChild(card);
    }
  }

  updateLeaderboard(entries: LeaderboardEntry[] | undefined, selfPlayerId: number): void {
    if (entries) {
      this.lastLeaderboard = entries;
    }
    const list = this.lastLeaderboard;
    if (list.length === 0) {
      this.leaderboardPanel.hidden = true;
      return;
    }

    this.leaderboardPanel.hidden = false;
    this.leaderboardList.innerHTML = '';

    const maxScore = Math.max(1, list[0]?.score ?? 1);

    list.slice(0, 10).forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      if (entry.playerId === selfPlayerId) {
        row.classList.add('self');
      }

      const bar = document.createElement('div');
      bar.className = 'leaderboard-bar';
      const pct = Math.min(100, Math.max(0, (entry.score / maxScore) * 100));
      bar.style.width = `${pct}%`;

      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = `${idx + 1}.`;

      const name = document.createElement('span');
      name.className = 'leaderboard-name';
      name.textContent = entry.name || 'Sans nom';

      const score = document.createElement('span');
      score.className = 'leaderboard-score';
      score.textContent = formatScore(entry.score);

      row.appendChild(bar);
      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      this.leaderboardList.appendChild(row);
    });
  }
}

/** Formate un score avec des espaces pour les milliers (standard français). */
export function formatScore(score: number): string {
  return score.toLocaleString('fr-FR');
}

/** Dessine une miniature de tank pour les cartes d'évolution. */
function drawClassThumbnail(canvas: HTMLCanvasElement, classId: ClassId): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const def = getClassDefinition(classId);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 13;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Dessin des canons
  for (const barrel of def?.barrels ?? []) {
    ctx.save();
    ctx.rotate(barrel.angle);
    const base = (barrel.width * r) / 2;
    const tip = ((barrel.tipWidth ?? barrel.width) * r) / 2;
    const offset = barrel.offset * r;
    ctx.beginPath();
    ctx.moveTo(0, offset - base);
    ctx.lineTo(barrel.length * r, offset - tip);
    ctx.lineTo(barrel.length * r, offset + tip);
    ctx.lineTo(0, offset + base);
    ctx.closePath();
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
    ctx.restore();
  }

  // Corps du tank
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.friendly;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.outline;
  ctx.stroke();

  ctx.restore();
}

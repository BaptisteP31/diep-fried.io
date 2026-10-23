import {
  getClassDefinition,
  STAT_IDS,
  type ClassId,
  type LeaderboardEntry,
  type SelfState,
  type StatId,
} from '@diep-fried/shared';
import { PALETTE, STAT_COLORS } from '../render/palette';
import { drawSpikes, polygonPath } from '../render/renderer';

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
  onOpenUpgradeTree?(): void;
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
  private readonly treeBtn: HTMLElement | null;

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

  constructor(private readonly callbacks: HudCallbacks) {
    this.container = document.getElementById('hud')!;
    this.roomCode = document.getElementById('hud-room')!;
    this.pingText = document.getElementById('hud-ping')!;
    this.autoFireBadge = document.getElementById('hud-autofire')!;
    this.autoSpinBadge = document.getElementById('hud-autospin')!;
    this.controlsBtn = document.getElementById('hud-controls-btn')!;
    this.treeBtn = document.getElementById('hud-tree-btn');

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
    this.treeBtn?.addEventListener('click', () => callbacks.onOpenUpgradeTree?.());

    // Construction du panneau des 8 statistiques
    STAT_IDS.forEach((stat, index) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.dataset.stat = stat;
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

  reset(): void {
    this.hide();
    this.lastClassChoicesKey = '';
    this.classChoicesList.innerHTML = '';
    this.lastLeaderboard = [];
    this.leaderboardList.innerHTML = '';
    this.setPing(null);
    this.setToggles(false, false);
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

    // 2. Statistiques (avec masquage et désactivation pour les stats à cap 0 ex: corps Smasher)
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

      if (cap === 0) {
        // Statistique non applicable pour cette classe (ex: canons pour Smasher)
        item.row.classList.add('stat-disabled');
        item.row.hidden = true;
        item.btn.disabled = true;
        item.btn.hidden = true;
        continue;
      }

      item.row.hidden = false;
      item.row.classList.remove('stat-disabled');

      // Ajuster le nombre de segments si le plafond diffère de 7 (ex: 10 pour Smasher)
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
        this.callbacks.onChooseClass(classId);
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

/**
 * Dessine une miniature de tank nette et proportionnée pour les cartes d'évolution et l'arbre.
 * Prend en compte toutes les familles (canons multiples, tourelles auto, Smasher hexagone,
 * Spike pointes, Landmine calques).
 */
export function drawClassThumbnail(
  canvas: HTMLCanvasElement,
  classId: ClassId,
  color = PALETTE.friendly,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const def = getClassDefinition(classId);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const isSmasher = classId === 'smasher' || classId === 'auto-smasher';
  const isLandmine = classId === 'landmine';
  const isSpike = classId === 'spike';

  // Calcul du facteur d'échelle dynamique pour que toutes les classes
  // (même celles aux canons très longs comme Predator/Streamliner/Ranger ou aux pointes larges)
  // s'affichent nettement sans dépassement.
  const barrels = def?.barrels ?? [];
  let maxExtent = isLandmine || isSpike ? 1.45 : isSmasher ? 1.4 : 1.0;
  for (const b of barrels) {
    const tip = Math.abs(b.offset) + (b.tipWidth ?? b.width) / 2;
    const len = b.length;
    const extent = Math.hypot(len, tip);
    if (extent > maxExtent) maxExtent = extent;
  }
  const availableR = Math.min(w, h) / 2 - 3;
  const r = Math.max(7, Math.min(13, availableR / maxExtent));

  // Corps spécial de la famille Smasher
  if (isSmasher) {
    polygonPath(ctx, 6, r * 1.35, 0);
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
  } else if (isLandmine) {
    polygonPath(ctx, 6, r * 1.4, 0);
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
    polygonPath(ctx, 6, r * 1.25, Math.PI / 6);
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
  } else if (isSpike) {
    drawSpikes(ctx, r, 12);
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
  }

  // 1. Canons standards (non-auto)
  for (const barrel of barrels) {
    if (barrel.auto) continue;
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
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
    ctx.restore();
  }

  // Corps principal circulaire du tank
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = PALETTE.outline;
  ctx.stroke();

  // 2. Canons et embases auto sur le corps
  for (const barrel of barrels) {
    if (!barrel.auto) continue;
    ctx.save();
    ctx.rotate(barrel.angle);
    const base = (barrel.width * r) / 2;
    const tip = ((barrel.tipWidth ?? barrel.width) * r) / 2;
    ctx.beginPath();
    ctx.moveTo(0, -base);
    ctx.lineTo(barrel.length * r, -tip);
    ctx.lineTo(barrel.length * r, tip);
    ctx.lineTo(0, base);
    ctx.closePath();
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();

    // Embase tourelle
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.barrel;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = PALETTE.barrelOutline;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

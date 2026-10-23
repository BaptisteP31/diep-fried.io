import {
  getClassDefinition,
  type EntityState,
  type ModeConfig,
  type ProjectileState,
  type ShapeKind,
  type ShapeState,
  type TankState,
  type TeamId,
} from '@diep-fried/shared';
import { makeCamera, worldToScreen, type Camera } from './camera';
import { FadeTracker } from './fade-tracker';
import { PALETTE, SHAPE_COLORS, SHINY_COLOR, TEAM_COLORS } from './palette';
import { calculateBarrelRecoil, calculateRecoilOffset } from './recoil';
import type { RenderFrame } from '../state/snapshot-buffer';

/** Espacement de la grille en unités monde (choix diep-fried.io). */
const GRID_SPACING = 25;
const SHAPE_SIDES: Readonly<Record<ShapeKind, number>> = {
  square: 4,
  triangle: 3,
  pentagon: 5,
  alphaPentagon: 5,
  crasher: 3,
};
/** Ordre de dessin par famille, du fond vers l'avant. */
const LAYER: Readonly<Record<string, number>> = {
  shape: 0,
  trap: 1,
  drone: 2,
  bullet: 3,
  tank: 4,
};

/**
 * Rendu Canvas 2D procédural d'une image. Lit uniquement l'état reçu ;
 * n'a aucune connaissance du réseau ni des règles.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  /** Dernière caméra utilisée, pour convertir la position de la souris. */
  camera: Camera | null = null;
  /** Suivi du fondu pour les entités disparaissant de l'affichage. */
  private readonly fadeTracker = new FadeTracker(200);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
  }

  reset(): void {
    this.camera = null;
    this.fadeTracker.clear();
  }

  /** Ajuste la résolution du canvas à sa taille affichée et à la densité de pixels. */
  resize(): void {
    const ratio = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** Dessine l'arène vide (écran d'accueil) ou l'image d'une partie. */
  draw(frame: RenderFrame | null, config: ModeConfig | null, nowMs = performance.now()): void {
    const { ctx } = this;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const own = frame?.entities.find((entity) => entity.id === frame.self.entityId);
    const center = own ?? this.camera?.center ?? arenaCenter(config);
    const camera = makeCamera(
      { x: center.x, y: center.y },
      frame?.self.view ?? 900,
      this.width,
      this.height,
    );
    this.camera = camera;

    if (config) this.drawOutsideArena(camera, config);
    this.drawGrid(camera);
    if (!frame) {
      this.fadeTracker.clear();
      return;
    }

    const currentTick = frame.tick;
    const ownTeam = own?.team ?? null;
    const ownEntityId = frame.self.entityId;

    // Met à jour les entités en cours de disparition
    this.fadeTracker.update(frame.entities, nowMs);

    // 1. Dessine les entités en cours de disparition (fondu)
    const fading = this.fadeTracker.getFading(nowMs);
    for (const { entity, alpha } of fading) {
      ctx.save();
      const at = worldToScreen(camera, entity);
      ctx.translate(at.x, at.y);
      ctx.scale(camera.scale, camera.scale);

      if (entity.kind === 'tank') {
        this.drawTank(entity, this.teamFill(entity.team, ownTeam, config), currentTick, nowMs, {
          alphaMultiplier: alpha,
          isSelf: entity.id === ownEntityId,
        });
      } else if (entity.kind === 'projectile') {
        ctx.globalAlpha = alpha;
        this.drawProjectile(entity, this.teamFill(entity.team, ownTeam, config));
      } else {
        ctx.globalAlpha = alpha;
        this.drawShape(entity);
      }
      ctx.restore();
    }

    // 2. Dessine les entités actives triées par couche
    const sorted = [...frame.entities].sort((a, b) => layerOf(a) - layerOf(b));
    for (const entity of sorted) {
      ctx.save();
      const at = worldToScreen(camera, entity);
      ctx.translate(at.x, at.y);
      ctx.scale(camera.scale, camera.scale);

      if (entity.kind === 'tank') {
        this.drawTank(entity, this.teamFill(entity.team, ownTeam, config), currentTick, nowMs, {
          isSelf: entity.id === ownEntityId,
        });
      } else if (entity.kind === 'projectile') {
        this.drawProjectile(entity, this.teamFill(entity.team, ownTeam, config));
      } else {
        this.drawShape(entity);
      }
      ctx.restore();
    }

    // 3. Barres de vie et étiquettes au premier plan
    for (const entity of sorted) {
      if (entity.kind === 'projectile') continue;
      // Ne pas afficher la barre si l'entité est invisible ou quasi invisible
      if (entity.kind === 'tank' && entity.opacity < 0.2 && entity.id !== ownEntityId) {
        continue;
      }
      const at = worldToScreen(camera, entity);
      this.drawHealthBar(entity, at, camera.scale);
      if (entity.kind === 'tank' && entity.id !== frame.self.entityId) {
        this.drawLabel(entity.name, at.x, at.y - (entity.radius + 14) * camera.scale, 14);
      }
    }
  }

  private teamFill(team: TeamId, ownTeam: TeamId | null, config: ModeConfig | null): string {
    if (team === ownTeam) return PALETTE.friendly;
    const declared = config?.teams.find((definition) => definition.id === team);
    return declared ? TEAM_COLORS[declared.color] : PALETTE.enemy;
  }

  private drawOutsideArena(camera: Camera, config: ModeConfig): void {
    const topLeft = worldToScreen(camera, { x: 0, y: 0 });
    const size = {
      w: config.arena.width * camera.scale,
      h: config.arena.height * camera.scale,
    };
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = PALETTE.outsideArena;
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.rect(topLeft.x, topLeft.y, size.w, size.h);
    ctx.fill('evenodd');
    ctx.restore();
  }

  private drawGrid(camera: Camera): void {
    const { ctx } = this;
    const step = GRID_SPACING * camera.scale;
    const origin = worldToScreen(camera, { x: 0, y: 0 });
    ctx.save();
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = mod(origin.x, step); x < this.width; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, this.height);
    }
    for (let y = mod(origin.y, step); y < this.height; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(this.width, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Repère local : origine au centre du tank, unités monde.
   * Prend en compte l'opacité, le clignotement de spawnProtected et le recul des canons.
   */
  private drawTank(
    tank: TankState,
    fill: string,
    currentTick: number,
    nowMs: number,
    options: { alphaMultiplier?: number; isSelf?: boolean } = {},
  ): void {
    const { ctx } = this;
    const definition = getClassDefinition(tank.classId);

    // Calcul de l'opacité : pour le joueur lui-même, on maintient au moins 35% de visibilité
    let baseOpacity = tank.opacity;
    if (options.isSelf) {
      baseOpacity = Math.max(0.35, baseOpacity);
    }

    // Effet de clignotement si spawnProtected actif
    if (tank.spawnProtected) {
      const blink = 0.35 + 0.55 * Math.abs(Math.sin((nowMs / 1000) * Math.PI * 4));
      baseOpacity *= blink;
    }

    const finalAlpha = baseOpacity * (options.alphaMultiplier ?? 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, finalAlpha));

    ctx.rotate(tank.angle);

    // Dessin des canons avec calcul de recul par canon
    const barrels = definition?.barrels ?? [];
    for (let i = 0; i < barrels.length; i++) {
      const barrel = barrels[i]!;
      ctx.save();
      ctx.rotate(barrel.angle);

      const r = tank.radius;
      const base = (barrel.width * r) / 2;
      const tip = ((barrel.tipWidth ?? barrel.width) * r) / 2;
      const offset = barrel.offset * r;

      // Calcul du recul
      const shotTick = tank.barrelShots[i];
      const recoilFactor = calculateBarrelRecoil(currentTick, shotTick, 4);
      const recoilOffset = calculateRecoilOffset(barrel.length, r, recoilFactor, barrel.recoil);

      ctx.translate(-recoilOffset, 0);

      ctx.beginPath();
      ctx.moveTo(0, offset - base);
      ctx.lineTo(barrel.length * r, offset - tip);
      ctx.lineTo(barrel.length * r, offset + tip);
      ctx.lineTo(0, offset + base);
      ctx.closePath();
      this.fillAndStroke(PALETTE.barrel, PALETTE.barrelOutline, r * 0.12);
      ctx.restore();
    }

    // Corps du tank
    ctx.beginPath();
    ctx.arc(0, 0, tank.radius, 0, Math.PI * 2);
    this.fillAndStroke(fill, PALETTE.outline, tank.radius * 0.12);
  }

  private drawProjectile(projectile: ProjectileState, fill: string): void {
    const { ctx } = this;
    const r = projectile.radius;
    ctx.beginPath();
    if (projectile.family === 'drone' || projectile.family === 'trap') {
      ctx.rotate(projectile.angle);
      polygonPath(ctx, 3, r);
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    this.fillAndStroke(fill, PALETTE.outline, r * 0.2);
  }

  private drawShape(shape: ShapeState): void {
    const { ctx } = this;
    ctx.rotate(shape.angle);
    ctx.beginPath();
    polygonPath(ctx, SHAPE_SIDES[shape.shape], shape.radius);
    const fill = shape.shiny ? SHINY_COLOR : SHAPE_COLORS[shape.shape];
    this.fillAndStroke(fill, PALETTE.outline, shape.radius * 0.12);
  }

  private drawHealthBar(
    entity: TankState | ShapeState,
    at: { x: number; y: number },
    scale: number,
  ) {
    if (entity.health >= entity.maxHealth) return;
    const { ctx } = this;
    const width = entity.radius * 2 * scale;
    const y = at.y + (entity.radius + 10) * scale;
    const ratio = Math.max(0, entity.health / entity.maxHealth);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = PALETTE.healthBack;
    ctx.beginPath();
    ctx.moveTo(at.x - width / 2, y);
    ctx.lineTo(at.x + width / 2, y);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = PALETTE.healthFill;
    ctx.beginPath();
    ctx.moveTo(at.x - width / 2, y);
    ctx.lineTo(at.x - width / 2 + width * ratio, y);
    ctx.stroke();
    ctx.restore();
  }

  private drawLabel(text: string, x: number, y: number, size: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = `700 ${size}px Ubuntu, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.36;
    ctx.strokeStyle = PALETTE.textStroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private fillAndStroke(fill: string, stroke: string, lineWidth: number): void {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function polygonPath(ctx: CanvasRenderingContext2D, sides: number, radius: number): void {
  for (let k = 0; k < sides; k++) {
    const angle = (2 * Math.PI * k) / sides;
    if (k === 0) ctx.moveTo(radius * Math.cos(angle), radius * Math.sin(angle));
    else ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  ctx.closePath();
}

function layerOf(entity: EntityState): number {
  return LAYER[entity.kind === 'projectile' ? entity.family : entity.kind] ?? LAYER.bullet!;
}

function arenaCenter(config: ModeConfig | null) {
  return config ? { x: config.arena.width / 2, y: config.arena.height / 2 } : { x: 0, y: 0 };
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

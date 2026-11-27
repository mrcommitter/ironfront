import { Controller } from "../Controller";
import { GameView, UnitView } from "../view";
import { TransformHandler } from "../TransformHandler";
import { UnitType } from "../../core/game/Game";

interface WakeParticle {
  worldX: number;
  worldY: number;
  dirX: number;
  dirY: number;
  side: -1 | 1;
  createdAt: number;
  durationMs: number;
}

export class NavalWakeController implements Controller {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: WakeParticle[] = [];
  private lastWarshipPositions = new Map<number, { x: number; y: number }>();
  private animFrameId: number | null = null;
  private isDestroyed = false;

  constructor(
    private readonly game: GameView,
    private readonly transformHandler: TransformHandler,
  ) {}

  init(): void {
    this.createWakeCanvas();
    this.startRenderLoop();
  }

  private createWakeCanvas(): void {
    if (this.canvas) return;

    this.canvas = document.createElement("canvas");
    this.canvas.id = "naval-wake-canvas";
    this.canvas.className = "fixed inset-0 pointer-events-none z-[120] select-none";
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    window.addEventListener("resize", this.onResize);
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
  }

  private onResize = (): void => {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  private startRenderLoop(): void {
    const render = () => {
      if (this.isDestroyed) return;
      this.drawWakes();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  public tick(): void {
    // Collect moving warships on tick
    const now = Date.now();
    for (const ship of this.game.units(UnitType.Warship)) {
      if (!ship.isActive()) continue;
      const ref = ship.lastTile();
      if (ref === undefined) continue;

      const curX = this.game.x(ref);
      const curY = this.game.y(ref);

      const prev = this.lastWarshipPositions.get(ship.id());
      if (prev && (prev.x !== curX || prev.y !== curY)) {
        // Warship moved! Generate V-shaped wake behind its stern
        const dx = curX - prev.x;
        const dy = curY - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const normDx = dx / len;
        const normDy = dy / len;

        // Normal perpendicular vector for wake spread
        const perpX = -normDy;
        const perpY = normDx;

        // Spawn left and right wake trails
        this.particles.push({
          worldX: prev.x - normDx * 0.4,
          worldY: prev.y - normDy * 0.4,
          dirX: perpX,
          dirY: perpY,
          side: -1,
          createdAt: now,
          durationMs: 2400,
        });

        this.particles.push({
          worldX: prev.x - normDx * 0.4,
          worldY: prev.y - normDy * 0.4,
          dirX: perpX,
          dirY: perpY,
          side: 1,
          createdAt: now,
          durationMs: 2400,
        });
      }

      this.lastWarshipPositions.set(ship.id(), { x: curX, y: curY });
    }

    // Prune expired particles and cap buffer size to prevent memory/CPU bloat
    const cutoff = now - 2600;
    this.particles = this.particles.filter((p) => p.createdAt >= cutoff);
    if (this.particles.length > 90) {
      this.particles.splice(0, this.particles.length - 90);
    }
  }

  private hasClearedEmpty = false;

  private drawWakes(): void {
    if (!this.ctx || !this.canvas) return;

    if (this.particles.length === 0) {
      if (!this.hasClearedEmpty) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.hasClearedEmpty = true;
      }
      return;
    }
    this.hasClearedEmpty = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const now = Date.now();
    const scale = this.transformHandler.scale;
    const halfWidth = this.game.width() / 2;
    const halfHeight = this.game.height() / 2;
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;

    for (const p of this.particles) {
      const ageMs = now - p.createdAt;
      const progress = Math.min(1, ageMs / p.durationMs);
      const alpha = (1 - progress) * 0.35;

      if (alpha <= 0.01) continue;

      // Wake spreads outward away from center track
      const spread = progress * 1.4 * p.side;
      const curWorldX = p.worldX + p.dirX * spread;
      const curWorldY = p.worldY + p.dirY * spread;

      const canvasX = (curWorldX - this.transformHandler.offsetX - halfWidth) * scale + halfWidth;
      const canvasY = (curWorldY - this.transformHandler.offsetY - halfHeight) * scale + halfHeight;

      // Render soft expanding foam ellipse
      const radiusX = Math.max(2.5, (3.5 + progress * 7) * (scale / 2));
      const radiusY = Math.max(1.8, (1.8 + progress * 3.5) * (scale / 2));

      // Viewport culling: Skip offscreen wake particles
      if (
        canvasX + radiusX < -20 ||
        canvasX - radiusX > viewW + 20 ||
        canvasY + radiusY < -20 ||
        canvasY - radiusY > viewH + 20
      ) {
        continue;
      }

      this.ctx.beginPath();
      this.ctx.ellipse(
        canvasX,
        canvasY,
        radiusX,
        radiusY,
        0,
        0,
        Math.PI * 2,
      );
      this.ctx.fillStyle = `rgba(224, 242, 254, ${alpha.toFixed(3)})`;
      this.ctx.fill();
    }
  }

  public dispose(): void {
    this.isDestroyed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    window.removeEventListener("resize", this.onResize);
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}

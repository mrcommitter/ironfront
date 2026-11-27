import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { EventBus, GameEvent } from "../../../core/EventBus";
import { GameMode } from "../../../core/game/Game";
import { Controller } from "../../Controller";
import { GameView } from "../../view";

export class ImmunityBarVisibleEvent implements GameEvent {
  constructor(public readonly visible: boolean) {}
}

@customElement("immunity-timer")
export class ImmunityTimer extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  private isVisible = false;
  private _barVisible = false;
  private isActive = false;
  private progressRatio = 0;

  createRenderRoot() {
    this.style.position = "fixed";
    this.style.top = "0";
    this.style.left = "0";
    this.style.width = "100%";
    this.style.height = "7px";
    this.style.zIndex = "1000";
    this.style.pointerEvents = "none";
    return this;
  }

  init() {
    this.isVisible = true;
  }

  tick() {
    if (!this.game || !this.isVisible) {
      return;
    }

    const showTeamOwnershipBar =
      this.game.config().gameConfig().gameMode === GameMode.Team &&
      !this.game.inSpawnPhase();

    this.style.top = showTeamOwnershipBar ? "7px" : "0px";

    const immunityDuration = this.game.config().spawnImmunityDuration();
    const spawnPhaseTurns = this.game.config().numSpawnPhaseTurns();

    if (
      !this.game.config().hasExtendedSpawnImmunity() ||
      this.game.inSpawnPhase()
    ) {
      this.setInactive();
    } else {
      const immunityEnd = spawnPhaseTurns + immunityDuration;
      const ticks = this.game.ticks();

      if (ticks >= immunityEnd || ticks < spawnPhaseTurns) {
        this.setInactive();
      } else {
        const elapsedTicks = Math.max(0, ticks - spawnPhaseTurns);
        this.progressRatio = Math.min(
          1,
          Math.max(0, elapsedTicks / immunityDuration),
        );
        this.isActive = true;
        this.requestUpdate();
      }
    }

    this.emitBarVisibility();
  }

  private setInactive() {
    if (this.isActive) {
      this.isActive = false;
      this.requestUpdate();
    }
  }

  private emitBarVisibility() {
    const nowVisible = this.isVisible && this.isActive;
    if (nowVisible !== this._barVisible) {
      this._barVisible = nowVisible;
      this.eventBus?.emit(new ImmunityBarVisibleEvent(this._barVisible));
    }
  }

  render() {
    if (!this.isVisible || !this.isActive) {
      return html``;
    }

    const widthPercent = this.progressRatio * 100;
    const immunityDuration = this.game.config().spawnImmunityDuration();
    const spawnPhaseTurns = this.game.config().numSpawnPhaseTurns();
    const remainingTicks = Math.max(
      0,
      spawnPhaseTurns + immunityDuration - this.game.ticks(),
    );
    const remainingSeconds = Math.ceil(remainingTicks / 10);

    return html`
      <div class="w-full h-full flex z-999">
        <div
          class="h-full transition-all duration-100 ease-in-out"
          style="width: ${widthPercent}%; background-color: rgba(245, 158, 11, 0.9);"
        ></div>
      </div>
      <div
        class="fixed top-3 left-1/2 -translate-x-1/2 z-[99990] flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/60 text-white shadow-2xl backdrop-blur-md pointer-events-none select-none animate-pulse"
      >
        <span class="text-base">🕊️</span>
        <span class="text-xs font-bold text-amber-300">
          آتش‌بس آغازین: فرصت استقرار نیروها و سازه‌ها
        </span>
        <span
          class="text-xs font-extrabold text-white tabular-nums bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/40"
        >
          ${remainingSeconds} ثانیه
        </span>
      </div>
    `;
  }
}

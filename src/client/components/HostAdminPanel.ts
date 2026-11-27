import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../core/EventBus";
import { Controller } from "../Controller";
import { PlaySoundEffectEvent } from "../sound/Sounds";
import { PauseGameIntentEvent } from "../Transport";
import { GameView } from "../view";
import { inGameMusic } from "../sound/InGameWarMusic";
import { translateText } from "../Utils";

@customElement("host-admin-panel")
export class HostAdminPanel extends LitElement implements Controller {
  public game!: GameView;
  public eventBus!: EventBus;

  @state() private isOpen = false;
  @state() private isPaused = false;
  @state() private ticks = 0;
  @state() private alivePlayers = 0;
  @state() private totalPlayers = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("ironfront-open-host-panel", this.handleOpenEvent);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("ironfront-open-host-panel", this.handleOpenEvent);
  }

  private handleOpenEvent = () => {
    this.isOpen = !this.isOpen;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Backquote" && !e.repeat) {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
      ) {
        return;
      }
      this.isOpen = !this.isOpen;
    }
  };

  init() {}

  tick() {
    if (!this.game) return;
    this.ticks = this.game.ticks?.() ?? 0;
    const players = this.game.players?.() ?? [];
    this.totalPlayers = players.length;
    this.alivePlayers = players.filter((p) => p.isAlive?.()).length;
    this.isPaused = (this.game as any).isPaused?.() ?? this.isPaused;
  }

  private togglePause() {
    const nextPaused = !this.isPaused;
    this.isPaused = nextPaused;
    this.eventBus?.emit(new PauseGameIntentEvent(nextPaused));
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: {
          message: nextPaused
            ? translateText("host_admin.pause")
            : translateText("host_admin.resume"),
          color: nextPaused ? "red" : "green",
        },
      }),
    );
  }

  private broadcastAnnouncement() {
    const promptText = translateText("host_admin.prompt_broadcast");
    const text = prompt(promptText);
    if (!text || text.trim().length === 0) return;
    const prefix = translateText("host_admin.broadcast_prefix");
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: {
          message: `[${prefix}]: ${text.trim()}`,
          color: "green",
        },
      }),
    );
    this.eventBus?.emit(new PlaySoundEffectEvent("message"));
  }

  private triggerNuclearAlarmDemo() {
    window.dispatchEvent(
      new CustomEvent("ironfront-trigger-alert", {
        detail: { duration: 6000 },
      }),
    );
    window.dispatchEvent(new CustomEvent("ironfront-nuke-shake"));
    this.eventBus?.emit(new PlaySoundEffectEvent("nuke-warning"));
  }

  private triggerTacticalBeacon() {
    window.dispatchEvent(
      new CustomEvent("ironfront-tactical-ping", {
        detail: {
          type: "danger",
          label: translateText("host_admin.tactical_beacon"),
        },
      }),
    );
  }

  private toggleMusic() {
    inGameMusic.toggle();
  }

  private toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  render(): TemplateResult {
    if (!this.isOpen) return html``;

    return html`
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10020] flex items-center justify-center p-4 animate-in fade-in duration-150"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.isOpen = false;
        }}
      >
        <div
          class="w-full max-w-lg bg-zinc-900/95 border border-white/10 rounded-2xl p-6 shadow-2xl text-white space-y-5"
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h3 class="font-bold text-base text-white tracking-wide">
                ${translateText("host_admin.title")}
              </h3>
              <p class="text-xs text-white/50 mt-0.5">
                ${translateText("host_admin.subtitle")}
              </p>
            </div>
            <button
              type="button"
              class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
              @click=${() => (this.isOpen = false)}
            >
              ✕
            </button>
          </div>

          <!-- Telemetry Stats -->
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="bg-white/[0.03] border border-white/10 p-3 rounded-xl">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1">
                ${translateText("host_admin.status")}
              </span>
              <span class="font-mono text-sm font-bold ${this.isPaused ? "text-rose-400" : "text-emerald-400"}">
                ${this.isPaused
                  ? translateText("host_admin.pause")
                  : translateText("host_admin.resume")}
              </span>
            </div>
            <div class="bg-white/[0.03] border border-white/10 p-3 rounded-xl">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1">
                ${translateText("host_admin.players")}
              </span>
              <span class="font-mono text-sm font-bold text-white">
                ${this.alivePlayers} / ${this.totalPlayers}
              </span>
            </div>
            <div class="bg-white/[0.03] border border-white/10 p-3 rounded-xl">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1">
                ${translateText("host_admin.ticks")}
              </span>
              <span class="font-mono text-sm font-bold text-white">
                ${this.ticks}
              </span>
            </div>
          </div>

          <!-- Action Buttons Grid -->
          <div class="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              class="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.togglePause}
            >
              ${this.isPaused
                ? translateText("host_admin.resume")
                : translateText("host_admin.pause")}
            </button>

            <button
              type="button"
              class="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.broadcastAnnouncement}
            >
              ${translateText("host_admin.broadcast")}
            </button>

            <button
              type="button"
              class="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.triggerNuclearAlarmDemo}
            >
              ${translateText("host_admin.nuclear_alarm")}
            </button>

            <button
              type="button"
              class="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.triggerTacticalBeacon}
            >
              ${translateText("host_admin.tactical_beacon")}
            </button>

            <button
              type="button"
              class="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.toggleMusic}
            >
              ${translateText("host_admin.music")}
            </button>

            <button
              type="button"
              class="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              @click=${this.toggleFullscreen}
            >
              ${translateText("host_admin.fullscreen")}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

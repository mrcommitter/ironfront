import { html, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import { BaseModal, ModalConfig } from "./BaseModal";
import { modalHeader } from "./ui/ModalHeader";
import { MatchHistoryStore, MatchRecord, MatchStats } from "../MatchHistoryStore";

@customElement("match-history-modal")
export class MatchHistoryModal extends BaseModal {
  protected routerName = "match-history";

  @state() private filter: "all" | "wins" | "losses" = "all";
  @state() private history: MatchRecord[] = [];
  @state() private stats: MatchStats = {
    total: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalKills: 0,
    bestTerritoryPercent: 0,
  };

  protected modalConfig(): ModalConfig {
    return {
      title: translateText("match_history.title"),
      maxWidth: "960px",
    };
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("match_history.title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected onOpen(): void {
    this.refreshData();
  }

  private refreshData(): void {
    this.history = MatchHistoryStore.getAll();
    this.stats = MatchHistoryStore.getStats();
  }

  private handleClearHistory(): void {
    if (confirm(translateText("match_history.clear_confirm"))) {
      MatchHistoryStore.clear();
      this.refreshData();
    }
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "< 1m";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  private formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return "< 1m";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  protected renderBody(): TemplateResult {
    const filtered = this.history.filter((m) => {
      if (this.filter === "wins") return m.isWin;
      if (this.filter === "losses") return !m.isWin;
      return true;
    });

    return html`
      <div class="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 space-y-6 text-white">
        <!-- Telemetry Summary Banner -->
        <div
          class="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.2)]"
        >
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
            <div class="flex flex-col items-center">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">
                ${translateText("match_history.total_games")}
              </span>
              <span class="text-2xl font-black text-white font-mono">
                ${this.stats.total}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">
                ${translateText("match_history.wins")}
              </span>
              <span class="text-2xl font-black text-emerald-400 font-mono">
                ${this.stats.wins}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">
                ${translateText("match_history.losses")}
              </span>
              <span class="text-2xl font-black text-rose-400 font-mono">
                ${this.stats.losses}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">
                ${translateText("match_history.win_rate")}
              </span>
              <span class="text-2xl font-black text-malibu-blue font-mono">
                ${this.stats.winRate}%
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">
                ${translateText("match_history.total_kills")}
              </span>
              <span class="text-2xl font-black text-white font-mono">
                ${this.stats.totalKills}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">
                ${translateText("match_history.best_territory")}
              </span>
              <span class="text-2xl font-black text-white font-mono">
                ${this.stats.bestTerritoryPercent}%
              </span>
            </div>
          </div>
        </div>

        <!-- Segmented Filter Bar & Actions -->
        <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div class="flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 shrink-0">
            <button
              class="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${this.filter === "all"
                ? "bg-malibu-blue text-white shadow-sm"
                : "text-white/50 hover:text-white"}"
              @click=${() => (this.filter = "all")}
            >
              ${translateText("match_history.all")} (${this.stats.total})
            </button>
            <button
              class="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${this.filter === "wins"
                ? "bg-malibu-blue text-white shadow-sm"
                : "text-white/50 hover:text-white"}"
              @click=${() => (this.filter = "wins")}
            >
              ${translateText("match_history.wins")} (${this.stats.wins})
            </button>
            <button
              class="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${this.filter === "losses"
                ? "bg-malibu-blue text-white shadow-sm"
                : "text-white/50 hover:text-white"}"
              @click=${() => (this.filter = "losses")}
            >
              ${translateText("match_history.losses")} (${this.stats.losses})
            </button>
          </div>

          ${this.history.length > 0
            ? html`
                <button
                  type="button"
                  @click=${this.handleClearHistory}
                  class="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  ${translateText("match_history.clear")}
                </button>
              `
            : null}
        </div>

        <!-- Match List -->
        <div class="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
          ${filtered.length === 0
            ? html`
                <div
                  class="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50"
                >
                  <p class="text-sm font-medium">
                    ${translateText("match_history.empty")}
                  </p>
                </div>
              `
            : filtered.map((match) => {
                const isWin = match.isWin;
                return html`
                  <div
                    class="rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <!-- Left Column: Result & Info -->
                    <div class="flex items-center gap-3.5">
                      <span
                        class="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider shrink-0 ${isWin
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/30"}"
                      >
                        ${isWin
                          ? translateText("match_history.victory")
                          : translateText("match_history.defeat")}
                      </span>
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="font-semibold text-sm text-white">
                            ${match.map || "World"}
                          </span>
                          <span class="text-xs text-white/40">•</span>
                          <span class="text-xs text-white/50 font-mono">
                            ${this.formatTimeAgo(match.timestamp)}
                          </span>
                        </div>
                        <div class="text-xs text-white/40 mt-0.5">
                          ${translateText("match_history.duration")}:
                          ${this.formatDuration(match.durationSeconds)}
                        </div>
                      </div>
                    </div>

                    <!-- Right Column: Stats -->
                    <div class="flex items-center gap-4 text-xs text-white/70 font-mono sm:justify-end">
                      <div class="flex items-center gap-1.5">
                        <span class="text-white/40">${translateText("match_history.kills")}:</span>
                        <span class="font-bold text-white">${match.kills || 0}</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-white/40">${translateText("match_history.territory")}:</span>
                        <span class="font-bold text-white">${match.territoryPercent || 0}%</span>
                      </div>
                      ${match.peakTroops
                        ? html`
                            <div class="flex items-center gap-1.5">
                              <span class="text-white/40">${translateText("match_history.troops")}:</span>
                              <span class="font-bold text-white">${match.peakTroops.toLocaleString()}</span>
                            </div>
                          `
                        : null}
                    </div>
                  </div>
                `;
              })}
        </div>
      </div>
    `;
  }
}

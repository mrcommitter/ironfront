import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { PlayerType } from "../../../core/game/Game";
import { within } from "../../../core/Util";
import { SendTradeTroopsIntentEvent } from "../../Transport";
import { renderNumber, renderTroops, showToast, translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";
import Countries from "resources/countries.json" with { type: "json" };

@customElement("trade-troops-modal")
export class TradeTroopsModal extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ attribute: false }) eventBus: EventBus | null = null;
  @property({ attribute: false }) myPlayer: PlayerView | null = null;
  @property({ attribute: false }) target: PlayerView | null = null;
  @property({ attribute: false }) gameView: GameView | null = null;

  @state() private mode: "buy" | "sell" = "buy";
  @state() private troopAmount = 1000;
  @state() private customRate = 25;
  @state() private selectedPercent: number | null = 25;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.resetDefaults();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open) {
      this.resetDefaults();
      queueMicrotask(() => {
        (this.querySelector('[role="dialog"]') as HTMLElement | null)?.focus();
      });
    }
  }

  private resetDefaults(): void {
    if (!this.myPlayer) return;
    this.customRate =
      this.mode === "buy"
        ? this.getDefaultBuyRate()
        : this.getDefaultSellRate();

    if (this.mode === "buy") {
      const maxBuy = this.getMaxBuyableTroops();
      this.troopAmount =
        maxBuy > 0 ? Math.max(10, Math.min(maxBuy, Math.floor(maxBuy * 0.25))) : 0;
    } else {
      const maxSell = this.getMaxSellableTroops();
      this.troopAmount =
        maxSell > 0
          ? Math.max(10, Math.min(maxSell, Math.floor(maxSell * 0.25)))
          : 0;
    }
    this.selectedPercent = 25;
  }

  private closeModal(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
  }

  private isAllied(): boolean {
    if (!this.myPlayer || !this.target) return false;
    return this.myPlayer.isAlliedWith?.(this.target) ?? false;
  }

  private getRelationStatus(): { name: string; color: string; perk: string } {
    if (!this.target) {
      return {
        name: "بازار آزاد مزدوران",
        color: "text-amber-400 border-amber-500/30 bg-amber-500/10",
        perk: "استخدام نامحدود سرباز بدون نیاز به رضایت همسایگان",
      };
    }
    if (this.isAllied()) {
      return {
        name: "متحد رسمی نظامی 🤝",
        color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
        perk: "۲۰٪ تخفیف خرید + پاداش نقدی فروش نیرو!",
      };
    }
    if (this.target.type() === PlayerType.Nation) {
      return {
        name: "هوش مصنوعی / ارتش محلی 🤖",
        color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
        perk: "معامله نیرو سبب بهبود روابط دیپلماتیک می‌گردد.",
      };
    }
    return {
      name: "بازیکن فرمانده 🎖️",
      color: "text-purple-400 border-purple-500/30 bg-purple-500/10",
      perk: "معامله مستقیم و دوطرفه بین دولت‌ها.",
    };
  }

  private getDefaultBuyRate(): number {
    const isAlly = this.isAllied();
    if (isAlly) return 20;
    return 25;
  }

  private getDefaultSellRate(): number {
    const isAlly = this.isAllied();
    if (isAlly) return 18;
    return 15;
  }

  private calculateGoldCost(troops: number): number {
    return Math.max(1, Math.round(troops * Math.max(10, this.customRate)));
  }

  private calculateGoldEarned(troops: number): number {
    return Math.max(1, Math.round(troops * Math.max(10, this.customRate)));
  }

  private getMaxBuyableTroops(): number {
    if (!this.myPlayer) return 0;
    const gold = Number(this.myPlayer.gold());
    const rate = Math.max(10, this.customRate);
    const byGold = Math.floor(gold / rate);

    let maxCap = Infinity;
    if (this.gameView) {
      maxCap = Math.max(
        0,
        (Number(this.gameView.config().maxTroops(this.myPlayer)) -
          Number(this.myPlayer.troops())) /
          10,
      );
    }

    let maxFromSeller = Infinity;
    if (this.target) {
      // 80% cap on seller's available troops
      const targetTroops = Number(this.target.troops()) / 10;
      maxFromSeller = Math.max(0, Math.floor(targetTroops * 0.8));
    }

    return Math.max(0, Math.floor(Math.min(byGold, maxCap, maxFromSeller)));
  }

  private getMaxSellableTroops(): number {
    if (!this.myPlayer) return 0;
    // Seller cannot sell more than 80% of their troops
    const current = Number(this.myPlayer.troops()) / 10;
    return Math.max(0, Math.floor(current * 0.8));
  }

  private setRate(val: number): void {
    const clamped = Math.max(10, Math.min(500, Math.round(val)));
    this.customRate = clamped;
    const max =
      this.mode === "buy"
        ? this.getMaxBuyableTroops()
        : this.getMaxSellableTroops();
    if (this.selectedPercent !== null) {
      this.troopAmount = Math.max(0, Math.floor((max * this.selectedPercent) / 100));
    } else if (this.troopAmount > max) {
      this.troopAmount = max;
    }
    this.requestUpdate();
  }

  private setTroops(val: number): void {
    const max =
      this.mode === "buy"
        ? this.getMaxBuyableTroops()
        : this.getMaxSellableTroops();
    this.troopAmount = within(val, 0, max);
    this.selectedPercent = null;
    this.requestUpdate();
  }

  private applyPercent(pct: number): void {
    this.selectedPercent = pct;
    const max =
      this.mode === "buy"
        ? this.getMaxBuyableTroops()
        : this.getMaxSellableTroops();
    this.troopAmount = Math.max(0, Math.floor((max * pct) / 100));
    this.requestUpdate();
  }

  private addTroopsStep(delta: number): void {
    this.setTroops(this.troopAmount + delta);
  }

  private confirmTrade(): void {
    if (!this.myPlayer || !this.eventBus) return;
    if (this.troopAmount <= 0) {
      showToast("لطفاً تعداد سرباز معتبر مشخص کنید.", "red");
      return;
    }

    const targetID = this.target ? this.target.id() : null;
    const engineTroops = this.troopAmount * 10;
    const myGold = Number(this.myPlayer.gold());

    if (this.mode === "buy") {
      const goldCost = this.calculateGoldCost(this.troopAmount);
      if (myGold < goldCost) {
        showToast("موجودی طلای شما برای این خرید کافی نیست!", "red");
        return;
      }

      if (this.target) {
        const sellerTroops = Number(this.target.troops()) / 10;
        const maxSellerAllowed = Math.floor(sellerTroops * 0.8);
        if (this.troopAmount > maxSellerAllowed) {
          showToast(
            `فروشنده حداکثر مجاز به فروش ۸۰٪ سربازان خود (${maxSellerAllowed.toLocaleString("en-US")}) می‌باشد!`,
            "red",
          );
          return;
        }
      }

      this.eventBus.emit(
        new SendTradeTroopsIntentEvent("buy", targetID, engineTroops, goldCost),
      );
      if (this.target && this.target.type() === PlayerType.Nation && this.customRate < 25) {
        showToast(
          `⚠️ پیشنهاد ارسال شد؛ در نرخ‌های کمتر از ۲۵x ارتش هوش مصنوعی ممکن است طمع کرده و پیشنهاد را رد کند!`,
          "red",
        );
      } else {
        showToast(
          `⚔️ پیشنهاد ارسال شد: ${this.troopAmount.toLocaleString("en-US")} سرباز با ${goldCost.toLocaleString("en-US")} طلا.`,
          "green",
        );
      }
    } else {
      const goldGain = this.calculateGoldEarned(this.troopAmount);
      const myTroops = Number(this.myPlayer.troops()) / 10;
      const maxSellAllowed = Math.floor(myTroops * 0.8);

      if (this.troopAmount > maxSellAllowed) {
        showToast(
          `حداکثر می‌توانید تا ۸۰٪ سربازان خود (${maxSellAllowed.toLocaleString("en-US")}) را بفروشید!`,
          "red",
        );
        return;
      }

      this.eventBus.emit(
        new SendTradeTroopsIntentEvent("sell", targetID, engineTroops, goldGain),
      );
      showToast(
        `💰 واگذاری موفق: ${this.troopAmount.toLocaleString("en-US")} سرباز در ازای ${goldGain.toLocaleString("en-US")} طلا پیشنهاد شد!`,
        "green",
      );
    }

    this.closeModal();
  }

  render(): TemplateResult {
    if (!this.open || !this.myPlayer) return html``;

    const myGold = Number(this.myPlayer.gold());
    const myTroops = Number(this.myPlayer.troops()) / 10;
    const relationInfo = this.getRelationStatus();
    const maxBuy = this.getMaxBuyableTroops();
    const maxSell = this.getMaxSellableTroops();

    const targetFlag = this.target?.cosmetics.flag;
    const flagCode = targetFlag?.match(/\/flags\/(.+)\.svg$/)?.[1];
    const country =
      typeof flagCode === "string"
        ? (Countries as Array<{ code: string; name?: string }>).find(
            (c) => c.code === flagCode,
          )
        : undefined;
    const targetName = this.target
      ? this.target.displayName()
      : "کمپ مزدوران آزاد";

    const costOrGain =
      this.mode === "buy"
        ? this.calculateGoldCost(this.troopAmount)
        : this.calculateGoldEarned(this.troopAmount);

    const hasEnoughGoldForBuy = myGold >= costOrGain;
    const canSubmitTrade =
      this.troopAmount > 0 &&
      (this.mode === "sell" || hasEnoughGoldForBuy);

    const sellerTotalTroops = this.target
      ? Number(this.target.troops()) / 10
      : null;
    const seller80PercentCap =
      sellerTotalTroops !== null
        ? Math.floor(sellerTotalTroops * 0.8)
        : null;

    return html`
      <div
        class="fixed inset-0 z-[10005] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
        role="dialog"
        tabindex="-1"
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Escape") this.closeModal();
        }}
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this.closeModal();
        }}
        dir="rtl"
      >
        <div
          class="relative w-full max-w-lg rounded-2xl bg-gradient-to-b from-zinc-900 via-slate-900 to-zinc-950 border border-white/20 shadow-2xl text-white overflow-hidden p-5 sm:p-6 flex flex-col gap-4 select-none max-h-[92vh] overflow-y-auto"
        >
          <!-- Glowing Aura Behind Header -->
          <div
            class="absolute top-0 right-1/2 translate-x-1/2 w-80 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"
          ></div>

          <!-- ─── HEADER & CLOSE ─── -->
          <div class="relative z-10 flex items-center justify-between border-b border-white/10 pb-3">
            <div class="flex items-center gap-3">
              <div
                class="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-700/20 border border-amber-500/40 flex items-center justify-center text-2xl shadow-lg"
              >
                ⚖️
              </div>
              <div>
                <h3 class="text-lg font-black text-white tracking-wide flex items-center gap-2">
                  بازار معامله و استخدام سرباز
                  <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                    نظامی
                  </span>
                </h3>
                <p class="text-xs text-white/60">
                  خرید و فروش توافقی نیرو با سقف حداکثر ۸۰٪ و نرخ قابل ویرایش
                </p>
              </div>
            </div>

            <button
              @click=${this.closeModal}
              class="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center text-white/70 text-sm font-bold cursor-pointer"
              title="بستن پنجره"
            >
              ✕
            </button>
          </div>

          <!-- ─── TRADING PARTNER CARD ─── -->
          <div
            class="relative z-10 rounded-xl bg-black/40 border border-white/10 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-lg bg-zinc-800 border border-white/15 overflow-hidden flex items-center justify-center shrink-0"
              >
                ${this.target && country
                  ? html`<img
                      src="/flags/${flagCode}.svg"
                      alt=${country.name}
                      class="w-full h-full object-cover"
                    />`
                  : html`<span class="text-xl">⛺</span>`}
              </div>
              <div>
                <div class="text-sm font-bold text-white flex items-center gap-2">
                  <span>${targetName}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full border ${relationInfo.color} font-bold">
                    ${relationInfo.name}
                  </span>
                </div>
                <div class="text-xs text-white/50 mt-0.5">${relationInfo.perk}</div>
                ${seller80PercentCap !== null && this.mode === "buy"
                  ? html`<div class="text-[11px] text-amber-300/80 mt-1">
                      سقف خرید از فروشنده (۸۰٪ کل):
                      <span class="font-mono font-bold text-amber-300">
                        ${seller80PercentCap.toLocaleString("en-US")}
                      </span>
                      سرباز
                    </div>`
                  : ""}
              </div>
            </div>

            <!-- Current Balance Pills -->
            <div class="flex items-center gap-2 text-xs shrink-0 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
              <div class="flex items-center gap-1 font-mono">
                <span class="text-amber-400">🪙</span>
                <span class="font-bold text-white">${renderNumber(myGold)}</span>
              </div>
              <span class="text-white/20">|</span>
              <div class="flex items-center gap-1 font-mono">
                <span class="text-purple-400">⚔️</span>
                <span class="font-bold text-white">${renderNumber(myTroops)}</span>
              </div>
            </div>
          </div>

          <!-- ─── BUY / SELL MODE SWITCHER ─── -->
          <div class="relative z-10 grid grid-cols-2 gap-2 p-1 bg-black/50 rounded-xl border border-white/10">
            <button
              class="py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${this.mode === "buy"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg border border-emerald-400/50"
                : "text-white/60 hover:text-white hover:bg-white/5"}"
              @click=${() => {
                if (this.mode !== "buy") {
                  this.mode = "buy";
                  this.resetDefaults();
                }
              }}
            >
              <span>🛒⚔️</span>
              <span>استخدام و خرید سرباز</span>
            </button>

            <button
              class="py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${this.mode === "sell"
                ? "bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-lg border border-amber-400/50"
                : "text-white/60 hover:text-white hover:bg-white/5"}"
              @click=${() => {
                if (this.mode !== "sell") {
                  this.mode = "sell";
                  this.resetDefaults();
                }
              }}
            >
              <span>💰</span>
              <span>واگذاری و فروش سرباز</span>
            </button>
          </div>

          <!-- ─── EXCHANGE RATE SETTING ─── -->
          <div class="relative z-10 flex flex-col gap-2.5 bg-black/40 border border-white/10 rounded-xl p-3.5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs font-bold text-white/80">نرخ تبادل توافقی (طلا به ازای هر ۱ سرباز):</span>
                <span class="text-[10px] text-white/50 block mt-0.5">ضریب بالاتر = شانس پذیرش بیشتر در هوش مصنوعی</span>
              </div>
              <div class="flex items-center gap-1.5" @click=${(e: Event) => e.stopPropagation()}>
                <button
                  type="button"
                  class="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center cursor-pointer transition-colors"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.setRate(this.customRate - 1);
                  }}
                  title="کاهش ۱ طلا"
                >
                  -
                </button>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max="500"
                  .value=${String(this.customRate)}
                  @input=${(e: Event) => {
                    e.stopPropagation();
                    const val = Number((e.target as HTMLInputElement).value);
                    if (!isNaN(val) && val >= 10 && val <= 500) {
                      this.setRate(val);
                    }
                  }}
                  class="w-16 px-1.5 py-1 text-center font-bold text-sm bg-zinc-900 border border-amber-500/40 rounded-md text-amber-300 focus:outline-none focus:border-amber-400 tabular-nums"
                />
                <button
                  type="button"
                  class="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center cursor-pointer transition-colors"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.setRate(this.customRate + 1);
                  }}
                  title="افزایش ۱ طلا"
                >
                  +
                </button>
                <span class="text-xs text-amber-400 font-bold">طلا</span>
              </div>
            </div>

            <!-- Rate Preset Chips -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] text-white/50">پیشنهاد سریع:</span>
              ${[10, 15, 20, 25, 30, 40, 50].map(
                (preset) => html`
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${this.customRate === preset
                      ? "bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30 scale-105"
                      : "bg-white/5 hover:bg-white/15 text-white/80 border border-white/10"}"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.setRate(preset);
                    }}
                  >
                    ${preset}x
                  </button>
                `,
              )}
            </div>

            ${this.target && this.target.type() === PlayerType.Nation
              ? html`
                  <div class="text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 rounded-lg p-2.5 flex items-start gap-2">
                    <span class="text-sm shrink-0">🧠</span>
                    <span class="leading-relaxed">
                      <strong>طمع ارتش‌های هوش مصنوعی:</strong>
                      فرماندهان بات در فروش سرباز گاهی طمع می‌کنند و فقط نرخ‌های بالا (۲۵x به بالا) را برای فروش ارتش خود می‌پذیرند!
                    </span>
                  </div>
                `
              : ""}
          </div>

          <!-- ─── INTERACTIVE TROOPS SLIDER & INPUT ─── -->
          <div class="relative z-10 flex flex-col gap-3.5 bg-zinc-950/60 border border-white/10 rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-white/70">
                ${this.mode === "buy"
                  ? "تعداد سربازان مورد نیاز جهت استخدام:"
                  : "تعداد سربازان جهت واگذاری (حداکثر ۸۰٪):"}
              </span>
              <div class="flex items-center gap-2">
                <span class="text-lg font-black text-amber-300 tabular-nums">
                  ${this.troopAmount.toLocaleString("en-US")}
                </span>
                <span class="text-xs text-white/50">سرباز</span>
              </div>
            </div>

            <!-- Slider Range -->
            <div class="flex flex-col gap-1.5" dir="ltr">
              <input
                type="range"
                min="0"
                max=${this.mode === "buy" ? Math.max(0, maxBuy) : Math.max(0, maxSell)}
                step="100"
                dir="ltr"
                .value=${String(this.troopAmount)}
                style="background: linear-gradient(to right, #f59e0b 0%, #f59e0b ${(this.mode === "buy" ? maxBuy : maxSell) > 0 ? Math.min(100, Math.max(0, Math.round((this.troopAmount / (this.mode === "buy" ? maxBuy : maxSell)) * 100))) : 0}%, #27272a ${(this.mode === "buy" ? maxBuy : maxSell) > 0 ? Math.min(100, Math.max(0, Math.round((this.troopAmount / (this.mode === "buy" ? maxBuy : maxSell)) * 100))) : 0}%, #27272a 100%);"
                @input=${(e: Event) => {
                  const input = e.target as HTMLInputElement;
                  const val = Number(input.value);
                  this.setTroops(val);
                  const limit = this.mode === "buy" ? maxBuy : maxSell;
                  const p = limit > 0 ? Math.min(100, Math.max(0, Math.round((val / limit) * 100))) : 0;
                  input.style.background = `linear-gradient(to right, #f59e0b 0%, #f59e0b ${p}%, #27272a ${p}%, #27272a 100%)`;
                }}
                class="w-full accent-amber-500 cursor-pointer h-2.5 rounded-lg outline-none"
              />
              <div class="flex justify-between text-[11px] text-white/50 font-mono font-bold" dir="ltr">
                <span class="flex items-center gap-1 text-white/50">
                  <span class="text-white/80">0</span>
                  <span class="text-[10px] text-white/40">(حداقل)</span>
                </span>
                <span class="flex items-center gap-1 text-amber-300">
                  <span>${(this.mode === "buy" ? maxBuy : maxSell).toLocaleString("en-US")}</span>
                  <span class="text-[10px] text-amber-400/60">(سقف مجاز)</span>
                </span>
              </div>
            </div>

            <!-- Quick Preset Chips -->
            <div class="flex flex-wrap items-center justify-between gap-1.5 pt-1" dir="ltr">
              <div class="flex items-center gap-1" dir="ltr">
                ${[25, 50, 75, 100].map(
                  (pct) => html`
                    <button
                      class="px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${this.selectedPercent === pct
                        ? "bg-amber-500 text-black shadow"
                        : "bg-white/10 hover:bg-white/20 text-white/80"}"
                      @click=${() => this.applyPercent(pct)}
                    >
                      ${pct === 100 ? "حداکثر سهمیه" : `${pct}٪`}
                    </button>
                  `,
                )}
              </div>

              <div class="flex items-center gap-1" dir="ltr">
                ${[1000, 5000, 20000, 50000].map(
                  (step) => html`
                    <button
                      class="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-white/70 text-[11px] tabular-nums font-bold cursor-pointer"
                      @click=${() => this.addTroopsStep(step)}
                    >
                      +${renderNumber(step)}
                    </button>
                  `,
                )}
              </div>
            </div>

            <!-- ─── CALCULATION SUMMARY CARD ─── -->
            <div
              class="mt-1 rounded-xl border p-3 flex items-center justify-between ${this.mode === "buy"
                ? "bg-emerald-950/20 border-emerald-500/30"
                : "bg-amber-950/20 border-amber-500/30"}"
            >
              <div class="flex flex-col">
                <span class="text-[11px] text-white/60">
                  ${this.mode === "buy"
                    ? "مبلغ طلای پرداختی از خزانه:"
                    : "درآمد طلا دریافتی به خزانه:"}
                </span>
                <div class="flex items-center gap-1 text-lg font-black tabular-nums mt-0.5 ${this.mode === "buy" ? "text-red-400" : "text-emerald-400"}">
                  <span>${this.mode === "buy" ? "-" : "+"}</span>
                  <span>${costOrGain.toLocaleString("en-US")}</span>
                  <span class="text-xs font-bold text-amber-300">سکه طلا 🪙</span>
                </div>
              </div>

              <div class="text-left">
                <span class="text-[11px] text-white/60">نرخ نهایی:</span>
                <div class="text-xs font-bold text-white/90 mt-0.5 tabular-nums">
                  1 سرباز = ${this.customRate} طلا
                </div>
              </div>
            </div>

            <!-- ─── INSUFFICIENT GOLD OR LIMIT WARNING ─── -->
            ${this.mode === "buy" && !hasEnoughGoldForBuy
              ? html`
                  <div
                    class="rounded-lg bg-red-950/60 border border-red-500/60 p-2.5 flex items-center gap-2 text-xs text-red-300 animate-pulse"
                  >
                    <span>⚠️</span>
                    <span>
                      موجودی طلای شما برای این خرید کافی نیست! (کسری:
                      ${(costOrGain - myGold).toLocaleString("en-US")} طلا)
                    </span>
                  </div>
                `
              : ""}

            ${maxBuy <= 0 && this.mode === "buy"
              ? html`
                  <div
                    class="rounded-lg bg-amber-950/40 border border-amber-500/40 p-2.5 flex items-center gap-2 text-xs text-amber-300"
                  >
                    <span>ℹ️</span>
                    <span>
                      ${myGold < this.customRate
                        ? "طلای کافی برای خرید حتی ۱ سرباز در خزانه ندارید!"
                        : "فروشنده نیرو یا سهمیه کافی برای واگذاری ندارد."}
                    </span>
                  </div>
                `
              : ""}
          </div>

          <!-- ─── ACTION BUTTONS ─── -->
          <div class="relative z-10 flex items-center justify-end gap-3 pt-1">
            <button
              class="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs font-bold transition-all cursor-pointer"
              @click=${this.closeModal}
            >
              انصراف
            </button>

            <button
              ?disabled=${!canSubmitTrade}
              class="flex-1 sm:flex-initial px-7 py-2.5 rounded-xl font-black text-sm transition-all shadow-xl flex items-center justify-center gap-2 ${!canSubmitTrade
                ? "bg-zinc-700 text-white/40 cursor-not-allowed border border-white/5 opacity-60"
                : this.mode === "buy"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black shadow-emerald-900/30 cursor-pointer"
                  : "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black shadow-amber-900/30 cursor-pointer"}"
              @click=${this.confirmTrade}
            >
              <span>
                ${this.mode === "buy"
                  ? !hasEnoughGoldForBuy
                    ? "طلا کافی نیست 🪙"
                    : "تایید و استخدام سربازان ⚔️"
                  : "تایید و واگذاری به خریدار 💰"}
              </span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

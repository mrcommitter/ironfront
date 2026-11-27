import { html, LitElement, render } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import {
  DOCTRINES,
  getDoctrineMode,
  getEnforcedDoctrine,
  getDisabledTacticalPowers,
  getPreferredDoctrine,
  setPreferredDoctrine,
  canChangeDoctrineInGame,
  MilitaryDoctrine,
  TACTICAL_POWERS,
  TacticalPower,
} from "../../../core/TacticalDoctrine";
import { Controller } from "../../Controller";
import { DragEvent, MouseMoveEvent, MouseUpEvent, ZoomEvent } from "../../InputHandler";
import { TransformHandler } from "../../TransformHandler";
import { UIState } from "../../UIState";
import { renderNumber, showToast } from "../../Utils";
import { GameView, PlayerView } from "../../view";
import { Cell, UnitType } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import {
  SendAttackIntentEvent,
  SendBuildOilDerrickIntentEvent,
  SendPurchaseFuelIntentEvent,
  SendSelectDoctrineIntentEvent,
  SendSetWarMobilizationIntentEvent,
  SendTacticalStrikeIntentEvent,
} from "../../Transport";
import {
  getDepositOwner,
  getOilDeposits,
  OilDeposit,
  OIL_DERRICK_COST_GOLD,
  STRATEGIC_FUEL_BUY_AMOUNT,
  STRATEGIC_FUEL_BUY_COST_GOLD,
} from "../../../core/game/OilSystem";
import { stealthManager } from "../../view/StealthManager";
import { AccountService } from "../../AccountService";
import {
  playLaserSound,
  playNukeRumble,
  playPlunderSound,
  playTargetLockSound,
  showCruiseMissileStrikeVFX,
  showEMPShockwaveVFX,
  showFloatingPlunder,
  showReconDroneScanVFX,
  triggerScreenShake,
} from "../../view/CombatVFX";

const medalIcon = assetUrl("images/MedalIconWhite.svg");
const targetIcon = assetUrl("images/TargetIconWhite.svg");
const explosionIcon = assetUrl("images/ExplosionIconWhite.svg");
const shieldIcon = assetUrl("images/ShieldIconWhite.svg");
const goldCoinIcon = assetUrl("images/GoldCoinIcon.svg");
const speedIcon = assetUrl("images/FastForwardIconSolidWhite.svg");
const radarIcon = assetUrl("images/FocusIconWhite.svg");
const siloIcon = assetUrl("images/MissileSiloIconWhite.svg");
const samIcon = assetUrl("images/SamLauncherIconWhite.svg");

const POWER_ICONS: Record<string, string> = {
  cruise_missile: targetIcon,
  emp_strike: explosionIcon,
  iron_dome: shieldIcon,
  war_bonds: goldCoinIcon,
  war_surge: speedIcon,
  recon_drone: radarIcon,
  stealth_silo: siloIcon,
  stealth_sam: samIcon,
};

@customElement("tactical-command-hud")
export class TacticalCommandHUD extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;
  public transformHandler: TransformHandler;

  @state() private isOpen: boolean = false;
  @state() private activeDoctrine: MilitaryDoctrine = MilitaryDoctrine.Blitzkrieg;
  @state() private activeTab: "doctrines" | "powers" | "strategy" = "powers";
  @state() private activeTargetingPower: TacticalPower | null = null;
  @state() private cursorX: number = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  @state() private cursorY: number = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
  @state() private hoveredPower: TacticalPower | null = null;
  @state() private cooldowns: Map<string, number> = new Map();
  @state() private warBondRemainingSeconds: number = 0;
  @state() private blitzSurgeActive: boolean = false;
  @state() private ironDomeActive: boolean = false;

  private warBondTimerId: number | null = null;
  private tickerIntervalId: number | null = null;
  private lastTransformX: number = 0;
  private lastTransformY: number = 0;
  private lastTransformScale: number = 0;
  private overlayHost: HTMLDivElement | null = null;

  createRenderRoot() {
    return this; // Seamless Tailwind styling matching native OpenFront HUD
  }

  private ensureOverlayHost() {
    if (!this.overlayHost && typeof document !== "undefined") {
      this.overlayHost = document.createElement("div");
      this.overlayHost.id = "tactical-hud-viewport-overlay";
      this.overlayHost.className =
        "fixed inset-0 pointer-events-none z-[195] overflow-hidden select-none";
      document.body.appendChild(this.overlayHost);
    }
  }

  init() {
    const mode = getDoctrineMode();
    if (mode === "host_enforced") {
      this.activeDoctrine = getEnforcedDoctrine();
    } else {
      this.activeDoctrine = getPreferredDoctrine();
    }
    this.eventBus.emit(new SendSelectDoctrineIntentEvent(this.activeDoctrine));

    if (this.tickerIntervalId !== null) {
      clearInterval(this.tickerIntervalId);
    }

    this.ensureOverlayHost();

    this.eventBus.on(MouseUpEvent, (e: MouseUpEvent) => {
      if (this.activeTargetingPower) {
        this.executeTargetedPower(e.x, e.y);
      }
    });

    this.eventBus.on(MouseMoveEvent, (e: MouseMoveEvent) => {
      if (this.activeTargetingPower) {
        this.cursorX = e.x;
        this.cursorY = e.y;
        this.requestUpdate();
      }
    });

    this.eventBus.on(ZoomEvent, () => {
      this.requestUpdate();
    });

    this.eventBus.on(DragEvent, () => {
      this.requestUpdate();
    });

    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("keydown", this.onWindowKeyDown);
    window.addEventListener("contextmenu", this.onWindowContextMenu);
    window.addEventListener("resize", this.onWindowResize);

    this.tickerIntervalId = window.setInterval(() => {
      this.tickCooldowns();
      const myPlayer = this.game?.myPlayer();
      const isAlive = !!(myPlayer && myPlayer.isAlive());
      if (isAlive !== this.playerWasAlive) {
        this.playerWasAlive = isAlive;
        this.requestUpdate();
      }
    }, 500);
  }

  private playerWasAlive: boolean = false;

  private onWindowPointerMove = (e: PointerEvent) => {
    if (this.activeTargetingPower) {
      this.cursorX = e.clientX;
      this.cursorY = e.clientY;
      this.requestUpdate();
    }
  };

  private onWindowResize = () => {
    this.requestUpdate();
  };

  private isTextInput(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    );
  }

  private onWindowKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.activeTargetingPower) {
      this.cancelTargeting();
      return;
    }

    if (
      (e.code === "KeyF" || e.key === "f" || e.key === "F") &&
      !this.isTextInput(e.target)
    ) {
      const config = this.game?.config()?.grandStrategyConfig();
      if (config?.enabled && config.frontlineAssault) {
        const myPlayer = this.game?.myPlayer();
        if (myPlayer && myPlayer.isAlive() && !this.uiState?.tacticalTargeting) {
          e.preventDefault();
          this.executeFrontlineAssault();
        }
      }
    }
  };

  private onWindowContextMenu = (e: MouseEvent) => {
    if (this.activeTargetingPower) {
      e.preventDefault();
      e.stopPropagation();
      this.cancelTargeting();
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    window.removeEventListener("keydown", this.onWindowKeyDown);
    window.removeEventListener("contextmenu", this.onWindowContextMenu);
    window.removeEventListener("resize", this.onWindowResize);
    if (this.overlayHost) {
      this.overlayHost.remove();
      this.overlayHost = null;
    }
    if (this.tickerIntervalId !== null) {
      clearInterval(this.tickerIntervalId);
      this.tickerIntervalId = null;
    }
    if (this.warBondTimerId !== null) {
      clearInterval(this.warBondTimerId);
      this.warBondTimerId = null;
    }
  }

  protected updated() {
    this.renderPortalOverlay();
  }

  private renderPortalOverlay() {
    this.ensureOverlayHost();
    if (!this.overlayHost) return;

    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      render(html``, this.overlayHost);
      return;
    }

    const overlayContent = html`
      ${this.activeTargetingPower
        ? html`
            <div class="fixed inset-0 pointer-events-none z-[1000] overflow-hidden select-none">
              <div
                class="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
                style="left: ${this.cursorX}px; top: ${this.cursorY}px;"
              >
                ${this.renderTargetingReticle(this.activeTargetingPower)}
              </div>
            </div>

            <div
              class="fixed top-14 left-1/2 -translate-x-1/2 z-[1005] flex items-center gap-2.5 px-4 py-1.5 rounded-md bg-gray-900/95 border border-cyan-500/80 text-white shadow-2xl backdrop-blur-md pointer-events-auto select-none"
              style="direction: rtl;"
            >
              <img
                src=${POWER_ICONS[this.activeTargetingPower.id]}
                width="16"
                height="16"
                class="shrink-0"
              />
              <span class="text-xs font-bold text-cyan-200">
                هدف‌گیری ${this.activeTargetingPower.persianName}: روی نقشه کلیک کنید (لغو با راست‌کلیک یا ESC)
              </span>
              <button
                class="px-2 py-0.5 text-xs font-bold rounded-sm bg-slate-700 hover:bg-slate-600 text-white cursor-pointer mr-2 shadow-sm"
                @click=${() => this.cancelTargeting()}
              >
                انصراف ✕
              </button>
            </div>
          `
        : ""}
      ${this.renderStealthUnitOverlays()}
      ${this.renderOilDepositOverlays()}
    `;

    render(overlayContent, this.overlayHost);
  }

  private cancelTargeting() {
    this.activeTargetingPower = null;
    if (this.uiState) this.uiState.tacticalTargeting = false;
    this.requestUpdate();
  }

  private tickCooldowns() {
    const now = Date.now();
    let hasChanges = false;
    for (const [id, expiry] of this.cooldowns.entries()) {
      if (now >= expiry) {
        this.cooldowns.delete(id);
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.requestUpdate();
    }
  }

  public tick(): void {
    const myPlayer = this.game?.myPlayer();
    const isAlive = !!(myPlayer && myPlayer.isAlive());
    if (isAlive !== this.playerWasAlive) {
      this.playerWasAlive = isAlive;
      this.requestUpdate();
    }

    if (this.transformHandler) {
      const tx = this.transformHandler.offsetX + this.transformHandler.shakeOffsetX;
      const ty = this.transformHandler.offsetY + this.transformHandler.shakeOffsetY;
      const scale = this.transformHandler.scale;
      if (
        tx !== this.lastTransformX ||
        ty !== this.lastTransformY ||
        scale !== this.lastTransformScale
      ) {
        this.lastTransformX = tx;
        this.lastTransformY = ty;
        this.lastTransformScale = scale;
        if (
          stealthManager.getAllStealthUnits().length > 0 ||
          this.activeTargetingPower ||
          this.game?.config()?.grandStrategyConfig()?.oilEconomy
        ) {
          this.requestUpdate();
        }
      }
    }
  }

  private toggleOpen() {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) {
      this.cancelTargeting();
    }
    this.requestUpdate();
  }

  public toggleWarMobilization() {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      showToast("ابتدا باید در بازی مستقر باشید!", "red");
      return;
    }
    const config = this.game?.config()?.grandStrategyConfig();
    if (!config?.enabled || !config.warMobilization) {
      showToast("قوانین بسیج جنگی در تنظیمات این بازی فعال نیست.", "red");
      return;
    }

    const current = myPlayer.warMobilization();
    const nextState = !current;
    this.eventBus.emit(new SendSetWarMobilizationIntentEvent(nextState));

    if (nextState) {
      playNukeRumble(2);
      showToast(
        "⚔️ قانون بسیج عمومی جنگی فعال شد! (+۲۵٪ تولید نیرو، -۲۵٪ درآمد طلا، +۱۰٪ تهاجم مرزی)",
        "green",
      );
    } else {
      playPlunderSound();
      showToast(
        "🕊️ وضعیت به اقتصاد غیرنظامی صلح بازگشت (درآمد طلا و تولید عادی).",
        "green",
      );
    }
    this.requestUpdate();
  }

  public purchaseFuelEmergency() {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) return;
    if ((myPlayer.gold() ?? 0n) < STRATEGIC_FUEL_BUY_COST_GOLD) {
      showToast(
        `طلای ناکافی برای خرید اضطراری سوخت (نیاز به ${renderNumber(STRATEGIC_FUEL_BUY_COST_GOLD)} طلا)`,
        "red",
      );
      return;
    }
    this.eventBus.emit(new SendPurchaseFuelIntentEvent(STRATEGIC_FUEL_BUY_AMOUNT));
    playPlunderSound();
    showToast(
      `🛢️ ۵۰ بشکه سوخت استراتژیک از خزانه ملی به ذخایر ارتش اضافه شد!`,
      "green",
    );
    this.requestUpdate();
  }

  public buildOilDerrick(deposit: OilDeposit) {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) return;

    if (deposit.hasDerrick) {
      showToast("روی این میدان نفتی از قبل دکل احداث شده است!", "red");
      return;
    }

    const owner = getDepositOwner(this.game, deposit);
    if (!owner || owner.id() !== myPlayer.id()) {
      showToast(
        deposit.isOffshore
          ? "برای احداث دکل فلات قاره ابتدا باید ساحل مجاور این منطقه را فتح کنید!"
          : "ابتدا باید این منطقه را فتح کنید تا بتوانید دکل نفتی احداث نمایید!",
        "red",
      );
      return;
    }

    if ((myPlayer.gold() ?? 0n) < OIL_DERRICK_COST_GOLD) {
      showToast(
        `طلای کافی برای احداث دکل نفتی ندارید (نیاز به ${renderNumber(OIL_DERRICK_COST_GOLD)} طلا)`,
        "red",
      );
      return;
    }

    deposit.hasDerrick = true;
    deposit.ownerId = myPlayer.id();

    this.eventBus.emit(new SendBuildOilDerrickIntentEvent(deposit.tile));
    playPlunderSound();
    showToast(
      deposit.isOffshore
        ? `🏗️ دکل فلات قاره دریایی احداث شد! نفت استخراج‌شده توسط نفت‌کش‌ها به بنادر شما حمل می‌شود (+۲۵۰ ظرفیت مخازن).`
        : `🏗️ دکل استخراج نفت زمینی احداث شد! استخراج سوخت مستقیماً از طریق خط لوله پمپاژ می‌شود (+۲۵۰ ظرفیت مخازن).`,
      "green",
    );
    this.requestUpdate();
  }

  public buildNearestOilDerrick() {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) return;

    const deposits = getOilDeposits(this.game);
    const candidate = deposits.find(
      (d) =>
        getDepositOwner(this.game, d)?.id() === myPlayer.id() && !d.hasDerrick,
    );

    if (!candidate) {
      const alreadyHasAll = deposits.some(
        (d) =>
          getDepositOwner(this.game, d)?.id() === myPlayer.id() && d.hasDerrick,
      );
      if (alreadyHasAll) {
        showToast("روی تمام میدان‌های نفتی تحت کنترلتان دکل احداث شده است!", "green");
      } else {
        showToast(
          "شما هنوز هیچ میدان نفتی را فتح نکرده‌اید! ابتدا به مناطق دارای نفت یا سواحل مجاور فلات‌های نفتی پیشروی کنید.",
          "red",
        );
      }
      return;
    }

    this.buildOilDerrick(candidate);
  }

  private renderOilDepositOverlays() {
    const gs = this.game?.config()?.grandStrategyConfig();
    if (!gs?.enabled || !gs.oilEconomy) return html``;

    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) return html``;

    if (!this.transformHandler) return html``;

    const deposits = getOilDeposits(this.game);
    if (!deposits || deposits.length === 0) return html``;

    const winW = typeof window !== "undefined" ? window.innerWidth : 1920;
    const winH = typeof window !== "undefined" ? window.innerHeight : 1080;
    const myId = myPlayer.id();
    const hasActivePort = myPlayer.units(UnitType.Port).some((p) => p.isActive() && !p.markedForDeletion());

    return html`
      <div class="fixed inset-0 pointer-events-none z-[185] overflow-hidden select-none">
        ${deposits.map((dep) => {
          const screen = this.transformHandler.worldToScreenCoordinates(dep.cell);
          if (
            screen.x < -100 ||
            screen.x > winW + 100 ||
            screen.y < -100 ||
            screen.y > winH + 100
          ) {
            return html``;
          }

          const owner = getDepositOwner(this.game, dep);
          const isMyField = owner && owner.id() === myId;
          const isHostile = owner && owner.isPlayer() && owner.id() !== myId;

          return html`
            <div
              class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center justify-center transition-transform group cursor-pointer"
              style="left: ${screen.x}px; top: ${screen.y}px;"
              @pointerdown=${(e: PointerEvent) => e.stopPropagation()}
              @mousedown=${(e: MouseEvent) => e.stopPropagation()}
              @click=${(e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (isMyField && !dep.hasDerrick) {
                  this.buildOilDerrick(dep);
                } else if (!isMyField) {
                  showToast(
                    dep.isOffshore
                      ? "فلات قاره نفتی: برای تسلط بر این میدان دریایی و احداث دکل، ساحل مجاور آن را فتح کنید."
                      : "میدان نفت زمینی: برای احداث دکل ابتدا باید این منطقه را فتح کنید.",
                    "red",
                  );
                } else if (isMyField && dep.hasDerrick) {
                  if (dep.isOffshore && !hasActivePort) {
                    showToast(
                      "⚠️ دکل دریایی فعال است، اما برای پهلوگیری نفت‌کش‌ها و انتقال نفت خام نیاز به احداث حداقل یک بندر فعال (Port ⚓) در ساحل دارید!",
                      "red",
                    );
                  } else {
                    showToast(
                      dep.isOffshore
                        ? "دکل دریایی فعال است: نفت استخراج‌شده توسط نفت‌کش‌ها به نزدیک‌ترین بندر شما حمل می‌شود."
                        : "دکل زمینی فعال است: نفت خام مستقیماً از طریق خطوط لوله پمپاژ می‌شود (+۱۲/ثانیه).",
                      "green",
                    );
                  }
                }
              }}
            >
              <!-- Clean Minimalist Pin: No clutter on the map -->
              <div
                class="w-6 h-6 rounded-full border ${isMyField
                  ? dep.hasDerrick
                    ? dep.isOffshore && !hasActivePort
                      ? "border-amber-400 bg-amber-500/35 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                      : "border-amber-400 bg-amber-500/25 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    : "border-emerald-400 bg-emerald-500/35 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse"
                  : isHostile
                    ? "border-red-400/80 bg-red-950/60 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
                    : "border-slate-400/50 bg-slate-900/60 shadow-[0_0_5px_rgba(0,0,0,0.5)]"} flex items-center justify-center backdrop-blur-xs transition-transform duration-150 group-hover:scale-125"
              >
                <span class="text-[11px] leading-none">${dep.hasDerrick ? "🏗️" : dep.isOffshore ? "⚓" : "🛢️"}</span>
              </div>

              <!-- Sleek Tooltip: Only appears on Hover to maintain a clean tactical view -->
              <div
                class="hidden group-hover:flex flex-col items-center absolute bottom-full mb-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border leading-snug shadow-xl whitespace-nowrap backdrop-blur-md z-50 pointer-events-none transition-all ${isMyField
                  ? dep.hasDerrick
                    ? dep.isOffshore && !hasActivePort
                      ? "bg-amber-950/95 border-amber-400/80 text-amber-300"
                      : "bg-amber-950/95 border-amber-400/80 text-amber-200"
                    : "bg-emerald-950/95 border-emerald-400/80 text-emerald-200"
                  : "bg-slate-950/95 border-slate-700 text-slate-200"}"
              >
                <span>
                  ${dep.hasDerrick
                    ? dep.isOffshore
                      ? hasActivePort
                        ? "دکل دریایی فعال (انتقال به بندر ⚓)"
                        : "⚠️ دکل دریایی (نیازمند احداث بندر ⚓)"
                      : "دکل زمینی فعال (+12/s)"
                    : isMyField
                      ? dep.isOffshore
                        ? "کلیک جهت احداث دکل دریایی (۳۵K) 🔨"
                        : "کلیک جهت احداث دکل زمینی (۳۵K) 🔨"
                      : dep.isOffshore
                        ? "فلات نفتی دریایی (ساحل را فتح کنید)"
                        : "میدان نفت زمینی (منطقه را فتح کنید)"}
                </span>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  public async executeFrontlineAssault() {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      showToast("ابتدا باید در بازی مستقر باشید!", "red");
      return;
    }
    const config = this.game?.config()?.grandStrategyConfig();
    if (!config?.enabled || !config.frontlineAssault) {
      showToast("حمله سرتاسری خط مقدم در تنظیمات این بازی فعال نیست.", "red");
      return;
    }
    if (this.game.inSpawnPhase()) {
      showToast("در فاز استقرار اولیه امکان حمله وجود ندارد!", "red");
      return;
    }

    const troops = myPlayer.troops();
    if (troops < 10) {
      showToast("نیروهای شما برای حمله سرتاسری ناکافی است!", "red");
      return;
    }

    try {
      const bt = await myPlayer.borderTiles();
      const myId = myPlayer.smallID();
      const hostileNeighbors = new Map<number, PlayerView>();

      for (const tile of bt.borderTiles) {
        for (const neighbor of this.game.neighbors(tile as TileRef)) {
          const owner = this.game.owner(neighbor);
          if (
            owner &&
            owner.isPlayer() &&
            owner.smallID() !== myId &&
            owner.isAlive() &&
            !myPlayer.isFriendly(owner as any)
          ) {
            hostileNeighbors.set(owner.smallID(), owner as PlayerView);
          }
        }
      }

      const enemies = Array.from(hostileNeighbors.values());
      if (enemies.length === 0) {
        showToast(
          "هیچ مرز مشترکی با کشورهای متخاصم برای پیشروی سرتاسری یافت نشد!",
          "red",
        );
        return;
      }

      const attackRatio = this.uiState?.attackRatio ?? 0.2;
      const totalAttackTroops = Math.floor(troops * attackRatio);
      const troopsPerTarget = Math.max(
        1,
        Math.floor(totalAttackTroops / enemies.length),
      );

      for (const enemy of enemies) {
        this.eventBus.emit(
          new SendAttackIntentEvent(enemy.id(), troopsPerTarget),
        );
      }

      playTargetLockSound();
      triggerScreenShake(2.0, 180);
      showToast(
        `⚔️ پیشروی سرتاسری خط مقدم: حمله همزمان به ${enemies.length} جبهه دشمن آغاز شد!`,
        "green",
      );
    } catch (err) {
      console.warn("Frontline assault failed:", err);
    }
  }

  private selectDoctrine(doctrine: MilitaryDoctrine) {
    const mode = getDoctrineMode();
    if (mode === "host_enforced") {
      showToast(
        "دکترین این مسابقه توسط سازنده اتاق تعیین شده و قفل است.",
        "red",
      );
      return;
    }
    if (!canChangeDoctrineInGame()) {
      showToast(
        "امکان تغییر دکترین در طول بازی توسط سازنده مسابقه غیرفعال شده است.",
        "red",
      );
      return;
    }
    this.activeDoctrine = doctrine;
    setPreferredDoctrine(doctrine);
    this.eventBus.emit(new SendSelectDoctrineIntentEvent(doctrine));
    playPlunderSound();
    showToast(
      `دکترین نظامی «${DOCTRINES[doctrine].persianName}» فعال شد!`,
      "green",
    );
    this.requestUpdate();
  }

  private isPowerOnCooldown(powerId: string): boolean {
    const expiry = this.cooldowns.get(powerId);
    return expiry !== undefined && Date.now() < expiry;
  }

  private getRemainingCooldownSec(powerId: string): number {
    const expiry = this.cooldowns.get(powerId);
    if (!expiry) return 0;
    return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
  }

  private getPowerCooldownMs(power: TacticalPower): number {
    if (
      power.id === "cruise_missile" &&
      (AccountService.hasItem("effect:plasma_nuke") ||
        AccountService.hasItem("bundle:golden_emperor"))
    ) {
      return Math.round(power.cooldownMs * 0.75); // 25% faster cooldown
    }
    if (
      power.id === "emp_strike" &&
      AccountService.hasItem("effect:lightning_strike")
    ) {
      return Math.round(power.cooldownMs * 0.75); // 25% faster cooldown
    }
    return power.cooldownMs;
  }

  private getPowerPerk(powerId: string): string | null {
    if (
      powerId === "cruise_missile" &&
      (AccountService.hasItem("effect:plasma_nuke") ||
        AccountService.hasItem("bundle:golden_emperor"))
    ) {
      return "انفجار پلاسما (۲۵٪ شارژ سریع‌تر + موج انفجار سنگین)";
    }
    if (
      powerId === "emp_strike" &&
      AccountService.hasItem("effect:lightning_strike")
    ) {
      return "صاعقه رعدآسا (۲۵٪ شارژ سریع‌تر)";
    }
    if (
      powerId === "war_bonds" &&
      (AccountService.hasItem("crown:emperor_gold") ||
        AccountService.hasItem("bundle:golden_emperor"))
    ) {
      return "پاداش سلطنتی (+۱,۰۰۰,۰۰۰ طلا بازپرداخت)";
    }
    if (
      powerId === "iron_dome" &&
      (AccountService.hasItem("crown:spartan_crest") ||
        AccountService.hasItem("bundle:iron_general"))
    ) {
      return "سپر اسپارتان (۴۵ ثانیه پایداری)";
    }
    if (powerId === "war_surge" && AccountService.hasItem("effect:fire_trail")) {
      return "تهاجم آتشین (۳۰ ثانیه پیشروی)";
    }
    return null;
  }

  private triggerPower(power: TacticalPower) {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      showToast("ابتدا باید در بازی مستقر باشید!", "red");
      return;
    }

    if (this.isPowerOnCooldown(power.id)) {
      showToast(
        `قابلیت در حال شارژ است (${this.getRemainingCooldownSec(power.id)} ثانیه)`,
        "red",
      );
      return;
    }

    const currentGold = myPlayer.gold() ?? 0n;
    if (currentGold < power.cost) {
      showToast(
        `طلای ناکافی! نیاز به ${renderNumber(power.cost)} طلا دارید.`,
        "red",
      );
      return;
    }

    const gs = this.game?.config()?.grandStrategyConfig();
    if (power.id === "cruise_missile" && gs?.enabled && gs.oilEconomy) {
      const fuel = myPlayer.fuel?.() ?? 0;
      if (fuel < 25) {
        showToast(
          `سوخت استراتژیک ناکافی برای پرتاب موشک کروز! (نیاز به ۲۵ بشکه سوخت، موجودی: ${Math.floor(fuel)})`,
          "red",
        );
        return;
      }
    }

    if (power.requiresTarget) {
      this.activeTargetingPower = power;
      if (this.uiState) this.uiState.tacticalTargeting = true;
      this.isOpen = false;
      playTargetLockSound();
      showToast(
        `هدف‌گیری ${power.persianName}: روی نقشه کلیک کنید (لغو با راست‌کلیک یا ESC)`,
        "green",
      );
      this.requestUpdate();
      return;
    }

    this.executeInstantPower(power);
  }

  private executeInstantPower(power: TacticalPower) {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) return;
    if (myPlayer.gold() < power.cost) {
      showToast("موجودی طلا برای استفاده از این قابلیت کافی نیست!", "red");
      return;
    }

    const effectiveCooldown = this.getPowerCooldownMs(power);
    this.cooldowns.set(power.id, Date.now() + effectiveCooldown);

    // Dispatch authoritative intent to core game engine
    this.eventBus.emit(new SendTacticalStrikeIntentEvent(power.id, 0));

    if (power.id === "war_bonds") {
      playPlunderSound();
      this.warBondRemainingSeconds = 25;
      const isEmperor =
        AccountService.hasItem("crown:emperor_gold") ||
        AccountService.hasItem("bundle:golden_emperor");
      const payoutText = isEmperor ? "+۱,۰۰۰,۰۰۰ طلا" : "+۷۵۰,۰۰۰ طلا";
      showToast(
        isEmperor
          ? "👑 اوراق قرضه جنگی سلطنتی خریداری شد! بازپرداخت ۱,۰۰۰,۰۰۰ طلا پس از ۲۵ ثانیه (پاداش ویژه امپراتور زرین)."
          : "اوراق قرضه جنگی خریداری شد! ۵۰۰K طلا سرمایه‌گذاری شد؛ بازپرداخت ۷۵۰K طلا پس از ۲۵ ثانیه انجام می‌شود.",
        "green",
      );
      if (this.warBondTimerId !== null) clearInterval(this.warBondTimerId);
      this.warBondTimerId = window.setInterval(() => {
        this.warBondRemainingSeconds--;
        if (this.warBondRemainingSeconds <= 0) {
          if (this.warBondTimerId !== null) {
            clearInterval(this.warBondTimerId);
            this.warBondTimerId = null;
          }
          playPlunderSound();
          if (isEmperor) {
            myPlayer.addGold(250_000n);
          }
          showFloatingPlunder(
            window.innerWidth / 2,
            window.innerHeight * 0.45,
            `${payoutText} بازپرداخت اوراق قرضه!`,
          );
          showToast(
            `سود و اصل اوراق قرضه جنگی (${payoutText}) به خزانه واریز شد!`,
            "green",
          );
        }
        this.requestUpdate();
      }, 1000);
    } else if (power.id === "iron_dome") {
      this.ironDomeActive = true;
      playLaserSound();
      const isSpartan =
        AccountService.hasItem("crown:spartan_crest") ||
        AccountService.hasItem("bundle:iron_general");
      const durationSec = isSpartan ? 45 : 30;
      showToast(
        isSpartan
          ? "🛡️ سامانه پدافند تقویت‌شده گنبد آهنین (پک ژنرال آهنین) به مدت ۴۵ ثانیه فعال شد!"
          : "🛡️ سامانه پدافند لیزری گنبد آهنین به مدت ۳۰ ثانیه فعال شد! کلیه کلاهک‌های ورودی به حریم هوایی رهگیری و نابود می‌شوند.",
        "green",
      );
      setTimeout(() => {
        this.ironDomeActive = false;
        this.requestUpdate();
      }, durationSec * 1000);
    } else if (power.id === "war_surge") {
      this.blitzSurgeActive = true;
      playNukeRumble(4);
      triggerScreenShake(2.5, 200);
      const isFireTrail = AccountService.hasItem("effect:fire_trail");
      const durationSec = isFireTrail ? 30 : 20;
      showToast(
        isFireTrail
          ? "🔥 مارش تهاجم آتشین شعله‌ور (دنباله آتشین شاپ) به مدت ۳۰ ثانیه فعال شد!"
          : "🔥 مارش سراسری تهاجم آغاز شد! نیروهای خط مقدم تقویت شده و پیشروی فوق‌سریع به مدت ۲۰ ثانیه فعال شد.",
        "green",
      );
      setTimeout(() => {
        this.blitzSurgeActive = false;
        this.requestUpdate();
      }, durationSec * 1000);
    }

    this.requestUpdate();
  }

  private executeTargetedPower(screenX: number, screenY: number) {
    const power = this.activeTargetingPower;
    this.activeTargetingPower = null;
    setTimeout(() => {
      if (this.uiState) this.uiState.tacticalTargeting = false;
    }, 120);
    if (!power) return;

    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) return;
    if (myPlayer.gold() < power.cost) {
      showToast("موجودی طلا برای استفاده از این سلاح کافی نیست!", "red");
      return;
    }

    const gs = this.game?.config()?.grandStrategyConfig();
    if (power.id === "cruise_missile" && gs?.enabled && gs.oilEconomy) {
      const fuel = myPlayer.fuel?.() ?? 0;
      if (fuel < 25) {
        showToast(
          `سوخت استراتژیک ناکافی برای پرتاب موشک کروز! (نیاز به ۲۵ بشکه سوخت، موجودی: ${Math.floor(fuel)})`,
          "red",
        );
        return;
      }
    }

    const worldPos = this.transformHandler?.screenToWorldCoordinates(screenX, screenY);
    if (!worldPos || !this.game.isValidCoord(worldPos.x, worldPos.y)) {
      showToast("موقعیت انتخابی خارج از نقشه بازی است!", "red");
      return;
    }
    const targetRef = this.game.ref(worldPos.x, worldPos.y);

    // Validate placement for stealth structures BEFORE deducting gold or putting on cooldown
    if (power.id === "stealth_silo" || power.id === "stealth_sam") {
      if (this.game.isWater(targetRef)) {
        showToast("امکان احداث سازه روی دریا وجود ندارد!", "red");
        return;
      }
      const tileOwner = this.game.owner(targetRef);
      if (tileOwner !== myPlayer) {
        showToast("سازه‌های نظامی مخفی فقط در قلمرو خودتان قابل احداث هستند!", "red");
        return;
      }
    }

    const effectiveCooldown = this.getPowerCooldownMs(power);
    this.cooldowns.set(power.id, Date.now() + effectiveCooldown);

    if (power.id === "cruise_missile") {
      const isPlasmaNuke =
        AccountService.hasItem("effect:plasma_nuke") ||
        AccountService.hasItem("bundle:golden_emperor");
      const startX = window.innerWidth * 0.5;
      const startY = window.innerHeight * 0.95;

      // Dispatch authoritative tactical strike to core game engine
      this.eventBus.emit(
        new SendTacticalStrikeIntentEvent("cruise_missile", targetRef),
      );

      showCruiseMissileStrikeVFX(startX, startY, screenX, screenY, () => {
        if (isPlasmaNuke) {
          playNukeRumble(6);
          triggerScreenShake(6.0, 450);
          showToast(
            "💥 موج انفجار پلاسمای هسته‌ای (ارتقای ویژه شاپ) مختصات هدف را تبخیر کرد!",
            "green",
          );
        }
        // 1. Reveal enemy stealth units within blast impact zone
        const discovered = stealthManager.scanArea(worldPos, 12, 45_000);

        // 2. Query units in blast radius for rich battle feedback
        const nearby = this.game.nearbyUnits(targetRef, 4, [
          UnitType.SAMLauncher,
          UnitType.MissileSilo,
          UnitType.DefensePost,
          UnitType.Factory,
          UnitType.City,
          UnitType.Port,
          UnitType.Warship,
          UnitType.TransportShip,
        ]);

        let enemyStructuresCount = 0;
        for (const { unit } of nearby) {
          if (!unit.isActive()) continue;
          const owner = unit.owner();
          if (owner && owner !== myPlayer && !myPlayer.isFriendly(owner)) {
            enemyStructuresCount++;
          }
        }

        const tileOwner = this.game.owner(targetRef);
        const isEnemyTerritory =
          tileOwner &&
          tileOwner.isPlayer() &&
          tileOwner !== myPlayer &&
          !myPlayer.isFriendly(tileOwner as any);

        if (enemyStructuresCount > 0) {
          showFloatingPlunder(
            screenX,
            screenY,
            `💥 انهدام ${enemyStructuresCount} موضع/سازه دشمن!`,
          );
          showToast(
            `🎯 اصابت دقیق کروز تاکتیکی: ${enemyStructuresCount} سازه/پدافند دشمن منهدم شد!`,
            "green",
          );
        } else if (isEnemyTerritory) {
          showFloatingPlunder(
            screenX,
            screenY,
            "💥 اصابت کروز: تارومار مواضع دشمن!",
          );
          showToast(
            "🎯 اصابت سهمگین موشک کروز به خطوط مقدم و نیروهای دشمن در نقطه هدف!",
            "green",
          );
        } else if (discovered.length > 0) {
          showFloatingPlunder(
            screenX,
            screenY,
            `🔍 کشف ${discovered.length} پایگاه مخفی!`,
          );
          showToast(
            `🎯 اصابت موشک کروز: ${discovered.length} سازه پنهان دشمن در محل برخورد آشکار شد!`,
            "green",
          );
        } else {
          showFloatingPlunder(screenX, screenY, "💥 اصابت کروز تاکتیکی");
          showToast("موشک کروز شلیک شد و نقطه هدف را در هم کوبید!", "green");
        }
      });
    } else if (power.id === "emp_strike") {
      // Dispatch authoritative EMP strike to core engine
      this.eventBus.emit(
        new SendTacticalStrikeIntentEvent("emp_strike", targetRef),
      );

      showEMPShockwaveVFX(screenX, screenY, 190);
      triggerScreenShake(2.4, 220);
      stealthManager.scanArea(worldPos, 18, 30_000);

      const affectedUnits = this.game.nearbyUnits(
        targetRef,
        18,
        [UnitType.SAMLauncher, UnitType.MissileSilo],
      );
      let disabledCount = 0;
      for (const { unit } of affectedUnits) {
        if (!unit.isActive()) continue;
        const owner = unit.owner();
        if (owner && owner !== myPlayer && !myPlayer.isFriendly(owner)) {
          disabledCount++;
        }
      }
      if (disabledCount > 0) {
        showFloatingPlunder(
          screenX,
          screenY,
          `⚡ EMP: ${disabledCount} پدافند فلج شدند!`,
        );
        showToast(
          `⚡ پالس EMP سامانه‌های راداری و شلیک ${disabledCount} پدافند دشمن را موقتاً فلج کرد!`,
          "green",
        );
      } else {
        showFloatingPlunder(screenX, screenY, "⚡ پالس EMP فعال شد!");
        showToast(
          "پالس EMP به مدت ۲۵ ثانیه پدافندها و رادارهای این منطقه را فلج کرد!",
          "green",
        );
      }
    } else if (power.id === "recon_drone") {
      this.eventBus.emit(
        new SendTacticalStrikeIntentEvent("recon_drone", targetRef),
      );
      const scale = this.transformHandler?.scale ?? 10;
      const radiusPx = Math.max(120, Math.min(650, Math.round(28 * scale)));
      showReconDroneScanVFX(screenX, screenY, radiusPx);
      const discovered = stealthManager.scanArea(worldPos, 28, 60_000);
      if (discovered.length > 0) {
        showToast(
          `🛰️ اسکن پهپاد شناسایی: ${discovered.length} پایگاه و سازه مخفی دشمن در این محدوده کشف شد!`,
          "green",
        );
      } else {
        showToast(
          "🛰️ اسکن پهپاد شناسایی: منطقه به شعاع بمب هیدروژنی اسکن شد. تهدید پنهانی یافت نشد.",
          "green",
        );
      }
    } else if (power.id === "stealth_silo") {
      stealthManager.registerStealthUnit(
        targetRef,
        UnitType.MissileSilo,
        myPlayer.smallID(),
        worldPos,
      );
      this.eventBus.emit(
        new SendTacticalStrikeIntentEvent("stealth_silo", targetRef),
      );
      showToast("🔒 سیلوی موشک مخفی در موقعیت مورد نظر احداث گردید!", "green");
    } else if (power.id === "stealth_sam") {
      stealthManager.registerStealthUnit(
        targetRef,
        UnitType.SAMLauncher,
        myPlayer.smallID(),
        worldPos,
      );
      this.eventBus.emit(
        new SendTacticalStrikeIntentEvent("stealth_sam", targetRef),
      );
      showToast("🕶️ پدافند سام مخفی با رادار خاموش در موقعیت مستقر شد!", "green");
    }

    this.cancelTargeting();
  }

  private renderTargetingReticle(power: TacticalPower) {
    if (power.id === "cruise_missile") {
      return html`
        <div class="relative flex items-center justify-center pointer-events-none select-none">
          <div class="absolute w-24 h-24 border-2 border-red-500/50 rounded-full animate-ping pointer-events-none opacity-30"></div>
          <svg width="68" height="68" viewBox="0 0 68 68" class="text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.9)]">
            <!-- Rotating outer dashed ring -->
            <circle cx="34" cy="34" r="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 5" class="animate-spin" style="animation-duration: 14s;" />
            <!-- Inner precision circle -->
            <circle cx="34" cy="34" r="14" fill="rgba(239,68,68,0.18)" stroke="currentColor" stroke-width="1.8" />
            <!-- Crosshairs -->
            <line x1="34" y1="4" x2="34" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <line x1="34" y1="50" x2="34" y2="64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <line x1="4" y1="34" x2="18" y2="34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <line x1="50" y1="34" x2="64" y2="34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <!-- Center target dot -->
            <circle cx="34" cy="34" r="3" fill="#ffffff" />
          </svg>
          <div class="absolute -bottom-7 px-2.5 py-0.5 rounded bg-black/90 border border-red-500/80 text-[10px] font-mono text-red-400 whitespace-nowrap shadow-xl">
            🎯 LOCK: موشک کروز تاکتیکی
          </div>
        </div>
      `;
    }

    if (power.id === "emp_strike") {
      return html`
        <div class="relative flex items-center justify-center pointer-events-none select-none">
          <div
            class="rounded-full border-2 border-cyan-400/90 bg-cyan-500/15 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.45)] backdrop-blur-[1px]"
            style="width: 380px; height: 380px;"
          >
            <div class="w-full h-full rounded-full border border-cyan-300/40 border-dashed animate-spin" style="animation-duration: 22s;"></div>
            <div class="absolute flex flex-col items-center gap-1">
              <div class="w-9 h-9 rounded-full bg-cyan-500/30 border border-cyan-400 flex items-center justify-center shadow-[0_0_18px_#22d3ee]">
                <span class="text-base">⚡</span>
              </div>
              <span class="px-2.5 py-0.5 rounded bg-black/90 border border-cyan-500/70 text-[10.5px] font-bold text-cyan-300 shadow-xl whitespace-nowrap">
                ⚡ شعاع پالس تخریب EMP
              </span>
            </div>
          </div>
        </div>
      `;
    }

    if (power.id === "recon_drone") {
      const scale = this.transformHandler?.scale ?? 10;
      const radiusPx = Math.max(120, Math.min(650, Math.round(28 * scale)));
      const diameterPx = radiusPx * 2;
      return html`
        <div class="relative flex items-center justify-center pointer-events-none select-none">
          <div
            class="rounded-full border border-emerald-400/80 bg-emerald-950/20 flex items-center justify-center shadow-[0_0_45px_rgba(16,185,129,0.35)] overflow-hidden"
            style="width: ${diameterPx}px; height: ${diameterPx}px;"
          >
            <!-- Concentric rings -->
            <div class="absolute inset-[33%] rounded-full border border-emerald-400/40 border-dashed"></div>
            <div class="absolute inset-[66%] rounded-full border border-emerald-400/50"></div>
            <!-- Crosshairs -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-full h-[1px] bg-emerald-400/30"></div>
            </div>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="h-full w-[1px] bg-emerald-400/30"></div>
            </div>
            <!-- Radar sweep -->
            <div
              class="absolute inset-0 rounded-full animate-spin"
              style="background: conic-gradient(from 0deg, rgba(16, 185, 129, 0.4) 0deg, rgba(16, 185, 129, 0.05) 50deg, transparent 65deg);"
            ></div>
            <div class="absolute z-10 px-2.5 py-0.5 rounded bg-black/90 border border-emerald-400/80 text-[10.5px] font-bold text-emerald-300 shadow-xl whitespace-nowrap">
              🛰️ شعاع اسکن پهپاد شناسایی (۲۸ تایل)
            </div>
          </div>
        </div>
      `;
    }

    if (power.id === "stealth_silo" || power.id === "stealth_sam") {
      return html`
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none">
          ${power.id === "stealth_sam"
            ? html`
                <div
                  class="absolute rounded-full border border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_25px_rgba(6,182,212,0.3)] animate-pulse"
                  style="width: 280px; height: 280px;"
                ></div>
              `
            : ""}
          <div class="w-13 h-13 rounded-lg border-2 border-amber-400/90 bg-amber-500/25 backdrop-blur-xs flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.55)]">
            <img src=${POWER_ICONS[power.id]} width="26" height="26" class="drop-shadow-md" />
          </div>
          <span class="mt-2 px-2.5 py-0.5 rounded bg-black/95 border border-amber-400/80 text-[10.5px] font-bold text-amber-300 shadow-xl whitespace-nowrap">
            ${power.id === "stealth_silo" ? "🔒 جانمایی سیلوی موشک مخفی" : "🕶️ جانمایی پدافند سام مخفی"}
          </span>
        </div>
      `;
    }

    return html``;
  }

  private renderStealthUnitOverlays() {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer) return html``;
    const myId = myPlayer.smallID();

    const stealthUnits = stealthManager.getAllStealthUnits();
    if (stealthUnits.length === 0) return html``;

    // Prune destroyed or removed units (only after grace period so newly ordered units are never pruned)
    const activeUnits = this.game.units(
      UnitType.MissileSilo,
      UnitType.SAMLauncher,
    );
    const activeTileMap = new Map(activeUnits.map((u) => [u.tile(), u]));
    const now = Date.now();

    const validUnits = stealthUnits.filter((su) => {
      let active = activeTileMap.get(su.tile);
      if (!active) {
        // Try nearby matching unit (within 2 tiles) in case of small spawn offset
        for (const u of activeUnits) {
          if (
            u.type() === su.type &&
            u.owner().smallID() === su.ownerSmallId &&
            this.game.euclideanDistSquared(u.tile(), su.tile) <= 4
          ) {
            active = u;
            su.tile = u.tile();
            break;
          }
        }
      }
      if (active) {
        su.tile = active.tile();
        su.cell = this.game.cell(active.tile());
        return true;
      }

      // Allow 45 seconds grace period for newly ordered units to construct and sync
      if (now - (su.registeredAtMs || 0) < 45_000) {
        return true;
      }

      stealthManager.unregisterStealthUnit(su.tile);
      return false;
    });

    const visibleUnits = validUnits.filter((su) => {
      const isOwner = su.ownerSmallId === myId;
      const isRevealed = now < su.revealedUntilMs;
      return isOwner || isRevealed;
    });

    if (visibleUnits.length === 0) return html``;

    const scale = this.transformHandler?.scale ?? 10;
    const winW = typeof window !== "undefined" ? window.innerWidth : 1920;
    const winH = typeof window !== "undefined" ? window.innerHeight : 1080;

    return html`
      <div class="fixed inset-0 pointer-events-none z-[190] overflow-hidden select-none">
        ${visibleUnits.map((su) => {
          const screen = this.transformHandler.worldToScreenCoordinates(su.cell);
          if (
            screen.x < -120 ||
            screen.x > winW + 120 ||
            screen.y < -120 ||
            screen.y > winH + 120
          ) {
            return html``;
          }

          const isOwner = su.ownerSmallId === myId;
          const isRevealed = now < su.revealedUntilMs;
          const isSilo = su.type === UnitType.MissileSilo;

          // Dimension of the cloaking base ring
          const ringSize = Math.max(36, Math.min(96, Math.round(scale * 2.2)));
          const pillOffset = Math.round(ringSize * 0.5 + 16);

          if (isOwner) {
            // High-tech holographic cloaking matrix for the owner
            const icon = isSilo ? "🔒" : "🕶️";
            const name = isSilo ? "سیلوی مخفی" : "پدافند مخفی";
            const statusText = isSilo ? "استتار فعال" : "رادار خاموش";
            const description = isSilo
              ? "سیلوی موشک پنهانکار: ۱۰۰٪ پنهان از دید و رادار سایر بازیکنان. دشمنان تا زمان اسکن با پهپاد یا انفجار موشک این سیلو را نمی‌بینند."
              : "پدافند هوایی SAM استتارشده: موشک‌های دشمن را ساقط می‌کند در حالی که موقعیت دقیق آن از دشمنان کاملاً مخفی است.";

            return html`
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center transition-transform"
                style="left: ${screen.x}px; top: ${screen.y}px;"
              >
                <!-- Holographic Cloaking Field Base Ring -->
                <div
                  class="rounded-full border-2 ${isSilo
                    ? "border-cyan-400/80 bg-cyan-500/15 shadow-[0_0_22px_rgba(6,182,212,0.5)]"
                    : "border-emerald-400/80 bg-emerald-500/15 shadow-[0_0_22px_rgba(16,185,129,0.5)]"} flex items-center justify-center animate-pulse pointer-events-none"
                  style="width: ${ringSize}px; height: ${ringSize}px;"
                >
                  <div
                    class="w-full h-full rounded-full border ${isSilo
                      ? "border-cyan-300/40"
                      : "border-emerald-300/40"} border-dashed animate-spin pointer-events-none"
                    style="animation-duration: ${isSilo ? "16s" : "20s"};"
                  ></div>
                </div>

                <!-- Floating Tactical Stealth Pill / Badge (Hoverable with Tooltip) -->
                <div
                  class="group pointer-events-auto cursor-help relative flex flex-col items-center z-10"
                  style="margin-top: -${pillOffset}px;"
                >
                  <div
                    class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-950/95 border ${isSilo
                      ? "border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.5)]"
                      : "border-emerald-400/80 shadow-[0_0_12px_rgba(16,185,129,0.5)]"} backdrop-blur-md"
                  >
                    <span class="text-[11px]">${icon}</span>
                    <span class="text-[10.5px] font-bold text-white whitespace-nowrap">${name}</span>
                    <span class="inline-block w-1.5 h-1.5 rounded-full ${isSilo
                      ? "bg-cyan-400"
                      : "bg-emerald-400"} animate-ping"></span>
                    <span class="text-[9px] font-semibold ${isSilo
                      ? "text-cyan-300"
                      : "text-emerald-300"} whitespace-nowrap">${statusText}</span>
                  </div>

                  <!-- Tactical Briefing Tooltip on Hover -->
                  <div
                    class="hidden group-hover:flex flex-col text-right w-64 max-w-[85vw] p-2.5 rounded-md bg-gray-900/98 border ${isSilo
                      ? "border-cyan-400"
                      : "border-emerald-400"} text-white shadow-2xl backdrop-blur-lg absolute bottom-full mb-2 pointer-events-none z-50 text-xs"
                    style="direction: rtl;"
                  >
                    <div class="flex items-center gap-1.5 font-bold text-sm ${isSilo
                      ? "text-cyan-300"
                      : "text-emerald-300"} border-b border-white/10 pb-1 mb-1.5">
                      <span>${icon}</span>
                      <span>${isSilo ? "سیلوی موشک کروز مخفی (Stealth Silo)" : "پدافند هوایی SAM استتار (Stealth SAM)"}</span>
                    </div>
                    <div class="text-[10px] text-emerald-300 font-bold mb-1 flex items-center gap-1">
                      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>وضعیت: مخفی از دید دشمنان (Invisible)</span>
                    </div>
                    <p class="text-[11px] text-gray-200 leading-relaxed mb-1.5">
                      ${description}
                    </p>
                    <div class="text-[9.5px] text-gray-400 border-t border-white/5 pt-1">
                      💡 نکته: این نشانگر فقط برای شما (مالک سازه) نمایش داده می‌شود.
                    </div>
                  </div>
                </div>
              </div>
            `;
          } else {
            // Enemy stealth unit revealed to player by Drone or Cruise Shockwave!
            const remainingSec = Math.max(1, Math.ceil((su.revealedUntilMs - now) / 1000));
            return html`
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center"
                style="left: ${screen.x}px; top: ${screen.y}px;"
              >
                <!-- Red Alert Target Ring around revealed enemy base -->
                <div
                  class="rounded-full border-2 border-red-500/80 bg-red-500/20 shadow-[0_0_24px_rgba(239,68,68,0.7)] flex items-center justify-center animate-ping pointer-events-none"
                  style="width: ${ringSize}px; height: ${ringSize}px; animation-duration: 2s;"
                ></div>

                <div
                  class="pointer-events-auto cursor-help relative flex flex-col items-center z-10"
                  style="margin-top: -${pillOffset}px;"
                >
                  <div
                    class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/95 border border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] backdrop-blur-md animate-pulse"
                  >
                    <span class="text-[11px]">⚠️</span>
                    <span class="text-[10.5px] font-bold text-red-200 whitespace-nowrap">
                      ${isSilo ? "سیلوی مخفی دشمن (لو رفته)!" : "پدافند مخفی دشمن (لو رفته)!"}
                    </span>
                    <span class="text-[9.5px] font-mono text-yellow-300 font-bold whitespace-nowrap">
                      ${remainingSec}s
                    </span>
                  </div>
                </div>
              </div>
            `;
          }
        })}
      </div>
    `;
  }

  render() {
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      return html``;
    }

    const currentDoctrine = DOCTRINES[this.activeDoctrine];
    const gs = this.game?.config()?.grandStrategyConfig();

    return html`
      <!-- Sleek Unified Tactical Command Bar (Clean, Compact, High-UX) -->
      <div
        class="w-full flex flex-col pointer-events-auto select-none border-b border-cyan-500/20 bg-slate-950/95 transition-all"
        style="direction: rtl; font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;"
      >
        <!-- Single Unified Command Strip -->
        <div class="w-full flex items-center justify-between gap-1.5 px-2.5 py-1 text-xs text-gray-200 bg-slate-950/95 overflow-x-auto custom-scrollbar">
          <!-- Right side: Doctrine Badge & War Mobilization -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border shadow-xs cursor-pointer hover:brightness-110 active:scale-95 transition-all ${currentDoctrine.badgeClass}"
              title="دکترین نظامی فعال. کلیک برای باز کردن پنل تسلیحات تاکتیکی"
              @click=${() => this.toggleOpen()}
            >
              <img src=${medalIcon} width="12" height="12" class="opacity-90 drop-shadow-[0_0_4px_rgba(6,182,212,0.6)]" />
              <span>${currentDoctrine.persianName}</span>
            </button>

            ${gs?.enabled && gs.warMobilization
              ? html`
                  <button
                    class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer whitespace-nowrap leading-none shrink-0 ${myPlayer.warMobilization()
                      ? "bg-red-950/90 border-red-500 text-red-200 hover:bg-red-900 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                      : "bg-slate-900/90 border-slate-700/80 hover:border-slate-500 text-slate-300 hover:text-white shadow-xs"}"
                    title=${myPlayer.warMobilization()
                      ? "بسیج عمومی جنگی فعال: ۲۵٪ تولید نیرو، ۱۰٪ حمله بیشتر، ۲۵٪ طلای کمتر. کلیک برای بازگشت به اقتصاد صلح."
                      : "اقتصاد استاندارد صلح: طلای عادی. کلیک برای فعال‌سازی قانون بسیج عمومی جنگی."}
                    @click=${() => this.toggleWarMobilization()}
                  >
                    <span>${myPlayer.warMobilization() ? "⚔️ بسیج" : "🕊️ صلح"}</span>
                    ${myPlayer.warMobilization()
                      ? html`<span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>`
                      : null}
                  </button>
                `
              : null}
          </div>

          <!-- Center: Strategic Oil & Fuel Stockpile Display & Active Buffs -->
          <div class="flex items-center gap-1.5 shrink-0">
            ${gs?.enabled && gs.oilEconomy
              ? html`
                  <div
                    class="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-200 text-[10.5px] shadow-[0_0_8px_rgba(245,158,11,0.2)] cursor-pointer hover:bg-amber-900/70 hover:border-amber-400 transition-all select-none whitespace-nowrap"
                    title="ذخایر سوخت ارتش (HOI4). کشتی‌ها و پرتاب موشک به سوخت نیاز دارند. کلیک برای خرید اضطراری ۵۰ سوخت."
                    @click=${() => this.purchaseFuelEmergency()}
                  >
                    <span class="text-xs">🛢️</span>
                    <span dir="ltr" class="font-mono font-bold text-amber-300 text-[10.5px]">
                      ${Math.floor(myPlayer.fuel?.() ?? 0)}/${myPlayer.fuelCap?.() ?? 500}
                    </span>
                    <span
                      dir="ltr"
                      class="${(myPlayer.fuelRate?.() ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"} font-mono text-[9.5px] font-bold"
                    >
                      (${(myPlayer.fuelRate?.() ?? 0) >= 0 ? "+" : ""}${myPlayer.fuelRate?.() ?? 0}/s)
                    </span>
                  </div>
                `
              : null}

            ${this.warBondRemainingSeconds > 0
              ? html`
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 shadow-xs"
                  >
                    اوراق: ${this.warBondRemainingSeconds}s
                  </span>
                `
              : ""}
            ${this.blitzSurgeActive
              ? html`
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 border border-amber-500/60 text-amber-300 shadow-xs"
                  >
                    مارش
                  </span>
                `
              : ""}
            ${this.ironDomeActive
              ? html`
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 border border-cyan-500/60 text-cyan-300 shadow-xs"
                  >
                    گنبد
                  </span>
                `
              : ""}
          </div>

          <!-- Left side: Frontline Assault [F] & Drawer Toggle -->
          <div class="flex items-center gap-1.5 shrink-0">
            ${gs?.enabled && gs.frontlineAssault
              ? html`
                  <button
                    class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 border border-red-400/80 text-white cursor-pointer shadow-xs transition-all whitespace-nowrap leading-none active:scale-95"
                    title="حمله هماهنگ سرتاسری خط مقدم (کلید F)"
                    @click=${() => this.executeFrontlineAssault()}
                  >
                    <span>⚔️ پیشروی</span>
                    <span class="px-1 py-0.2 rounded bg-black/50 border border-white/20 text-[9px] font-mono text-amber-200">F</span>
                  </button>
                `
              : null}

            <button
              class="flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-cyan-500/40 bg-slate-900/90 hover:bg-cyan-950/60 hover:border-cyan-400 text-cyan-200 text-[10.5px] font-bold cursor-pointer transition-all shadow-xs whitespace-nowrap shrink-0 leading-none select-none"
              @click=${() => this.toggleOpen()}
            >
              <span>${this.isOpen ? "بستن ▲" : "تسلیحات تاکتیکی ▼"}</span>
            </button>
          </div>
        </div>

        <!-- Expanded Drawer -->
        ${this.isOpen
          ? html`
              <div
                class="w-full bg-slate-950/95 border-t border-cyan-500/30 p-2.5 flex flex-col gap-2.5 max-h-[340px] overflow-y-auto overflow-x-hidden custom-scrollbar"
                style="font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;"
              >
                <!-- Drawer Sub-tabs -->
                <div class="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <div class="flex items-center gap-2">
                    <button
                      class="px-3 py-1 rounded-lg text-xs border cursor-pointer transition-all ${this
                        .activeTab === "powers"
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 border-cyan-400 text-white font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                        : "bg-slate-900/80 border-slate-700/60 text-slate-400 hover:text-white"}"
                      @click=${() => {
                        this.activeTab = "powers";
                        this.requestUpdate();
                      }}
                    >
                      تسلیحات تاکتیکی
                    </button>
                    <button
                      class="px-3 py-1 rounded-lg text-xs border cursor-pointer transition-all ${this
                        .activeTab === "doctrines"
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 border-cyan-400 text-white font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                        : "bg-slate-900/80 border-slate-700/60 text-slate-400 hover:text-white"}"
                      @click=${() => {
                        this.activeTab = "doctrines";
                        this.requestUpdate();
                      }}
                    >
                      دکترین نظامی
                    </button>
                    ${this.game?.config()?.grandStrategyConfig()?.enabled
                      ? html`
                          <button
                            class="px-3 py-1 rounded-lg text-xs border cursor-pointer transition-all ${this
                              .activeTab === "strategy"
                              ? "bg-gradient-to-r from-amber-600 to-red-600 border-amber-400 text-white font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                              : "bg-slate-900/80 border-slate-700/60 text-slate-400 hover:text-white"}"
                            @click=${() => {
                              this.activeTab = "strategy";
                              this.requestUpdate();
                            }}
                          >
                            استراتژی کلان (HoI4)
                          </button>
                        `
                      : ""}
                  </div>
                  <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.2)] font-mono font-bold text-xs text-amber-300">
                    <img src=${goldCoinIcon} width="13" height="13" class="drop-shadow-[0_0_4px_rgba(245,158,11,0.6)]" />
                    <span>${renderNumber(myPlayer.gold() ?? 0n)}</span>
                  </div>
                </div>

                <!-- Dedicated Tactical Info Bar (Untruncated, Multi-line, Rich Card) -->
                <div class="px-3.5 py-2 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 rounded-xl border border-cyan-500/30 text-xs text-slate-200 min-h-[48px] flex flex-col justify-center gap-1 shadow-inner select-none">
                  ${this.hoveredPower
                    ? html`
                        <div class="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                          <div class="flex items-center gap-2">
                            <strong class="text-cyan-300 font-bold text-sm flex items-center gap-1.5">
                              <img src=${POWER_ICONS[this.hoveredPower.id]} width="15" height="15" class="drop-shadow-[0_0_4px_rgba(6,182,212,0.6)]" />
                              <span>${this.hoveredPower.persianName}</span>
                            </strong>
                            ${this.getPowerPerk(this.hoveredPower.id)
                              ? html`
                                  <span class="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold leading-none">
                                    ✨ ${this.getPowerPerk(this.hoveredPower.id)}
                                  </span>
                                `
                              : null}
                          </div>
                          <div class="flex items-center gap-1.5 text-amber-300 font-mono font-bold text-xs shrink-0 bg-amber-500/10 border border-amber-400/30 px-2 py-0.5 rounded-lg">
                            <img src=${goldCoinIcon} width="12" height="12" />
                            <span>${renderNumber(this.hoveredPower.cost)} طلا</span>
                          </div>
                        </div>
                        <div class="text-[11.5px] text-slate-300 leading-relaxed">
                          ${this.hoveredPower.description}
                        </div>
                      `
                    : html`
                        <div class="text-slate-400 text-xs text-center flex items-center justify-center gap-1.5 py-0.5">
                          <span class="text-amber-400">💡</span>
                          <span>روی هر سلاح یا قابلیت تاکتیکی نگه دارید تا مشخصات و کاربرد کامل آن نمایش داده شود</span>
                        </div>
                      `}
                </div>

                <!-- Tab 1: Tactical Powers Hotbar (Styled like UnitDisplay) -->
                ${this.activeTab === "powers"
                  ? (() => {
                      const disabledPowers = getDisabledTacticalPowers();
                      const activePowers = TACTICAL_POWERS.filter((p) => !disabledPowers.includes(p.id));
                      if (activePowers.length === 0) {
                        return html`
                          <div class="py-3 text-center text-xs text-slate-400">
                            تمامی قابلیت‌های تاکتیکی در تنظیمات این بازی غیرفعال شده‌اند
                          </div>
                        `;
                      }
                      return html`
                        <div class="flex items-center gap-2 justify-center flex-wrap pt-0.5 pb-1">
                          ${activePowers.map((power) => {
                            const onCd = this.isPowerOnCooldown(power.id);
                            const cdSec = this.getRemainingCooldownSec(power.id);
                            const hasFuel =
                              power.id !== "cruise_missile" ||
                              !gs?.enabled ||
                              !gs.oilEconomy ||
                              (myPlayer.fuel?.() ?? 0) >= 25;
                            const canAfford =
                              (myPlayer.gold() ?? 0n) >= power.cost && hasFuel;
                            const perk = this.getPowerPerk(power.id);

                            return html`
                              <div
                                class="relative flex flex-col items-center select-none"
                                @mouseenter=${() => {
                                  this.hoveredPower = power;
                                  this.requestUpdate();
                                }}
                                @mouseleave=${() => {
                                  this.hoveredPower = null;
                                  this.requestUpdate();
                                }}
                              >
                                <!-- Action Button -->
                                <div
                                  class="border rounded-xl px-2.5 py-1.5 flex items-center gap-2 cursor-pointer relative transition-all duration-150 ${canAfford && !onCd
                                    ? "hover:border-cyan-400 hover:bg-cyan-950/30 bg-slate-900/90 border-slate-700/80 text-white shadow-xs"
                                    : "opacity-45 bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed"}"
                                  title="${power.persianName}: ${power.description}"
                                  @click=${() => this.triggerPower(power)}
                                >
                                  <img
                                    src=${POWER_ICONS[power.id]}
                                    width="16"
                                    height="16"
                                    class="shrink-0 drop-shadow-[0_0_4px_rgba(6,182,212,0.6)]"
                                  />
                                  <span class="text-xs font-bold leading-none">
                                    ${power.persianName}
                                  </span>
                                  ${perk
                                    ? html`
                                        <span class="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold leading-none shrink-0 shadow-xs">
                                          VIP✨
                                        </span>
                                      `
                                    : null}
                                  <div class="flex items-center gap-1 text-amber-300 font-mono text-xs font-bold mr-1 bg-amber-500/10 border border-amber-400/30 px-1.5 py-0.2 rounded-md">
                                    <img src=${goldCoinIcon} width="11" height="11" />
                                    <span>${renderNumber(power.cost)}</span>
                                  </div>
                                  ${power.id === "cruise_missile" && gs?.enabled && gs.oilEconomy
                                    ? html`
                                        <div
                                          class="flex items-center gap-0.5 font-mono text-xs font-bold px-1.5 py-0.2 rounded-md border ${hasFuel
                                            ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                                            : "bg-rose-950/60 border-rose-500/60 text-rose-300"}"
                                          title="نیاز به ۲۵ بشکه سوخت استراتژیک"
                                        >
                                          <span class="text-[10px]">🛢️</span>
                                          <span dir="ltr">25</span>
                                        </div>
                                      `
                                    : null}

                                  ${onCd
                                    ? html`
                                        <div
                                          class="absolute inset-0 bg-slate-950/85 backdrop-blur-[1px] rounded-xl flex items-center justify-center text-xs font-mono font-bold text-cyan-300 border border-cyan-500/40"
                                        >
                                          ${cdSec}s
                                        </div>
                                      `
                                    : null}
                                </div>
                              </div>
                            `;
                          })}
                        </div>
                      `;
                    })()
                  : ""}

                <!-- Tab 2: Doctrines Selector -->
                ${this.activeTab === "doctrines"
                  ? html`
                      ${getDoctrineMode() === "host_enforced"
                        ? html`
                            <div class="px-2.5 py-1.5 mb-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                              <span>👑 دکترین سراسری مسابقه توسط سازنده اتاق تعیین شده است: <strong>${DOCTRINES[this.activeDoctrine]?.persianName}</strong></span>
                              <span class="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-200">قفل شده 🔒</span>
                            </div>
                          `
                        : !canChangeDoctrineInGame()
                          ? html`
                              <div class="px-2.5 py-1.5 mb-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                                <span>🔒 تغییر دکترین در طول مسابقه غیرفعال است (دکترین شما: <strong>${DOCTRINES[this.activeDoctrine]?.persianName}</strong>)</span>
                                <span class="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-200">قفل شده ✕</span>
                              </div>
                            `
                          : html`
                              <div class="px-2.5 py-1 mb-2 text-gray-400 text-[11px] text-center">
                                شما در هر زمان از بازی می‌توانید دکترین نظامی ارتش خود را تغییر دهید
                              </div>
                            `}
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        ${Object.values(DOCTRINES).map((doc) => {
                          const isSelected = this.activeDoctrine === doc.id;
                          const isLocked = getDoctrineMode() === "host_enforced" || !canChangeDoctrineInGame();
                          return html`
                            <div
                              class="flex flex-col justify-between p-2 rounded-sm border transition-colors ${isSelected
                                ? "bg-slate-800 border-slate-400"
                                : "bg-gray-900/80 border-slate-700/70 hover:border-slate-500"} ${isLocked && !isSelected ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}"
                              @click=${() => this.selectDoctrine(doc.id)}
                            >
                              <div class="flex items-center justify-between mb-1">
                                <span class="text-xs font-bold text-white">
                                  ${doc.persianName}
                                </span>
                                ${isSelected
                                  ? html`<span class="text-[10px] text-cyan-300 font-bold">${isLocked ? "قفل شده 🔒" : "فعال ✓"}</span>`
                                  : null}
                              </div>
                              <p class="text-[10.5px] text-gray-300 leading-snug mb-1.5">
                                ${doc.description}
                              </p>
                              <div class="flex flex-col gap-0.5 border-t border-white/5 pt-1">
                                ${doc.buffs.map(
                                  (b) => html`
                                    <span class="text-[9.5px] text-emerald-300/90 font-medium">
                                      • ${b}
                                    </span>
                                  `,
                                )}
                              </div>
                            </div>
                          `;
                        })}
                      </div>
                    `
                  : ""}

                <!-- Tab 3: Grand Strategy (HoI4) Overview -->
                ${this.activeTab === "strategy" &&
                this.game?.config()?.grandStrategyConfig()?.enabled
                  ? (() => {
                      const gs = this.game.config().grandStrategyConfig();
                      return html`
                        <div class="flex flex-col gap-2.5 pb-2">
                          <div class="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between shadow-xs">
                            <span class="font-bold flex items-center gap-2">
                              <span class="text-base">🎖️</span>
                              <span>سامانه استراتژی کلان (Hearts of Iron IV Mode)</span>
                            </span>
                            <span class="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold border border-amber-500/40">فعال ✓</span>
                          </div>

                          <div class="flex flex-col gap-2.5">
                            <!-- Feature 1: Mountains & Terrain -->
                            <div class="p-3.5 rounded-xl border bg-slate-900/90 ${gs.terrainModifiers ? "border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.1)]" : "border-slate-800 opacity-50"} flex flex-col gap-2">
                              <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-white flex items-center gap-2">
                                  <span class="text-base">🏔️</span>
                                  <span class="text-emerald-300 font-bold">عوارض زمین، رشته‌کوه‌ها و دشت‌ها</span>
                                </span>
                                <span class="text-[10.5px] px-2 py-0.5 rounded-md font-bold ${gs.terrainModifiers ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-500"}">
                                  ${gs.terrainModifiers ? "فعال ✓" : "غیرفعال"}
                                </span>
                              </div>
                              <p class="text-xs text-slate-300 leading-relaxed">
                                کوهستان‌ها دژهای مستحکم دفاع طبیعی هستند؛ مدافعان کوهستان ۳۰٪ مقاومت بیشتری در برابر تهاجم دارند و تلفات مهاجم ۳۰٪ افزایش می‌یابد. دشت‌های هموار بستر هجوم برق‌آسا (Blitz) با ۱۵٪ قدرت پیشروی بیشتر هستند.
                              </p>
                              <div class="px-3 py-1.5 rounded-lg bg-black/50 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center justify-between">
                                <span>🏔️ ضریب دفاعی کوهستان: <strong>+۳۰٪</strong></span>
                                <span class="text-slate-600">|</span>
                                <span>⚡ راندمان هجوم دشت: <strong>+۱۵٪</strong></span>
                              </div>
                            </div>

                            <!-- Feature 2: Encirclement & Supply Lines -->
                            <div class="p-3.5 rounded-xl border bg-slate-900/90 ${gs.supplyLines ? "border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.1)]" : "border-slate-800 opacity-50"} flex flex-col gap-2">
                              <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-white flex items-center gap-2">
                                  <span class="text-base">📦</span>
                                  <span class="text-cyan-300 font-bold">خطوط لجستیک، تدارکات و جیب‌های محاصره</span>
                                </span>
                                <span class="text-[10.5px] px-2 py-0.5 rounded-md font-bold ${gs.supplyLines ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-500"}">
                                  ${gs.supplyLines ? "فعال ✓" : "غیرفعال"}
                                </span>
                              </div>
                              <p class="text-xs text-slate-300 leading-relaxed">
                                یگان‌های قطع تدارکات شده دچار قحطی مهمات می‌شوند. اگر قلمروهای محاصره‌شده ارتباط خود را با خاک اصلی کشور از دست بدهند، ۵۰٪ تلفات دفاعی بیشتر متحمل شده و تسلیم می‌شوند.
                              </p>
                              <div class="px-3 py-1.5 rounded-lg bg-black/50 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-center justify-between">
                                <span>🎯 افت کارایی در محاصره کامل: <strong>+۵۰٪ تلفات مدافع</strong></span>
                              </div>
                            </div>

                            <!-- Feature 3: Frontline Assault -->
                            <div class="p-3.5 rounded-xl border bg-slate-900/90 ${gs.frontlineAssault ? "border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.1)]" : "border-slate-800 opacity-50"} flex flex-col gap-2">
                              <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-white flex items-center gap-2">
                                  <span class="text-base">⚔️</span>
                                  <span class="text-red-300 font-bold">پیشروی هماهنگ سرتاسری خط مقدم (Battle Plan)</span>
                                </span>
                                <span class="text-[10.5px] px-2 py-0.5 rounded-md font-bold ${gs.frontlineAssault ? "bg-red-500/20 text-red-300 border border-red-500/40" : "bg-slate-800 text-slate-500"}">
                                  کلید میانبر: F
                                </span>
                              </div>
                              <p class="text-xs text-slate-300 leading-relaxed">
                                مشابه نقشه عملیات ستاد مشترک (Battle Plan) در HoI4، با فشردن کلید F ارتش در تمام جبهه‌های هم‌مرز با متخاصمان به صورت همزمان یورش سنگین آغاز می‌کند.
                              </p>
                              <div class="px-3 py-1.5 rounded-lg bg-black/50 border border-red-500/30 text-red-300 font-mono text-xs flex items-center justify-between">
                                <span>⚡ فرمان آتش سراسری مرزی: <strong>کلید F</strong></span>
                                <span class="text-slate-600">|</span>
                                <span>یورش همزمان تمام لشکرهای خط مقدم</span>
                              </div>
                            </div>

                            <!-- Feature 4: War Mobilization Laws -->
                            <div class="p-3.5 rounded-xl border bg-slate-900/90 ${gs.warMobilization ? "border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.1)]" : "border-slate-800 opacity-50"} flex flex-col gap-2">
                              <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-white flex items-center gap-2">
                                  <span class="text-base">⚖️</span>
                                  <span class="text-amber-300 font-bold">قوانین اقتصاد جنگ و بسیج ملی نیروها</span>
                                </span>
                                <span class="text-[10.5px] px-2 py-0.5 rounded-md font-bold ${myPlayer.warMobilization() ? "bg-red-500/20 text-red-300 border border-red-500/40" : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"}">
                                  ${myPlayer.warMobilization() ? "⚔️ بسیج جنگی فعال" : "🕊️ اقتصاد صلح"}
                                </span>
                              </div>
                              <p class="text-xs text-slate-300 leading-relaxed">
                                تغییر فوری ساختار اقتصادی: افزایش ۲۵٪ سرعت تولید نیرو و ۱۰٪ برتری تهاجمی در ازای ۲۵٪ کاهش درآمد طلای غیرنظامی برای پیشبرد نبردهای فرسایشی طولانی‌مدت.
                              </p>
                              <div class="px-3 py-1.5 rounded-lg bg-black/50 border border-cyan-500/30 text-cyan-300 font-mono text-xs flex items-center justify-between">
                                <span>🎖️ تولید نیرو: <strong>+۲۵٪</strong></span>
                                <span class="text-slate-600">|</span>
                                <span>⚔️ تهاجم: <strong>+۱۰٪</strong></span>
                                <span class="text-slate-600">|</span>
                                <span>💰 درآمد طلا: <strong>-۲۵٪</strong></span>
                              </div>
                            </div>

                            <!-- Feature 5: Air Superiority & Recon -->
                            <div class="p-3.5 rounded-xl border bg-slate-900/90 ${gs.airSupport ? "border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.1)]" : "border-slate-800 opacity-50"} flex flex-col gap-2">
                              <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-white flex items-center gap-2">
                                  <span class="text-base">✈️</span>
                                  <span class="text-sky-300 font-bold">برتری هوایی، پدافند و شناسایی عمقی</span>
                                </span>
                                <span class="text-[10.5px] px-2 py-0.5 rounded-md font-bold ${gs.airSupport ? "bg-sky-500/20 text-sky-300 border border-sky-500/40" : "bg-slate-800 text-slate-500"}">
                                  ${gs.airSupport ? "فعال ✓" : "غیرفعال"}
                                </span>
                              </div>
                              <p class="text-xs text-slate-300 leading-relaxed">
                                پروازهای تجسسی و پهپادهای شناسایی پیشرفته برای رفع مه جنگ (Fog of War) و شناسایی مواضع پدافندی و سیلوهای موشکی پنهان دشمن پیش از هجوم.
                              </p>
                              <div class="px-3 py-1.5 rounded-lg bg-black/50 border border-sky-500/30 text-sky-300 font-mono text-xs flex items-center justify-between">
                                <span>🛰️ شفاف‌سازی استراتژیک عمق خاک دشمن و کشف مواضع سری</span>
                              </div>
                            </div>

                            <!-- Feature 6: Strategic Oil & Fuel System -->
                            <div class="p-3.5 rounded-xl border bg-slate-900/90 ${gs.oilEconomy ? "border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.15)]" : "border-slate-800 opacity-50"} flex flex-col gap-2.5">
                              <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-white flex items-center gap-2">
                                  <span class="text-base">🛢️</span>
                                  <span class="text-amber-300 font-bold">میدان‌های نفتی، استخراج سوخت و پشتیبانی لجستیک ناوگان</span>
                                </span>
                                <span class="text-[10.5px] px-2 py-0.5 rounded-md font-bold ${gs.oilEconomy ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-slate-800 text-slate-500"}">
                                  ${gs.oilEconomy ? "فعال ✓" : "غیرفعال"}
                                </span>
                              </div>
                              <p class="text-xs text-slate-300 leading-relaxed">
                                دقیقاً همانند سامانه سوخت Hearts of Iron IV، نفت خام مایه حیات ناوگان دریایی و موشک‌هاست. در فلات‌های نفتی دریایی (Offshore)، پس از فتح ساحل و احداث دکل، نفت استخراج‌شده توسط نفت‌کش‌ها به بنادر شما حمل و تحویل می‌شود؛ بنابراین احداث بندر و اسکورت دریایی حیاتی است. میدان‌های نفتی زمینی نیز با خط لوله مستقیماً به مخازن سوخت کشور تزریق می‌شوند.
                              </p>
                              
                              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 px-3 py-2 rounded-lg bg-black/60 border border-amber-500/30 text-xs font-mono">
                                <div class="flex items-center justify-between sm:justify-start gap-1.5 text-amber-300">
                                  <span class="text-slate-400 font-sans">موجودی سوخت:</span>
                                  <strong dir="ltr">${Math.floor(myPlayer.fuel?.() ?? 0)} / ${myPlayer.fuelCap?.() ?? 500}</strong>
                                </div>
                                <div class="flex items-center justify-between sm:justify-start gap-1.5 ${(myPlayer.fuelRate?.() ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}">
                                  <span class="text-slate-400 font-sans">تراز پمپاژ:</span>
                                  <strong dir="ltr">${(myPlayer.fuelRate?.() ?? 0) >= 0 ? "+" : ""}${myPlayer.fuelRate?.() ?? 0}/s</strong>
                                </div>
                                <div class="flex items-center justify-between sm:justify-start gap-1.5 text-cyan-300">
                                  <span class="text-slate-400 font-sans">میدان‌های تحت کنترل:</span>
                                  <strong>${getOilDeposits(this.game).filter((d) => getDepositOwner(this.game, d)?.id() === myPlayer.id()).length} حلقه</strong>
                                </div>
                              </div>

                              <!-- Action Buttons for Oil & Fuel -->
                              <div class="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                <button
                                  class="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white border border-amber-400 shadow-md cursor-pointer transition-all active:scale-98"
                                  @click=${() => this.buildNearestOilDerrick()}
                                >
                                  <span>🏗️ احداث دکل روی نزدیک‌ترین میدان خودی (۳۵K طلا)</span>
                                </button>
                                <button
                                  class="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/50 shadow-md cursor-pointer transition-all active:scale-98"
                                  @click=${() => this.purchaseFuelEmergency()}
                                >
                                  <span>🛢️ خرید ۵۰ بشکه اضطراری (۱۵K طلا)</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      `;
                    })()
                  : ""}
              </div>
            `
          : ""}
      </div>
    `;
  }
}

import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import {
  PlayerProfile,
  PlayerType,
  Relation,
  Unit,
  UnitType,
} from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { AllianceView } from "../../../core/game/GameUpdates";
import {
  getDepositOwner,
  getOilDeposits,
  OilDeposit,
} from "../../../core/game/OilSystem";
import { Controller } from "../../Controller";
import {
  ContextMenuEvent,
  MouseMoveEvent,
  TouchEvent,
} from "../../InputHandler";
import { themeProvider } from "../../theme/ThemeProvider";
import { TransformHandler } from "../../TransformHandler";
import {
  getTranslatedPlayerTeamLabel,
  renderDuration,
  renderNumber,
  renderTroops,
  translateText,
} from "../../Utils";
import { GameView, PlayerView, UnitView } from "../../view";
import {
  EMOJI_ICON_KIND,
  getFirstPlacePlayer,
  getPlayerIcons,
  IMAGE_ICON_KIND,
} from "../PlayerIcons";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import { CloseRadialMenuEvent } from "./RadialMenu";
import "./RelationSmiley";
import { SpawnBarVisibleEvent } from "./SpawnTimer";
const soldierIconAquarius = assetUrl("images/SoldierIconAquarius.svg");
const allianceIcon = assetUrl("images/AllianceIcon.svg");
const traitorIcon = assetUrl("images/TraitorIcon.svg");
const warshipIcon = assetUrl("images/BattleshipIconWhite.svg");
const cityIcon = assetUrl("images/CityIconWhite.svg");
const factoryIcon = assetUrl("images/FactoryIconWhite.svg");
const goldCoinIcon = assetUrl("images/GoldCoinIcon.svg");
const missileSiloIcon = assetUrl("images/MissileSiloIconWhite.svg");
const portIcon = assetUrl("images/PortIcon.svg");
const samLauncherIcon = assetUrl("images/SamLauncherIconWhite.svg");
const defensePostIcon = assetUrl("images/ShieldIconWhite.svg");
const soldierIcon = assetUrl("images/SoldierIcon.svg");

function euclideanDistWorld(
  coord: { x: number; y: number },
  tileRef: TileRef,
  game: GameView,
): number {
  const x = game.x(tileRef);
  const y = game.y(tileRef);
  const dx = coord.x - x;
  const dy = coord.y - y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distSortUnitWorld(coord: { x: number; y: number }, game: GameView) {
  return (a: Unit | UnitView, b: Unit | UnitView) => {
    const distA = euclideanDistWorld(coord, a.tile(), game);
    const distB = euclideanDistWorld(coord, b.tile(), game);
    return distA - distB;
  };
}

@customElement("player-info-overlay")
export class PlayerInfoOverlay extends LitElement implements Controller {
  @property({ type: Object })
  public game!: GameView;

  @property({ type: Object })
  public eventBus!: EventBus;

  @property({ type: Object })
  public transform!: TransformHandler;

  @state()
  private player: PlayerView | null = null;

  @state()
  private playerProfile: PlayerProfile | null = null;

  @state()
  private unit: UnitView | null = null;

  @state()
  private deposit: OilDeposit | null = null;

  @state()
  private _isInfoVisible: boolean = false;

  @state()
  private spawnBarVisible = false;
  @state()
  private immunityBarVisible = false;

  private _isActive = false;

  private get barOffset(): number {
    return (this.spawnBarVisible ? 7 : 0) + (this.immunityBarVisible ? 7 : 0);
  }

  private lastMouseUpdate = 0;

  init() {
    this.eventBus.on(MouseMoveEvent, (e: MouseMoveEvent) =>
      this.onMouseEvent(e),
    );
    this.eventBus.on(ContextMenuEvent, (e: ContextMenuEvent) =>
      this.maybeShow(e.x, e.y),
    );
    this.eventBus.on(TouchEvent, (e: TouchEvent) => this.maybeShow(e.x, e.y));
    this.eventBus.on(CloseRadialMenuEvent, () => this.hide());
    this.eventBus.on(SpawnBarVisibleEvent, (e) => {
      this.spawnBarVisible = e.visible;
    });
    this.eventBus.on(ImmunityBarVisibleEvent, (e) => {
      this.immunityBarVisible = e.visible;
    });
    this._isActive = true;
  }

  private onMouseEvent(event: MouseMoveEvent) {
    const now = Date.now();
    if (now - this.lastMouseUpdate < 100) {
      return;
    }
    this.lastMouseUpdate = now;
    this.maybeShow(event.x, event.y);
  }

  public hide() {
    this.setVisible(false);
    this.unit = null;
    this.player = null;
    this.deposit = null;
  }

  public maybeShow(x: number, y: number) {
    this.hide();
    const worldCoord = this.transform.screenToWorldCoordinates(x, y);
    if (!this.game.isValidCoord(worldCoord.x, worldCoord.y)) {
      return;
    }

    const tile = this.game.ref(worldCoord.x, worldCoord.y);
    if (!tile) return;

    const isOilActive =
      typeof this.game?.config?.()?.grandStrategyConfig === "function"
        ? this.game.config().grandStrategyConfig()?.oilEconomy
        : false;
    if (isOilActive) {
      const deposits = getOilDeposits(this.game);
      const nearbyDeposit = deposits.find(
        (d) => euclideanDistWorld(worldCoord, d.tile, this.game) <= 3.5,
      );
      if (nearbyDeposit) {
        this.deposit = nearbyDeposit;
        this.setVisible(true);
        return;
      }
    }

    const owner = this.game.owner(tile);

    if (owner && owner.isPlayer()) {
      this.player = owner as PlayerView;
      this.player.profile().then((p) => {
        this.playerProfile = p;
      });
      this.setVisible(true);
    } else if (!this.game.isLand(tile)) {
      const units = this.game
        .units(UnitType.Warship, UnitType.TradeShip, UnitType.TransportShip)
        .filter((u) => euclideanDistWorld(worldCoord, u.tile(), this.game) < 50)
        .sort(distSortUnitWorld(worldCoord, this.game));

      if (units.length > 0) {
        this.unit = units[0];
        this.setVisible(true);
      }
    }
  }

  tick() {
    if (this._isInfoVisible) {
      this.requestUpdate();
    }
  }

  setVisible(visible: boolean) {
    this._isInfoVisible = visible;
    this.requestUpdate();
  }

  private getPlayerNameColor(isFriendly: boolean): string {
    if (isFriendly) return "text-green-500";
    return "text-white";
  }

  private getRelationSmiley(
    player: PlayerView,
    myPlayer: PlayerView | null | undefined,
  ): TemplateResult | string {
    if (!myPlayer || myPlayer === player || player.type() !== PlayerType.Nation)
      return "";
    const relation =
      this.playerProfile?.relations[myPlayer.smallID()] ?? Relation.Neutral;
    if (relation === Relation.Neutral) return "";
    return html`<relation-smiley .relation=${relation}></relation-smiley>`;
  }

  private getRelationName(relation: Relation): string {
    switch (relation) {
      case Relation.Hostile:
        return translateText("relation.hostile");
      case Relation.Distrustful:
        return translateText("relation.distrustful");
      case Relation.Neutral:
        return translateText("relation.neutral");
      case Relation.Friendly:
        return translateText("relation.friendly");
      default:
        return translateText("relation.default");
    }
  }

  private displayUnitCount(
    player: PlayerView,
    type: UnitType,
    icon: string,
    titleText: string = "",
  ) {
    if (this.game.config().isUnitDisabled(type)) {
      return "";
    }
    const count = player.totalUnitLevels(type);
    const hasUnits = count > 0;

    return html`
      <div
        class="flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-lg border text-[11px] font-mono font-bold min-w-[32px] sm:min-w-[36px] flex-1 h-7 lg:h-7.5 shrink-0 transition-all duration-150 ${hasUnits
          ? "bg-slate-900/90 border-cyan-500/40 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.15)] hover:border-cyan-400"
          : "bg-slate-950/60 border-slate-800/80 text-slate-500"}"
        translate="no"
        title="${titleText || type}: ${count}"
      >
        <img
          src=${icon}
          class="w-3.5 h-3.5 object-contain shrink-0 ${hasUnits
            ? "drop-shadow-[0_0_4px_rgba(6,182,212,0.6)]"
            : "opacity-40 grayscale"}"
        />
        <span class="${hasUnits ? "text-cyan-300 font-bold" : "text-slate-500"}">${count}</span>
      </div>
    `;
  }

  private allianceExpirationText(alliance: AllianceView) {
    const { expiresAt } = alliance;
    const remainingTicks = expiresAt - this.game.ticks();
    let remainingSeconds = 0;
    if (remainingTicks > 0) {
      remainingSeconds = Math.max(0, Math.floor(remainingTicks / 10)); // 10 ticks per second
    }
    return renderDuration(remainingSeconds);
  }

  private renderPlayerNameIcons(icons: ReturnType<typeof getPlayerIcons>) {
    if (icons.length === 0) {
      return html``;
    }

    return html`<span class="flex items-center gap-1 shrink-0">
      ${icons.map((icon) => {
        if (icon.text === "👑") {
          return html`
            <svg
              class="w-4 h-4 inline-block shrink-0 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)] fill-current"
              viewBox="0 0 24 24"
              aria-label="Crown"
            >
              <path
                d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"
              />
            </svg>
          `;
        }
        return icon.kind === EMOJI_ICON_KIND && icon.text
          ? html`<span class="h-4 w-4 font-mono text-sm shrink-0" translate="no">${icon.text}</span>`
          : icon.kind === IMAGE_ICON_KIND && icon.src
            ? html`<img src=${icon.src} alt="" class="w-4 h-4 shrink-0 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />`
            : html``;
      })}
    </span>`;
  }

  /**
   * Returns a CSS font-size value for the player name that scales down when
   * icon pressure + name length would overflow the available row width.
   * Uses calc(var(--text-lg) * scale) so the result always respects the
   * CSS variable; min is var(--text-lg)/2, max is var(--text-lg).
   */
  private getNameFontSize(params: {
    nameLength: number;
    iconCount: number;
    hasFlag: boolean;
    hasBetrayal: boolean;
    hasAlliance: boolean;
    typeAndTeamLen: number;
  }): { fontSize: string; isAllianceWrapped: boolean } {
    const {
      nameLength,
      iconCount,
      hasFlag,
      hasBetrayal,
      hasAlliance,
      typeAndTeamLen,
    } = params;

    // Approximate char-widths each element occupies at --text-lg.
    const DESKTOP_PRESSURE = {
      perIcon: 2.0,
      icon: 0.5,
      flag: 3.5,
      betrayal: 4.2,
      alliance: 6.7,
      allianceWrapped: 3.9,
    } as const;

    const MOBILE_PRESSURE = {
      perIcon: 2.2,
      icon: 0.5,
      flag: 4.2,
      betrayal: 4.6,
      alliance: 8.6,
      allianceWrapped: 4.8,
    } as const;

    const width = window.innerWidth;
    const isDesktop = width >= 1024;

    const PRESSURE = isDesktop ? DESKTOP_PRESSURE : MOBILE_PRESSURE;

    // Convert text-xs (12px) mono chars to name font mono chars:
    // Desktop (text-lg = 18px): ratio is 12/18 = 0.666 + gap(8px/10.8px = 0.74)
    // Mobile (text-sm = 14px): ratio is 12/14 = 0.857 + gap(4px/8.4px = 0.47)
    const typeAndTeamPressure = isDesktop
      ? typeAndTeamLen * (12 / 18) + 8 / 10.8
      : typeAndTeamLen * (12 / 14) + 4 / 8.4;

    const basePressure =
      typeAndTeamPressure +
      iconCount * PRESSURE.perIcon +
      (iconCount ? PRESSURE.icon : 0) +
      (hasFlag ? PRESSURE.flag : 0) +
      (hasBetrayal ? PRESSURE.betrayal : 0);

    let capacity: number;

    if (width < 640) {
      // Below 640px, overlay 100% viewport width.
      // space grows dynamically with width
      capacity = 28.1 + (Math.max(360, width) - 360) * 0.119;
    } else if (width < 768) {
      // 640px - 767px: sm:w-[500px], troop col w-28
      // space = 376px / 8.4px = 44.8 chars.
      capacity = 44.8;
    } else if (width < 1024) {
      // 768px - 1023px: sm:w-[500px],  troop col md:w-36
      // space = 344px / 8.4px = 41.0 chars.
      capacity = 41.0;
    } else {
      // >= 1024px: sm:w-[500px], font-size text-lg (18px, 10.8px/char).
      // space = 336px / 10.8px = 31.1 chars.
      capacity = 31.1;
    }

    let isAllianceWrapped = false;
    let alliancePressure = hasAlliance ? PRESSURE.alliance : 0;
    let scale = (capacity - (basePressure + alliancePressure)) / nameLength;

    // If alliance active and font scale < 0.85
    // word-wrap alliance (icon & duration) to reduce width.
    if (hasAlliance && scale < 0.85) {
      isAllianceWrapped = true;
      alliancePressure = PRESSURE.allianceWrapped;
      scale = (capacity - (basePressure + alliancePressure)) / nameLength;
    }

    const textSize = isDesktop ? "lg" : "sm";
    const fontSize = `clamp(var(--text-${textSize}) * .65, var(--text-${textSize}) * ${scale.toFixed(3)}, var(--text-${textSize}))`;

    return { fontSize, isAllianceWrapped };
  }

  private renderPlayerInfo(player: PlayerView) {
    const myPlayer = this.game.myPlayer();
    const isFriendly = myPlayer?.isFriendly(player);
    const isAllied = myPlayer?.isAlliedWith(player);
    const traitorTicks = player.getTraitorRemainingTicks();
    let allianceHtml: TemplateResult | null = null;
    let betrayalHtml: TemplateResult | null = null;
    const firstPlace = getFirstPlacePlayer(this.game);
    const playerIcons = getPlayerIcons({ game: this.game, player, firstPlace });
    const maxTroops = this.game.config().maxTroops(player);
    const attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);
    const totalTroops = player.troops();

    let typeBadge: TemplateResult | null = null;
    switch (player.type()) {
      case PlayerType.Bot:
        typeBadge = html`<span
          class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800/90 border border-slate-600/50 text-slate-300 shadow-xs shrink-0"
          >🤖 بات</span
        >`;
        break;
      case PlayerType.Nation:
        typeBadge = html`<span
          class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-xs shrink-0"
          >🏛️ کشور</span
        >`;
        break;
      case PlayerType.Human:
        typeBadge = html`<span
          class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 shadow-xs shrink-0"
          >👤 بازیکن</span
        >`;
        break;
    }
    const clanTag = this.game.teamClanTag(player.team());
    const playerTeam = getTranslatedPlayerTeamLabel(player.team(), clanTag);
    const clanBadge =
      clanTag || (playerTeam !== "" && player.type() !== PlayerType.Bot)
        ? html`<span
            class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/[0.07] border border-cyan-400/30 text-cyan-300 shadow-xs shrink-0"
            style="color: ${themeProvider
              .current()
              .teamColor(player.team()!)
              .toHex()}"
            >[${clanTag ?? playerTeam}]</span
          >`
        : null;

    if (isAllied) {
      const alliance = myPlayer
        ?.alliances()
        .find((alliance) => alliance.other === player.id());
      if (alliance !== undefined) {
        allianceHtml = html`<div
          class="flex items-center gap-1 text-[11px] font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-400/30 px-1.5 py-0.5 rounded-md shrink-0 shadow-xs"
        >
          <img src=${allianceIcon} width="14" height="14" class="shrink-0" />
          <span>${this.allianceExpirationText(alliance)}</span>
        </div>`;
      }
    }

    if (traitorTicks > 0) {
      betrayalHtml = html`<div
        class="flex items-center gap-1 text-[11px] font-bold text-rose-300 bg-rose-950/60 border border-rose-400/30 px-1.5 py-0.5 rounded-md shrink-0 shadow-xs"
      >
        <img src=${traitorIcon} alt="" class="w-3.5 h-3.5 shrink-0" />
        <span>${renderDuration(Math.floor(traitorTicks / 10))}</span>
      </div>`;
    }

    const flagHtml = player.cosmetics?.flag
      ? html`<img
          class="h-5 w-7 object-cover rounded shadow-xs border border-white/20 shrink-0"
          src=${assetUrl(player.cosmetics.flag!)}
        />`
      : html``;

    return html`
      <div class="p-2 sm:p-2.5 flex flex-col gap-2 select-none" dir="ltr">
        <!-- Tier 1: Identity & Resources Header -->
        <div
          class="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-1.5"
        >
          <!-- Left: Flag, Crown, Name, Badges -->
          <div class="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            ${flagHtml}
            ${this.renderPlayerNameIcons(playerIcons)}
            <span
              class="font-bold text-sm sm:text-base tracking-wide truncate ${this.getPlayerNameColor(
                isFriendly ?? false,
              )}"
              title=${player.displayName()}
            >
              ${player.displayName()}
            </span>
            ${typeBadge}
            ${clanBadge}
            ${this.getRelationSmiley(player, myPlayer)}
            ${allianceHtml ?? ""}
            ${betrayalHtml ?? ""}
          </div>

          <!-- Right: Gold Pill & Attacking Troops Pill -->
          <div class="flex items-center gap-1.5 shrink-0">
            <!-- Gold Badge -->
            <div
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.2)] font-mono font-bold text-xs text-amber-300"
              title="خزانه طلا"
              translate="no"
            >
              <img
                src=${goldCoinIcon}
                width="13"
                height="13"
                class="drop-shadow-[0_0_4px_rgba(245,158,11,0.6)]"
              />
              <span>${renderNumber(player.gold())}</span>
            </div>

            <!-- Oil / Fuel Badge (if Grand Strategy Oil Economy is enabled) -->
            ${(typeof this.game?.config?.()?.grandStrategyConfig === "function" &&
            this.game.config().grandStrategyConfig()?.oilEconomy)
              ? html`
                  <div
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-950/50 via-yellow-950/20 to-transparent border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.2)] font-mono font-bold text-xs text-amber-300"
                    title="ذخایر سوخت استراتژیک (HOI4)"
                    translate="no"
                  >
                    <span>🛢️</span>
                    <span dir="ltr">${Math.floor(player.fuel?.() ?? 0)}</span>
                  </div>
                `
              : null}

            <!-- Attacking Troops Badge -->
            <div
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-transparent border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.2)] font-mono font-bold text-xs text-cyan-300"
              title="نیروهای در حال حمله"
              translate="no"
            >
              <span class="flex items-center gap-0.5 leading-none">
                <img
                  class="w-3 h-3 ${attackingTroops > 0
                    ? ""
                    : "brightness-0 invert opacity-40"}"
                  src=${attackingTroops > 0 ? soldierIconAquarius : soldierIcon}
                  alt=""
                />
                <span class="text-[10px]">↑</span>
              </span>
              <span>${renderTroops(attackingTroops)}</span>
            </div>
          </div>
        </div>

        <!-- Tier 2: Troop Health Bar & Military Infrastructure Badges -->
        <div class="flex flex-col sm:flex-row items-center gap-2">
          <!-- Troop Health Bar -->
          <div class="w-full sm:w-44 shrink-0" translate="no">
            ${this.renderTroopBar(totalTroops, attackingTroops, maxTroops)}
          </div>

          <!-- 7 Structure Badges -->
          <div
            class="flex items-center gap-1 w-full min-w-0 justify-between flex-1"
          >
            ${this.displayUnitCount(player, UnitType.City, cityIcon, "شهرها")}
            ${this.displayUnitCount(
              player,
              UnitType.Factory,
              factoryIcon,
              "کارخانه‌ها",
            )}
            ${this.displayUnitCount(player, UnitType.Port, portIcon, "بنادر")}
            ${this.displayUnitCount(
              player,
              UnitType.MissileSilo,
              missileSiloIcon,
              "سیلوهای موشک",
            )}
            ${this.displayUnitCount(
              player,
              UnitType.DefensePost,
              defensePostIcon,
              "سنگرهای بتنی",
            )}
            ${this.displayUnitCount(
              player,
              UnitType.SAMLauncher,
              samLauncherIcon,
              "پدافندهای هوایی",
            )}
            ${this.displayUnitCount(
              player,
              UnitType.Warship,
              warshipIcon,
              "ناوگان جنگی",
            )}
            ${this.renderDerrickCount(player)}
          </div>
        </div>

        <!-- Tier 3: Tactical Attack Forecast -->
        ${this.renderTacticalForecast(player, myPlayer)}
      </div>
    `;
  }

  private renderTacticalForecast(
    player: PlayerView,
    myPlayer: PlayerView | null,
  ) {
    if (
      !myPlayer ||
      player === myPlayer ||
      (typeof player.isOnSameTeam === "function" &&
        player.isOnSameTeam(myPlayer)) ||
      (typeof player.isAlliedWith === "function" &&
        player.isAlliedWith(myPlayer))
    ) {
      return html``;
    }

    const myTroops =
      (typeof myPlayer.troops === "function" ? myPlayer.troops() : 0) || 1;
    const enemyTroops =
      (typeof player.troops === "function" ? player.troops() : 0) || 1;
    const defPosts =
      typeof player.units === "function"
        ? player.units(UnitType.DefensePost)
        : [];
    const hasDefensePost = defPosts.length > 0;

    // Defense post provides 5x defense bonus
    const effectiveEnemyTroops = hasDefensePost
      ? enemyTroops * 2.5
      : enemyTroops;
    const ratio = myTroops / effectiveEnemyTroops;

    let badgeClass = "";
    let icon = "";
    let label = "";

    if (ratio >= 1.6) {
      badgeClass =
        "bg-gradient-to-r from-emerald-950/90 via-emerald-900/60 to-slate-950/90 text-emerald-200 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]";
      icon = "🟢";
      label = "پیروزی قطعی و سریع";
    } else if (ratio >= 0.8) {
      badgeClass =
        "bg-gradient-to-r from-amber-950/90 via-amber-900/60 to-slate-950/90 text-amber-200 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]";
      icon = "🟡";
      label = "نبرد فرسایشی و نزدیک";
    } else {
      badgeClass =
        "bg-gradient-to-r from-rose-950/90 via-rose-900/60 to-slate-950/90 text-rose-200 border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.25)]";
      icon = "🔴";
      label = "خطر تلفات سنگین";
    }

    return html`
      <div
        class="flex items-center justify-between gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border backdrop-blur-md box-border w-full min-w-0 overflow-hidden ${badgeClass}"
        style="direction: rtl;"
      >
        <span class="flex items-center gap-2 min-w-0 truncate">
          <span class="text-sm shrink-0 leading-none">${icon}</span>
          <span class="truncate font-semibold tracking-wide"
            >شانس حمله: ${label}</span
          >
        </span>
        ${hasDefensePost
          ? html`
              <span
                class="text-[10px] text-amber-200 bg-amber-950/90 px-2 py-0.5 rounded-md border border-amber-400/60 font-black shrink-0 whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse"
                title="دشمن در این قلمرو سنگر بتنی دارد: تلفات شما ۵ برابر و سرعت تصرف ۳ برابر کندتر است!"
              >
                🛡️ سنگر بتنی (+۵۰۰٪ دفاع)
              </span>
            `
          : html``}
      </div>
    `;
  }

  private renderTroopBar(
    totalTroops: number,
    attackingTroops: number,
    maxTroops: number,
  ) {
    const base = Math.max(maxTroops, 1);
    const greenPercentRaw = (totalTroops / base) * 100;
    const orangePercentRaw = (attackingTroops / base) * 100;

    const greenPercent = Math.max(0, Math.min(100, greenPercentRaw));
    const orangePercent = Math.max(
      0,
      Math.min(100 - greenPercent, orangePercentRaw),
    );

    return html`
      <div
        class="w-full h-7 lg:h-7.5 rounded-lg bg-slate-950/80 border border-slate-700/70 p-0.5 relative overflow-hidden shadow-inner"
        title="سربازان: ${renderTroops(totalTroops)} / ظرفیت: ${renderTroops(
          maxTroops,
        )}"
      >
        <div
          class="relative h-full w-full rounded-md overflow-hidden bg-slate-900/50"
        >
          <div
            class="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-600 via-cyan-500 to-teal-400 transition-all duration-200"
            style="width: ${greenPercent}%;"
          ></div>
          <div
            class="absolute inset-y-0 bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-200 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
            style="left: ${greenPercent}%; width: ${orangePercent}%;"
          ></div>
        </div>
        <div
          class="absolute inset-0 flex items-center justify-between px-2 text-xs font-mono font-bold leading-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
          translate="no"
        >
          <span class="text-white flex items-center gap-1 font-bold">
            <img
              src=${soldierIcon}
              alt=""
              class="w-3.5 h-3.5 inline brightness-0 invert drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
            />
            ${renderTroops(totalTroops)}
          </span>
          <span class="text-slate-300 font-semibold">
            ${renderTroops(maxTroops)}
          </span>
        </div>
      </div>
    `;
  }

  private renderUnitInfo(unit: UnitView) {
    const isAlly =
      (unit.owner() === this.game.myPlayer() ||
        this.game.myPlayer()?.isFriendly(unit.owner())) ??
      false;
    const isOilActive =
      typeof this.game?.config?.()?.grandStrategyConfig === "function"
        ? this.game.config().grandStrategyConfig()?.oilEconomy
        : false;

    let unitTypeLabel = unit.type() as string;
    if (unit.type() === UnitType.TradeShip) {
      unitTypeLabel = isOilActive ? "نفت‌کش استراتژیک ⚓" : "کشتی تجاری ⛵";
    } else if (unit.type() === UnitType.Warship) {
      unitTypeLabel = "ناو جنگی ⚔️";
    } else if (unit.type() === UnitType.TransportShip) {
      unitTypeLabel = "کشتی ترابری نیرو 🚢";
    }

    return html`
      <div class="p-2.5 flex flex-col gap-1.5 select-none" dir="rtl" style="font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;">
        <div
          class="flex items-center justify-between border-b border-white/[0.08] pb-1.5"
        >
          <div
            class="font-bold text-sm flex items-center gap-1.5 ${isAlly
              ? "text-cyan-300"
              : "text-white"}"
          >
            <span>🛡️</span>
            <span>${unit.owner().displayName()}</span>
          </div>
          <span
            class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40"
          >
            ${unitTypeLabel}
          </span>
        </div>
        <div
          class="flex items-center gap-3 text-xs font-semibold text-slate-300"
        >
          ${unit.hasHealth()
            ? html`<div class="flex items-center gap-1 font-mono">
                <span class="text-rose-400 font-sans">❤️ سلامت:</span> ${unit.health()}
              </div>`
            : ""}
          ${unit.type() === UnitType.TransportShip
            ? html`<div class="flex items-center gap-1 font-mono">
                <span class="text-sky-400 font-sans">🪖 سربازان:</span>
                ${renderTroops(unit.troops())}
              </div>`
            : ""}
          ${unit.type() === UnitType.TradeShip
            ? html`<div class="flex items-center gap-1">
                <span class="text-amber-400 font-sans">🛢️ محموله:</span>
                <span class="text-amber-200 text-[11px] font-sans">
                  ${isOilActive
                    ? "۵۰ بشکه نفت خام (انتقال به بندر)"
                    : "محموله بازرگانی و طلا"}
                </span>
              </div>`
            : ""}
        </div>
      </div>
    `;
  }

  private renderDerrickCount(player: PlayerView) {
    const isOilActive =
      typeof this.game?.config?.()?.grandStrategyConfig === "function"
        ? this.game.config().grandStrategyConfig()?.oilEconomy
        : false;
    if (!isOilActive) return html``;
    const deposits = getOilDeposits(this.game);
    const count = deposits.filter(
      (d) => d.hasDerrick && d.ownerId === player.id(),
    ).length;
    return html`
      <div
        class="flex flex-col items-center justify-center p-1 rounded-md bg-white/[0.04] border border-white/[0.08] min-w-[28px] shrink-0"
        title="دکل‌های نفتی فعال: ${count}"
      >
        <span class="text-xs leading-none">🏗️</span>
        <span class="text-[10px] font-mono font-bold text-amber-300 mt-0.5"
          >${count}</span
        >
      </div>
    `;
  }

  private renderOilDepositInfo(deposit: OilDeposit) {
    const owner = getDepositOwner(this.game, deposit);
    const myPlayer = this.game.myPlayer();
    const isMine = owner && myPlayer && owner.id() === myPlayer.id();
    const hasActivePort = myPlayer
      ? myPlayer
          .units(UnitType.Port)
          .some((p) => p.isActive() && !p.markedForDeletion())
      : false;

    let ownerStatus = "فتح نشده / بی‌طرف ⚪";
    let ownerClass = "text-slate-300";
    if (isMine) {
      ownerStatus = "تحت کنترل شما 🟢";
      ownerClass = "text-emerald-400";
    } else if (owner && owner.isPlayer()) {
      ownerStatus = `تحت تسلط ${owner.displayName()} 🔴`;
      ownerClass = "text-rose-400";
    }

    return html`
      <div
        class="p-2.5 flex flex-col gap-1.5 select-none"
        dir="rtl"
        style="font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;"
      >
        <div
          class="flex items-center justify-between border-b border-white/[0.08] pb-1.5"
        >
          <div
            class="font-bold text-sm flex items-center gap-1.5 ${isMine
              ? "text-cyan-300"
              : "text-amber-300"}"
          >
            <span
              >${deposit.hasDerrick
                ? "🏗️"
                : deposit.isOffshore
                  ? "⚓"
                  : "🛢️"}</span
            >
            <span
              >${deposit.isOffshore
                ? "فلات قاره نفتی (میدان دریایی)"
                : "میدان نفتی استراتژیک (خشکی)"}</span
            >
          </div>
          <span
            class="px-2 py-0.5 rounded text-[10px] font-bold ${ownerClass} bg-slate-900 border border-white/10"
          >
            ${ownerStatus}
          </span>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-300">
          <div class="flex items-center gap-1.5">
            <span class="text-amber-400 font-bold">وضعیت دکل:</span>
            <span
              class="${deposit.hasDerrick
                ? "text-emerald-300"
                : "text-amber-200"} font-semibold"
            >
              ${deposit.hasDerrick
                ? "احداث شده ✅ (تولید ۱۲ بشکه/ثانیه + ۲۵۰ مخزن)"
                : "بدون دکل ❌ (استخراج اولیه ۳ بشکه/ثانیه)"}
            </span>
          </div>
          <div class="flex items-center gap-1 text-[11px] text-cyan-300">
            <span>انتقال:</span>
            <span
              >${deposit.isOffshore
                ? "نفت‌کش دریایی 🚢"
                : "خط لوله زمینی 🛢️"}</span
            >
          </div>
        </div>

        ${deposit.isOffshore && !hasActivePort && isMine
          ? html`
              <div
                class="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/40 rounded px-2 py-1 mt-0.5 flex items-center gap-1"
              >
                <span>⚠️</span>
                <span
                  >هشدار لجستیک: برای انتقال نفت با نفت‌کش، باید حداقل یک بندر
                  فعال (Port ⚓) احداث کنید.</span
                >
              </div>
            `
          : html``}
        ${isMine && !deposit.hasDerrick
          ? html`
              <div
                class="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/40 rounded px-2 py-1 mt-0.5 flex items-center justify-between"
              >
                <span
                  >💡 می‌توانید با کلیک روی میدان یا نوار پایین دکل احداث کنید
                  (هزینه: ۱,۵۰۰ طلا).</span
                >
              </div>
            `
          : !isMine
            ? html`
                <div
                  class="text-[11px] text-slate-300 bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1 mt-0.5"
                >
                  ${deposit.isOffshore
                    ? "برای فتح این فلات نفتی، خط ساحلی مجاور آن را با پیشروی نیرو تصرف کنید."
                    : "برای بهره‌برداری از این چاه نفت، قلمرو آن را فتح کنید."}
                </div>
              `
            : html``}
      </div>
    `;
  }

  render() {
    if (!this._isActive) {
      return html``;
    }

    const containerClasses = this._isInfoVisible
      ? "opacity-100 visible translate-y-0"
      : "opacity-0 invisible pointer-events-none -translate-y-2";

    return html`
      <div
        class="fixed top-0 left-0 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[1001]"
        style="margin-top: ${this.barOffset}px;"
        @click=${() => this.hide()}
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div
          class="bg-slate-950/90 backdrop-blur-xl border border-slate-700/60 border-t-2 border-t-cyan-400 shadow-[0_12px_36px_rgba(0,0,0,0.7),0_0_24px_rgba(6,182,212,0.15)] rounded-b-xl sm:rounded-2xl text-white text-sm w-full sm:w-[540px] overflow-hidden transition-all duration-200 select-none ${containerClasses}"
        >
          ${this.deposit ? this.renderOilDepositInfo(this.deposit) : ""}
          ${this.player ? this.renderPlayerInfo(this.player) : ""}
          ${this.unit ? this.renderUnitInfo(this.unit) : ""}
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}

import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import { GameType, UnitType } from "../../../core/game/Game";
import { createNextLobby } from "../../Api";
import { ClientEnv } from "../../ClientEnv";
import "../../components/DoomsdayClockPanel";
import "../../components/OvertimePanel";
import { Controller } from "../../Controller";
import { crazyGamesSDK } from "../../CrazyGamesSDK";
import { isDesktopShell } from "../../DesktopShell";
import { showInGameAlert, showInGameConfirm } from "../../InGameModal";
import { TogglePauseIntentEvent } from "../../InputHandler";
import { PauseGameIntentEvent, SendWinnerEvent } from "../../Transport";
import { homeHref, showToast, translateText } from "../../Utils";
import { GameView } from "../../view";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import { ShowReplayPanelEvent } from "./ReplayPanel";
import { ShowSettingsModalEvent } from "./SettingsModal";
import { SpawnBarVisibleEvent } from "./SpawnTimer";
const exitIcon = assetUrl("images/ExitIconWhite.svg");
const FastForwardIconSolid = assetUrl("images/FastForwardIconSolidWhite.svg");
const pauseIcon = assetUrl("images/PauseIconWhite.svg");
const playIcon = assetUrl("images/PlayIconWhite.svg");
const newLobbyIcon = assetUrl("images/ReplayRegularIconWhite.svg");
const settingsIcon = assetUrl("images/SettingIconWhite.svg");
const fullscreenIcon = assetUrl("images/FullscreenIconWhite.svg");
const exitFullscreenIcon = assetUrl("images/ExitFullscreenIconWhite.svg");

const LAST_MINUTE_SECONDS = 60;
const FLASH_TIMER_SECONDS = 30;
const FLASH_SIDEBAR_SECONDS = 10;
const ONE_MINUTE_WARNING_DURATION_MS = 4_000;

@customElement("game-right-sidebar")
export class GameRightSidebar extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @state()
  private _isSinglePlayer: boolean = false;

  @state()
  private _isReplayVisible: boolean = false;

  @state()
  private _isVisible: boolean = true;

  @state()
  private isPaused: boolean = false;

  @state()
  private isFullscreen: boolean = false;

  @state()
  private timer: number = 0;

  // CrazyGames provides its own fullscreen control in the game frame, and the
  // desktop shell owns its window mode from the settings Display tab, so hide
  // ours on both.
  private readonly hideFullscreenButton =
    crazyGamesSDK.isOnCrazyGames() || isDesktopShell();
  private hasWinner = false;
  private isLobbyCreator = false;
  private isPrivateLobby = false;
  private hasShownOneMinuteWarning = false;
  // Guards the in-game "New lobby" button so a double click doesn't fire twice
  // before we navigate to the successor lobby.
  private newLobbyRequested = false;
  private spawnBarVisible = false;
  private immunityBarVisible = false;

  createRenderRoot() {
    // Stack the timer bar + doomsday-clock readout, centers aligned (the narrower
    // one sits centered under the wider one).
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.alignItems = "center";
    this.style.gap = "6px";
    return this;
  }

  init() {
    this._isSinglePlayer =
      this.game?.config()?.gameConfig()?.gameType === GameType.Singleplayer ||
      this.game.config().isReplay();
    this.isPrivateLobby =
      this.game?.config()?.gameConfig()?.gameType === GameType.Private;
    this._isVisible = true;
    this.hasShownOneMinuteWarning = false;

    this.eventBus.on(SpawnBarVisibleEvent, (e) => {
      this.spawnBarVisible = e.visible;
      this.updateParentOffset();
    });
    this.eventBus.on(ImmunityBarVisibleEvent, (e) => {
      this.immunityBarVisible = e.visible;
      this.updateParentOffset();
    });

    this.eventBus.on(SendWinnerEvent, () => {
      this.hasWinner = true;
      this.requestUpdate();
    });

    this.eventBus.on(TogglePauseIntentEvent, () => {
      const isReplayOrSingleplayer =
        this._isSinglePlayer || this.game?.config()?.isReplay();
      if (
        isReplayOrSingleplayer ||
        (this.isLobbyCreator && !this.game.config().listed)
      ) {
        this.onPauseButtonClick();
      }
    });

    this.requestUpdate();
  }

  private onFullscreenChange = () => {
    this.isFullscreen = !!document.fullscreenElement;
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    this.onFullscreenChange();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
  }

  getTickIntervalMs() {
    return 250;
  }

  tick() {
    // Timer logic
    // Check if the player is the lobby creator
    if (!this.isLobbyCreator && this.game.myPlayer()?.isLobbyCreator()) {
      this.isLobbyCreator = true;
      this.requestUpdate();
    }

    if (this.game.inSpawnPhase()) {
      // Singleplayer has no spawn timer (SpawnTimerExecution isn't added), so
      // the spawn phase doesn't count down — keep the old static display.
      if (this.game.config().gameConfig().gameType === GameType.Singleplayer) {
        const maxTimerValue = this.game.config().gameConfig().maxTimerValue;
        this.timer =
          maxTimerValue !== null && maxTimerValue !== undefined
            ? maxTimerValue * 60
            : 0;
        return;
      }
      const spawnPhaseDurationTicks = this.game.config().numSpawnPhaseTurns();
      const currentTicks = this.game.ticks();
      const remainingTicks = spawnPhaseDurationTicks - currentTicks;
      const remainingSeconds = Math.ceil(remainingTicks / 10);
      this.timer = Math.max(0, remainingSeconds);
      return;
    }

    const elapsedSeconds = Math.floor(this.game.elapsedGameSeconds());

    if (this.hasWinner) {
      return;
    }

    const maxTimerValue = this.game.config().gameConfig().maxTimerValue;
    if (maxTimerValue !== null && maxTimerValue !== undefined) {
      this.timer = Math.max(0, maxTimerValue * 60 - elapsedSeconds);
      this.maybeShowOneMinuteWarning();
    } else {
      this.timer = elapsedSeconds;
    }
  }

  // Handing the notice to the heads-up toast layer means that layer owns the
  // dismissal timer, so there's nothing for us to tear down on disconnect or
  // when the game ends.
  private maybeShowOneMinuteWarning(): void {
    if (
      !this.hasWinner &&
      !this.game.inSpawnPhase() &&
      this.timer > 0 &&
      this.timer <= LAST_MINUTE_SECONDS &&
      !this.hasShownOneMinuteWarning
    ) {
      this.hasShownOneMinuteWarning = true;
      showToast(
        translateText("game_timer.one_minute_remaining"),
        "red",
        ONE_MINUTE_WARNING_DURATION_MS,
      );
    }
  }

  private updateParentOffset(): void {
    const offset =
      (this.spawnBarVisible ? 7 : 0) + (this.immunityBarVisible ? 7 : 0);
    const parent = this.parentElement as HTMLElement;
    if (parent) {
      parent.style.marginTop = `${offset}px`;
    }
  }

  private secondsToHms = (d: number): string => {
    const pad = (n: number) => (n < 10 ? `0${n}` : n);

    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = Math.floor((d % 3600) % 60);

    if (h !== 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    } else {
      return `${pad(m)}:${pad(s)}`;
    }
  };

  private toggleReplayPanel(): void {
    this._isReplayVisible = !this._isReplayVisible;
    this.eventBus.emit(
      new ShowReplayPanelEvent(this._isReplayVisible, this._isSinglePlayer),
    );
  }

  private onPauseButtonClick() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      crazyGamesSDK.gameplayStop();
    } else {
      crazyGamesSDK.gameplayStart();
    }
    this.eventBus.emit(new PauseGameIntentEvent(this.isPaused));
  }

  private async onNewLobbyButtonClick() {
    if (this.newLobbyRequested) return;
    // Confirm so a stray click next to pause/exit doesn't yank everyone into a
    // new lobby mid-game.
    const isConfirmed = await showInGameConfirm(
      translateText("new_lobby_prompt.confirm"),
      { variant: "warning" },
    );
    if (!isConfirmed) return;
    if (this.newLobbyRequested) return; // clicked again while confirming
    this.newLobbyRequested = true;
    this.requestUpdate();
    try {
      // The worker mints the successor lobby and has the current game
      // broadcast its id, so everyone else gets the NewLobbyPrompt. We (the
      // host) navigate straight to the new host view from the response.
      const lobby = await createNextLobby(this.game.gameID());
      const id = lobby.gameID;
      // ?host routes the creator back into the host view on load.
      window.location.href = `${window.location.origin}${ClientEnv.gamePath(id)}?host`;
    } catch (error) {
      console.error("Failed to create successor lobby", error);
      this.newLobbyRequested = false;
      this.requestUpdate();
      void showInGameAlert(translateText("new_lobby_prompt.failed"));
    }
  }

  private async onExitButtonClick() {
    const isAlive = this.game.myPlayer()?.isAlive();
    if (isAlive) {
      const isConfirmed = await showInGameConfirm(
        translateText("help_modal.exit_confirmation"),
      );
      if (!isConfirmed) return;
    }
    await crazyGamesSDK.requestMidgameAd();
    await crazyGamesSDK.gameplayStop();
    // redirect to the home page
    window.location.href = homeHref();
  }

  private onSettingsButtonClick() {
    this.eventBus.emit(
      new ShowSettingsModalEvent(true, this._isSinglePlayer, this.isPaused),
    );
  }

  private onFullscreenButtonClick() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Failed to enter fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn("Failed to exit fullscreen:", err);
      });
    }
  }

  render() {
    if (this.game === undefined) return html``;

    const maxTimerValue = this.game.config().gameConfig().maxTimerValue;
    const isEndTimerActive =
      maxTimerValue !== undefined &&
      maxTimerValue !== null &&
      !this.game.inSpawnPhase() &&
      !this.hasWinner &&
      this.timer > 0;
    const isLastMinute = isEndTimerActive && this.timer <= LAST_MINUTE_SECONDS;
    const shouldFlashTimer =
      isEndTimerActive && this.timer <= FLASH_TIMER_SECONDS;
    const shouldFlashSidebar =
      isEndTimerActive && this.timer <= FLASH_SIDEBAR_SECONDS;

    const timerClass = shouldFlashTimer
      ? "game-end-timer-flash bg-rose-950/80 border border-rose-500/80 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.4)]"
      : isLastMinute
        ? "game-end-timer-last-minute bg-rose-950/60 border border-rose-500/50 text-rose-300"
        : "bg-slate-900/80 border border-slate-700/60 text-slate-200 shadow-xs";

    return html`
      <style>
        @keyframes game-end-timer-text-flash {
          0%,
          100% {
            color: rgb(248 113 113);
          }
          50% {
            color: white;
          }
        }
        @keyframes game-end-timer-sidebar-flash {
          0%,
          100% {
            background-color: rgb(2 6 23 / 0.95);
          }
          50% {
            background-color: rgb(185 28 28 / 0.96);
          }
        }
        .game-end-timer-last-minute {
          color: rgb(248 113 113);
        }
        .game-end-timer-flash {
          animation: game-end-timer-text-flash 1s ease-in-out infinite;
        }
        .game-end-timer-sidebar-flash {
          animation: game-end-timer-sidebar-flash 1s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .game-end-timer-flash {
            animation: none;
            color: white;
          }
          .game-end-timer-sidebar-flash {
            animation: none;
            background-color: rgb(185 28 28 / 0.96);
          }
        }
      </style>
      <div
        class="flex flex-col items-end transition-transform duration-300 ease-out transform ${
          this._isVisible ? "translate-x-0" : "translate-x-full"
        } ${shouldFlashSidebar ? "game-end-timer-sidebar-flash" : ""}"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <aside
          class="flex flex-row items-center gap-1.5 py-1.5 px-2 bg-slate-950/90 backdrop-blur-xl border-l border-b border-cyan-500/30 rounded-bl-xl shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_16px_rgba(6,182,212,0.1)] text-white"
        >
          <!-- In-game time -->
          <div
            data-game-timer
            class="px-2.5 py-1 rounded-lg font-mono text-xs font-extrabold tabular-nums tracking-wide ${timerClass}"
          >
            ${this.secondsToHms(this.timer)}
          </div>

          <!-- Buttons -->
          ${this.maybeRenderReplayButtons()}

          <button
            class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-cyan-500/20 border border-slate-700/60 hover:border-cyan-400/60 text-slate-200 cursor-pointer transition-all duration-150 shadow-xs active:scale-95"
            @click=${this.onSettingsButtonClick}
            title=${translateText("settings.title")}
          >
            <img src=${settingsIcon} alt="settings" width="16" height="16" class="opacity-90" />
          </button>

          ${document.fullscreenEnabled && !this.hideFullscreenButton
            ? html`<button
                class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-cyan-500/20 border border-slate-700/60 hover:border-cyan-400/60 text-slate-200 cursor-pointer transition-all duration-150 shadow-xs active:scale-95"
                @click=${this.onFullscreenButtonClick}
                title=${this.isFullscreen
                  ? translateText("fullscreen.exit")
                  : translateText("fullscreen.enter")}
              >
                <img
                  src=${this.isFullscreen ? exitFullscreenIcon : fullscreenIcon}
                  alt="fullscreen"
                  width="16"
                  height="16"
                  class="opacity-90"
                />
              </button>`
            : ""}

          <button
            class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-rose-500/20 border border-slate-700/60 hover:border-rose-400/60 text-rose-300 cursor-pointer transition-all duration-150 shadow-xs active:scale-95"
            @click=${this.onExitButtonClick}
            title=${translateText("exit")}
          >
            <img src=${exitIcon} alt="exit" width="16" height="16" class="opacity-90" />
          </button>
        </aside>

        ${this.renderTacticalIntelBar()}
      </div>

      <doomsday-clock-panel
        .game=${this.game}
        .hasWinner=${this.hasWinner}
        .refreshKey=${this.timer}
      ></doomsday-clock-panel>
      <overtime-panel
        .game=${this.game}
        .hasWinner=${this.hasWinner}
        .refreshKey=${this.timer}
      ></overtime-panel>
    `;
  }

  private renderTacticalIntelBar() {
    if (
      !this.game ||
      typeof this.game.playerViews !== "function" ||
      (typeof this.game.inSpawnPhase === "function" && this.game.inSpawnPhase()) ||
      this.hasWinner
    ) {
      return html``;
    }

    const alivePlayers = this.game
      .playerViews()
      .filter((p) => p && typeof p.isAlive === "function" && p.isAlive());
    if (alivePlayers.length === 0) return html``;

    let topPlayer = alivePlayers[0];
    let totalOwnedTiles = 0;
    for (const p of alivePlayers) {
      const tiles = p.numTilesOwned() || 0;
      totalOwnedTiles += tiles;
      if (tiles > (topPlayer.numTilesOwned() || 0)) {
        topPlayer = p;
      }
    }

    let activeNukes = 0;
    try {
      const allUnits = this.game.units?.() ?? [];
      for (const u of allUnits) {
        const ut = u.type();
        if (
          ut === UnitType.MissileSilo ||
          ut === UnitType.AtomBomb ||
          ut === UnitType.HydrogenBomb ||
          ut === UnitType.MIRV
        ) {
          activeNukes++;
        }
      }
    } catch {
      // fallback
    }

    const dominancePercent =
      totalOwnedTiles > 0
        ? Math.round(
            ((topPlayer.numTilesOwned() || 0) / totalOwnedTiles) * 100,
          )
        : 0;

    return html`
      <div
        class="flex items-center justify-between gap-3 px-3 py-1 bg-slate-950/90 border-l border-b border-cyan-500/20 rounded-bl-xl text-xs font-medium backdrop-blur-xl shadow-lg pointer-events-none select-none mt-1"
        style="direction: rtl;"
      >
        <div class="flex items-center gap-1.5 min-w-0">
          <svg
            class="w-3.5 h-3.5 inline-block shrink-0 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)] fill-current"
            viewBox="0 0 24 24"
            aria-label="Crown"
          >
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
          </svg>
          <span
            class="font-bold text-amber-300 truncate max-w-[95px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            title=${topPlayer.displayName()}
          >
            ${topPlayer.displayName()}
          </span>
          <span class="font-mono text-[10.5px] font-bold text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 px-1.5 py-0.2 rounded-md shadow-xs">
            ${dominancePercent}٪
          </span>
        </div>
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-950/70 border border-rose-500/40 text-rose-300 font-mono font-bold text-xs shadow-xs shrink-0">
          <span class="text-xs drop-shadow-[0_0_3px_rgba(244,63,94,0.6)]">☢️</span>
          <span class="tabular-nums text-rose-200 font-bold">${activeNukes}</span>
          <span class="text-[10px] text-rose-300/80 font-normal">کلاهک</span>
        </div>
      </div>
    `;
  }

  maybeRenderReplayButtons() {
    const isReplayOrSingleplayer =
      this._isSinglePlayer || this.game?.config()?.isReplay();
    const showPauseButton =
      isReplayOrSingleplayer ||
      (this.isLobbyCreator && !this.game.config().listed);
    // The host of a private lobby can start a fresh lobby at any time, without
    // waiting to die or for the game to end.
    const showNewLobbyButton = this.isLobbyCreator && this.isPrivateLobby;

    return html`
      ${isReplayOrSingleplayer
        ? html`
            <button
              class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-cyan-500/20 border border-slate-700/60 hover:border-cyan-400/60 text-slate-200 cursor-pointer transition-all duration-150 shadow-xs active:scale-95"
              @click=${this.toggleReplayPanel}
              title="Replay"
            >
              <img
                src=${FastForwardIconSolid}
                alt="replay"
                width="16"
                height="16"
                class="opacity-90"
              />
            </button>
          `
        : ""}
      ${showPauseButton
        ? html`
            <button
              class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-cyan-500/20 border border-slate-700/60 hover:border-cyan-400/60 text-slate-200 cursor-pointer transition-all duration-150 shadow-xs active:scale-95"
              @click=${this.onPauseButtonClick}
              title="Pause/Play"
            >
              <img
                src=${this.isPaused ? playIcon : pauseIcon}
                alt="play/pause"
                width="16"
                height="16"
                class="opacity-90"
              />
            </button>
          `
        : ""}
      ${this.isLobbyCreator
        ? html`
            <button
              class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-amber-500/20 border border-slate-700/60 hover:border-amber-400/60 text-amber-300 cursor-pointer transition-all duration-150 shadow-xs active:scale-95"
              @click=${() =>
                window.dispatchEvent(
                  new CustomEvent("ironfront-open-host-panel"),
                )}
              title=${translateText("host_admin.title")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]"
              >
                <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
              </svg>
            </button>
          `
        : ""}
      ${showNewLobbyButton
        ? html`
            <button
              class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-cyan-500/20 border border-slate-700/60 hover:border-cyan-400/60 text-slate-200 cursor-pointer transition-all duration-150 shadow-xs active:scale-95 ${this.newLobbyRequested
                ? "opacity-50 pointer-events-none"
                : ""}"
              @click=${this.onNewLobbyButtonClick}
              title=${translateText("win_modal.new_lobby")}
            >
              <img
                src=${newLobbyIcon}
                alt=${translateText("win_modal.new_lobby")}
                width="16"
                height="16"
                class="opacity-90"
              />
            </button>
          `
        : ""}
    `;
  }
}

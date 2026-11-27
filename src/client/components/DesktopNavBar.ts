import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import "./NavAccountMenu";
import { NavNotificationsController } from "./NavNotificationsController";
import "./NavUtilityIcons";

@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  private _notifications = new NavNotificationsController(this);

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("showPage", this._onShowPage);

    const current = window.currentPageId;
    if (current) {
      // Wait for render
      this.updateComplete.then(() => {
        this._updateActiveState(current);
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("showPage", this._onShowPage);
  }

  private _onShowPage = (e: Event) => {
    const pageId = (e as CustomEvent).detail;
    this._updateActiveState(pageId);
  };

  private _updateActiveState(pageId: string) {
    this.querySelectorAll(".nav-menu-item").forEach((el) => {
      if ((el as HTMLElement).dataset.page === pageId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  render() {
    window.currentPageId ??= "page-play";
    const currentPage = window.currentPageId;

    return html`
      <nav
        class="hidden lg:flex w-full bg-[#070b14]/85 backdrop-blur-xl border-b border-cyan-500/15 shadow-[0_4px_30px_rgba(0,0,0,0.8)] items-center justify-center gap-8 py-3.5 shrink-0 z-50 relative before:absolute before:inset-x-0 before:bottom-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-cyan-400/40 before:to-transparent"
      >
        <div class="flex flex-col items-center justify-center">
          <div class="h-8">
            <img
              class="block h-full aspect-[1364/259] drop-shadow-[0_0_12px_rgba(6,182,212,0.35)]"
              src=${assetUrl("images/OpenFrontLogo.svg")}
              alt="IronFront"
            />
          </div>
          <div
            id="game-version"
            class="l-header__highlightText text-center text-xs text-cyan-400/70"
          ></div>
        </div>
        <button
          class="nav-menu-item ${currentPage === "page-play"
            ? "active"
            : ""} text-slate-300 hover:text-cyan-400 font-semibold tracking-wider uppercase cursor-pointer transition-all duration-200 [&.active]:text-cyan-400 [&.active]:drop-shadow-[0_0_10px_rgba(6,182,212,0.7)] px-3 py-1.5 rounded-lg hover:bg-white/5"
          data-page="page-play"
          data-i18n="main.play"
        ></button>
        <button
          class="nav-menu-item ${currentPage === "page-inventory"
            ? "active"
            : ""} text-slate-300 hover:text-cyan-400 font-semibold tracking-wider uppercase cursor-pointer transition-all duration-200 [&.active]:text-cyan-400 [&.active]:drop-shadow-[0_0_10px_rgba(6,182,212,0.7)] px-3 py-1.5 rounded-lg hover:bg-white/5"
          data-page="page-inventory"
          data-i18n="main.inventory"
        ></button>
        <button
          class="nav-menu-item ${currentPage === "page-item-store"
            ? "active"
            : ""} text-amber-300/90 hover:text-amber-300 font-semibold tracking-wider uppercase cursor-pointer transition-all duration-200 [&.active]:text-amber-300 [&.active]:drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] px-3 py-1.5 rounded-lg hover:bg-amber-400/10 flex items-center gap-1.5"
          data-page="page-item-store"
        >
          <span>🛒</span>
          <span>فروشگاه</span>
        </button>
        <button
          class="nav-menu-item text-slate-300 hover:text-cyan-400 font-semibold tracking-wider uppercase cursor-pointer transition-all duration-200 [&.active]:text-cyan-400 [&.active]:drop-shadow-[0_0_10px_rgba(6,182,212,0.7)] px-3 py-1.5 rounded-lg hover:bg-white/5"
          data-page="page-leaderboard"
          data-i18n="main.leaderboard"
        ></button>
        <button
          class="nav-menu-item text-slate-300 hover:text-cyan-400 font-semibold tracking-wider uppercase cursor-pointer transition-all duration-200 [&.active]:text-cyan-400 [&.active]:drop-shadow-[0_0_10px_rgba(6,182,212,0.7)] px-3 py-1.5 rounded-lg hover:bg-white/5"
          data-page="page-history"
          data-i18n="main.history"
          @click=${() => {
            const el = document.querySelector("match-history-modal") as any;
            el?.open?.();
          }}
        ></button>
        <!-- Utility cluster: bell, help, settings and the profile control are
             account/notification/utility affordances rather than page links,
             so they sit tight together behind a divider instead of in the nav
             item list. -->
        <div class="flex items-center gap-1 pl-5 ml-1 border-l border-white/10">
          <nav-utility-icons size="desktop"></nav-utility-icons>
          <nav-account-menu variant="desktop"></nav-account-menu>
        </div>
      </nav>
    `;
  }
}

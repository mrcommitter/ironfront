import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { composeVersionDisplay, desktopVersion } from "../DesktopShell";
import { currentGameVersion } from "../GameVersion";
@customElement("page-footer")
export class Footer extends LitElement {
  // Per instance, not at module scope: currentGameVersion reads
  // BOOTSTRAP_CONFIG, which the server injects into the page and which is not
  // guaranteed to exist at the moment this module is first imported.
  private readonly gameVersion = currentGameVersion();

  // Starts as the game version alone and gains the shell version once the
  // bridge answers, so the line is never blank while that call is in flight.
  @state() private versionLabel = this.gameVersion;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // desktopVersion() resolves null off the desktop shell and on its own
    // timeout, so this can only ever leave the label as-is or extend it.
    void desktopVersion().then((shellVersion) => {
      this.versionLabel = composeVersionDisplay(this.gameVersion, shellVersion);
    });
  }

  render() {
    return html`
      <footer
        class="[.in-game_&]:hidden bg-zinc-900/90 backdrop-blur-md flex flex-col items-center justify-center gap-1.5 py-3 text-white/50 w-full border-t border-white/10 shrink-0 relative z-50 px-4"
      >
        <div class="flex flex-col items-center gap-1">
          <div class="footer-version text-xs text-center font-mono text-white/40">
            ${this.versionLabel}
          </div>
          <div
            class="text-xs flex items-center justify-center gap-4 text-white/60"
          >
            <a
              href="/terms-of-service.html"
              data-i18n="main.terms_of_service"
              target="_blank"
              class="hover:text-white transition-colors"
            ></a>
            <span>•</span>
            <span data-i18n="main.copyright"></span>
            <span>•</span>
            <a
              href="/privacy-policy.html"
              data-i18n="main.privacy_policy"
              target="_blank"
              class="hover:text-white transition-colors"
            ></a>
          </div>
        </div>

        <lang-selector
          class="absolute right-4 top-1/2 -translate-y-1/2"
        ></lang-selector>
      </footer>
    `;
  }
}

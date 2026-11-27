import { html, LitElement, render as litRender } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ColumnId } from "../../StatsConstants";
import { translateText } from "../../Utils";
import type { ColumnDef } from "./lib/StatsColumns";

/**
 * ⚙️ button + checkbox popover for choosing which stat columns a panel
 * shows. Emits `columns-changed` (CustomEvent<ColumnId[]>) with the new
 * selection in registry order; the host persists and re-renders.
 */
@customElement("column-picker")
export class ColumnPicker extends LitElement {
  @property({ attribute: false }) columns: readonly ColumnDef[] = [];
  @property({ attribute: false }) selected: readonly ColumnId[] = [];

  @state() private open = false;
  private portal: HTMLDivElement | null = null;

  createRenderRoot() {
    return this; // light DOM for Tailwind
  }

  private onDocumentClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (this.open && !this.contains(target) && !this.portal?.contains(target)) {
      this.open = false;
    }
  };

  private onViewportChange = (event: Event) => {
    const target = event.target;
    if (
      this.open &&
      !(target instanceof Node && this.portal?.contains(target))
    ) {
      this.renderPortal();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.onDocumentClick);
    window.addEventListener("resize", this.onViewportChange);
    window.addEventListener("scroll", this.onViewportChange, true);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.onDocumentClick);
    window.removeEventListener("resize", this.onViewportChange);
    window.removeEventListener("scroll", this.onViewportChange, true);
    this.removePortal();
    super.disconnectedCallback();
  }

  protected updated() {
    this.renderPortal();
  }

  private toggle(id: ColumnId) {
    const isSelected = this.selected.includes(id);
    if (isSelected && this.selected.length === 1) return; // keep at least one
    const next = this.columns
      .map((c) => c.id)
      .filter((cid) =>
        cid === id ? !isSelected : this.selected.includes(cid),
      );
    this.dispatchEvent(
      new CustomEvent<ColumnId[]>("columns-changed", {
        detail: next,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderPortal() {
    if (!this.open || !this.isConnected) {
      this.removePortal();
      return;
    }

    const trigger = this.querySelector("button");
    if (trigger === null) return;

    if (this.portal === null) {
      this.portal = document.createElement("div");
      this.portal.className = "column-picker-portal";
      document.body.appendChild(this.portal);
    }

    const rect = trigger.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = rect.bottom + 4;
    const maxHeight = Math.max(
      80,
      Math.min(window.innerHeight * 0.4, window.innerHeight - top - 8),
    );

    litRender(
      html`
        <div
          class="column-picker-popover fixed z-2000 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-xl p-2.5 flex flex-col gap-1 overflow-y-auto whitespace-nowrap text-xs text-white"
          style="top: ${top}px; right: ${right}px; max-height: ${maxHeight}px;"
        >
          <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider pb-1.5 border-b border-white/5 mb-0.5">
            ${translateText("leaderboard.configure_columns")}
          </div>
          ${this.columns.map((column) => {
            const checked = this.selected.includes(column.id);
            return html`
              <label
                class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 text-white/90 hover:text-white cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  class="rounded accent-cyan-500 cursor-pointer"
                  .checked=${checked}
                  ?disabled=${checked && this.selected.length === 1}
                  @change=${() => this.toggle(column.id)}
                />
                <span class="font-medium">${translateText(column.labelKey)}</span>
              </label>
            `;
          })}
        </div>
      `,
      this.portal,
    );
  }

  private removePortal() {
    this.portal?.remove();
    this.portal = null;
  }

  render() {
    return html`
      <button
        class="w-5 h-5 rounded flex items-center justify-center border border-white/10 bg-white/5 hover:bg-cyan-500/20 hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 transition-all cursor-pointer shadow-xs"
        title=${translateText("leaderboard.configure_columns")}
        aria-expanded=${this.open}
        aria-haspopup="menu"
        @click=${() => (this.open = !this.open)}
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
    `;
  }
}

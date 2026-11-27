import { LitElement, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { documentStylesSheet } from "./SharedStyles";

export type OModalTab = { key: string; label: string };

@customElement("o-modal")
export class OModal extends LitElement {
  static styles = [documentStylesSheet()];

  @state() public isModalOpen = false;

  @query("[data-modal-scroll]") private scrollContainer?: HTMLElement;

  static openCount = 0;

  @property({ type: Boolean })
  public inline = false;

  @property({ type: Boolean })
  public alwaysMaximized = false;

  @property({ type: Boolean })
  public hideCloseButton = false;

  @property({ type: String })
  public title = "";

  @property({ type: Boolean })
  public hideHeader = false;

  @property({ type: String })
  public maxWidth = "";

  @property({ type: Array })
  public tabs: OModalTab[] = [];

  @property({ type: String })
  public activeTab = "";

  @property({ attribute: false })
  public onTabChange?: (key: string) => void;

  public onClose?: () => void;

  public open() {
    if (!this.isModalOpen) {
      if (!this.inline) {
        OModal.openCount = OModal.openCount + 1;
        if (OModal.openCount === 1) document.body.style.overflow = "hidden";
      }
      this.isModalOpen = true;
    }
  }

  public close() {
    if (this.isModalOpen) {
      this.isModalOpen = false;
      this.onClose?.();
      if (!this.inline) {
        OModal.openCount = Math.max(0, OModal.openCount - 1);
        if (OModal.openCount === 0) document.body.style.overflow = "";
      }
    }
  }

  public getScrollTop(): number {
    return this.scrollContainer?.scrollTop ?? 0;
  }

  public setScrollTop(scrollTop: number): void {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = scrollTop;
    }
  }

  disconnectedCallback() {
    // Ensure global counter is decremented if this modal is removed while open.
    if (this.isModalOpen && !this.inline) {
      OModal.openCount = Math.max(0, OModal.openCount - 1);
      if (OModal.openCount === 0) document.body.style.overflow = "";
    }
    super.disconnectedCallback();
  }

  private handleTabClick(key: string) {
    this.onTabChange?.(key);
  }

  private renderTabs() {
    return html`
      <div
        role="tablist"
        class="flex flex-wrap justify-center border-b border-white/10 px-4 lg:px-6 gap-2 shrink-0 py-1"
      >
        ${this.tabs.map((tab) => {
          const active = this.activeTab === tab.key;
          return html`
            <button
              type="button"
              role="tab"
              data-key=${tab.key}
              aria-selected=${active}
              class="px-4 py-2 my-1 text-sm font-bold uppercase tracking-wider transition-all duration-200 relative cursor-pointer rounded-xl ${active
                ? "text-cyan-300 bg-cyan-500/15 border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}"
              @click=${() => this.handleTabClick(tab.key)}
            >
              ${tab.label}
            </button>
          `;
        })}
      </div>
    `;
  }

  render() {
    const shouldRender = this.isModalOpen || this.inline;
    if (!shouldRender) {
      return html``;
    }

    const backdropClass = this.inline
      ? "relative z-10 w-full h-full flex items-stretch bg-transparent"
      : "fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center overflow-hidden";

    const wrapperClass = this.inline
      ? "relative flex flex-col w-full h-full m-0 max-w-full max-h-none shadow-none"
      : `relative flex flex-col w-full h-full lg:w-[90%] lg:h-auto lg:min-w-[400px] lg:max-w-[900px] lg:m-8 lg:rounded-lg lg:max-h-[calc(100vh-4rem)] ${
          this.alwaysMaximized ? "h-auto" : ""
        }`;
    const wrapperStyle =
      !this.inline && this.maxWidth ? `max-width: ${this.maxWidth};` : "";

    const hasTabs = this.tabs.length > 0;
    const sectionClass =
      "relative flex-1 min-h-0 flex flex-col text-white bg-slate-950/90 backdrop-blur-2xl lg:rounded-2xl lg:border border-cyan-500/25 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_35px_rgba(6,182,212,0.12)] overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-cyan-400 before:to-transparent before:opacity-80";

    return html`
      <aside
        class="${backdropClass}"
        @click=${this.inline ? null : () => this.close()}
      >
        <div
          @click=${(e: Event) => e.stopPropagation()}
          class="${wrapperClass}"
          style="${wrapperStyle}"
        >
          ${this.inline || this.hideCloseButton
            ? html``
            : html`<button
                type="button"
                aria-label="Close"
                class="absolute top-4 ltr:right-4 rtl:left-4 z-20 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-all duration-200 border border-white/15 hover:scale-110 active:scale-95 cursor-pointer shadow-md"
                @click=${() => this.close()}
              >
                ✕
              </button>`}
          ${!this.hideHeader && this.title
            ? html`<div
                class="px-[1.4rem] py-[1rem] text-2xl font-bold text-white tracking-wide"
              >
                ${this.title}
              </div>`
            : html``}
          <section class="${sectionClass}">
            <slot name="header"></slot>
            ${hasTabs ? this.renderTabs() : html``}
            <div data-modal-scroll class="flex-1 min-h-0 overflow-y-auto">
              <slot></slot>
            </div>
          </section>
        </div>
      </aside>
    `;
  }
}

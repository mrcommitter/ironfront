import { LitElement, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translateText } from "../../Utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "warning" | "ghost";
type ButtonSize = "xs" | "sm" | "md" | "lg";
type ButtonWidth = "auto" | "block" | "blockDesktop" | "fill";
type IconPosition = "left" | "right" | "only";

@customElement("o-button")
export class OButton extends LitElement {
  @property() title = "";
  @property() translationKey = "";
  @property() variant: ButtonVariant = "primary";
  @property() size: ButtonSize = "md";
  @property() width: ButtonWidth = "auto";
  @property() iconPosition: IconPosition = "left";
  @property({ attribute: false }) icon?: TemplateResult;
  @property({ type: Boolean }) disable = false;
  @property({ type: Boolean }) submit = false;
  @property({ type: Boolean }) uppercase = true;

  createRenderRoot() {
    return this;
  }

  private readonly BASE =
    "font-bold tracking-wider rounded-xl border " +
    "transition-all duration-300 transform active:scale-[0.98] " +
    "outline-none text-center whitespace-normal break-words leading-tight overflow-hidden relative cursor-pointer " +
    "disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:opacity-50 disabled:shadow-none";

  private variantClasses(): string {
    switch (this.variant) {
      case "primary":
        return "bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-400 text-white border-cyan-400/40 shadow-[0_4px_20px_rgba(6,182,212,0.35)] hover:shadow-[0_6px_28px_rgba(6,182,212,0.55)] hover:-translate-y-0.5 disabled:from-slate-700 disabled:to-slate-800 disabled:border-transparent";
      case "secondary":
        return "bg-slate-900/85 hover:bg-slate-800/90 text-slate-100 border-white/15 hover:border-cyan-400/40 shadow-[0_4px_16px_rgba(0,0,0,0.5)] hover:shadow-[0_6px_20px_rgba(6,182,212,0.2)] backdrop-blur-md hover:-translate-y-0.5 disabled:bg-slate-900/40 disabled:border-white/5 disabled:text-slate-500";
      case "danger":
        return "bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white border-rose-400/40 shadow-[0_4px_20px_rgba(225,29,72,0.35)] hover:shadow-[0_6px_28px_rgba(225,29,72,0.55)] hover:-translate-y-0.5 disabled:from-zinc-800 disabled:to-zinc-900 disabled:border-transparent";
      case "warning":
        return "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black border-yellow-300/40 shadow-[0_4px_20px_rgba(245,158,11,0.35)] hover:shadow-[0_6px_28px_rgba(245,158,11,0.55)] hover:-translate-y-0.5 disabled:from-zinc-800 disabled:to-zinc-900 disabled:text-gray-400";
      case "ghost":
        return "bg-transparent hover:bg-white/10 text-cyan-400 hover:text-cyan-300 border-transparent hover:border-cyan-500/25 disabled:text-gray-500 disabled:hover:bg-transparent";
    }
  }

  private sizeClasses(): string {
    if (this.iconPosition === "only") {
      switch (this.size) {
        case "xs":
          return "w-6 h-6 text-xs";
        case "sm":
          return "w-8 h-8 text-sm";
        case "md":
          return "w-10 h-10 text-base";
        case "lg":
          return "w-12 h-12 text-lg";
      }
    }
    switch (this.size) {
      case "xs":
        return "py-1 px-2 text-xs";
      case "sm":
        return "py-1.5 px-3 text-sm";
      case "md":
        return "py-3 px-4 text-base lg:text-lg";
      case "lg":
        return "py-4 px-6 text-lg lg:text-xl";
    }
  }

  private widthClasses(): string {
    switch (this.width) {
      case "auto":
        return "inline-flex items-center justify-center gap-2";
      case "block":
        return "flex w-full items-center justify-center gap-2";
      case "blockDesktop":
        return "flex w-full items-center justify-center gap-2 lg:w-1/2 lg:mx-auto";
      case "fill":
        return "flex w-full h-full items-center justify-center gap-2";
    }
  }

  render() {
    const label =
      this.translationKey === ""
        ? this.title
        : translateText(this.translationKey);
    const iconOnly = this.iconPosition === "only";
    const casing = this.uppercase ? "uppercase" : "normal-case";
    const classes = `${this.BASE} ${casing} ${this.variantClasses()} ${this.sizeClasses()} ${this.widthClasses()}`;

    return html`
      <button
        class=${classes}
        ?disabled=${this.disable}
        type=${this.submit ? "submit" : "button"}
        aria-label=${iconOnly ? label : nothing}
      >
        ${this.icon && this.iconPosition !== "right" ? this.icon : nothing}
        ${iconOnly ? nothing : html`<span class="min-w-0">${label}</span>`}
        ${this.icon && this.iconPosition === "right" ? this.icon : nothing}
      </button>
    `;
  }
}

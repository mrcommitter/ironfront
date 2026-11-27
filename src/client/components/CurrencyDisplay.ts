import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translateText } from "../Utils";
import "./CapIcon";
import "./PlutoniumIcon";

// Player wallets arrive as numbers (CurrencyBalancesSchema coerces them), clan
// treasuries as decimal bigint strings (ClanInfoSchema) that can exceed
// Number.MAX_SAFE_INTEGER — so strings are parsed with BigInt, never Number.
// Returns null when there is no amount to show (absent, or unparseable), which
// the renderer treats as "hide this side" rather than "zero". Note BigInt("")
// is 0n, hence the falsy guard on the string branch.
export function formatCurrencyAmount(
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : null;
  }
  if (!value) return null;
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return null;
  }
}

@customElement("currency-display")
export class CurrencyDisplay extends LitElement {
  // Not attributes: these accept bigint strings as well as numbers, and are
  // always set via property binding.
  @property({ attribute: false })
  hard: number | string | null = null;

  @property({ attribute: false })
  soft: number | string | null = null;

  // Dimmer and smaller, for sitting inside a metadata row rather than
  // standing alone as a wallet header.
  @property({ type: Boolean })
  compact = false;

  createRenderRoot() {
    return this;
  }

  render() {
    const hard = formatCurrencyAmount(this.hard);
    const soft = formatCurrencyAmount(this.soft);
    if (hard === null && soft === null) return html``;

    const compact = this.compact;
    const row = compact
      ? "flex items-center gap-3 text-xs"
      : "flex items-center gap-3 justify-center";
    const hardPill = compact
      ? "flex items-center gap-1.5 text-xs font-bold text-emerald-400"
      : "flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-950/80 via-teal-950/70 to-emerald-950/80 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)] text-sm font-black text-emerald-300 hover:border-emerald-400/80 hover:shadow-[0_0_20px_rgba(16,185,129,0.45)] transition-all cursor-default";
    const softPill = compact
      ? "flex items-center gap-1.5 text-xs font-bold text-amber-400"
      : "flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-950/80 via-yellow-950/70 to-amber-950/80 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)] text-sm font-black text-amber-300 hover:border-amber-400/80 hover:shadow-[0_0_20px_rgba(245,158,11,0.45)] transition-all cursor-default";

    return html`
      <div class="${row}">
        ${hard === null
          ? ""
          : html`<div
              class="${hardPill}"
              title=${translateText("cosmetics.hard")}
            >
              <plutonium-icon .size=${compact ? 12 : 18}></plutonium-icon>
              <span>${hard}</span>
            </div>`}
        ${soft === null
          ? ""
          : html`<div
              class="${softPill}"
              title=${translateText("cosmetics.soft")}
            >
              <cap-icon
                .size=${compact ? 14 : 20}
                style=${compact ? "" : "margin-top:1px"}
              ></cap-icon>
              <span>${soft}</span>
            </div>`}
      </div>
    `;
  }
}

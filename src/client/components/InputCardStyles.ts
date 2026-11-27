export const ACTIVE_CARD =
  "bg-gradient-to-br from-blue-950/60 to-cyan-950/60 border-cyan-400/60 shadow-[0_0_20px_rgba(6,182,212,0.35)] text-cyan-200";
export const INACTIVE_CARD =
  "bg-slate-900/60 border-white/10 hover:bg-slate-800/70 hover:border-white/25 text-white/80";
export const INPUT_CLASS =
  "w-full text-center rounded-lg bg-slate-950/80 text-white text-sm font-bold border border-white/20 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_12px_rgba(6,182,212,0.4)] p-1.5 my-1 transition-all";
export const CARD_LABEL_CLASS =
  "text-xs uppercase font-bold tracking-wider leading-tight break-words hyphens-auto";

export function cardClass(active: boolean, extra = ""): string {
  return `w-full h-full rounded-xl border cursor-pointer transition-all duration-300 active:scale-[0.98] relative overflow-hidden backdrop-blur-md ${extra} ${active ? ACTIVE_CARD : INACTIVE_CARD}`;
}

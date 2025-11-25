import { Sparkles } from "lucide-react";

import { BETA_BADGE_SUBTEXT, BETA_BADGE_TEXT, SHOW_BETA_BADGE } from "@/config/app";

export function BetaBadge({ subtle = false }: { subtle?: boolean }) {
  if (!SHOW_BETA_BADGE) {
    return null;
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide";
  const palette = subtle
    ? "border-amber-400/60 bg-amber-50/60 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-400"
    : "border-amber-500 bg-gradient-to-r from-amber-200/90 to-amber-100/70 text-amber-900 shadow-sm dark:from-amber-900/40 dark:to-amber-800/30 dark:text-amber-100 dark:border-amber-700";

  return (
    <span className={`${base} ${palette}`} title={BETA_BADGE_SUBTEXT}>
      <Sparkles size={14} />
      <span>{BETA_BADGE_TEXT}</span>
    </span>
  );
}

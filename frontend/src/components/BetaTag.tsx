import { BETA_BADGE_SUBTEXT, BETA_BADGE_TEXT, SHOW_BETA_BADGE } from "@/config/app";

export function BetaBadge({ subtle = false }: { subtle?: boolean }) {
  if (!SHOW_BETA_BADGE) {
    return null;
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide";
  const palette = subtle
    ? "border-sky-300/70 bg-sky-50/80 text-sky-800 dark:bg-sky-950/25 dark:border-sky-800/60 dark:text-sky-200"
    : "border-sky-400/70 bg-gradient-to-r from-sky-100 to-cyan-50 text-sky-950 shadow-sm dark:from-sky-950/40 dark:to-cyan-950/30 dark:text-sky-100 dark:border-sky-700";

  return (
    <span className={`${base} ${palette}`} title={BETA_BADGE_SUBTEXT}>
      <span>{BETA_BADGE_TEXT}</span>
    </span>
  );
}

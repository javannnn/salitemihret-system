const env = import.meta.env;

function normalizeFlag(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (!value) return false;
  return !["0", "false", "off", "no"].includes(value.toString().toLowerCase());
}

export const SHOW_BETA_BADGE = normalizeFlag(env.VITE_SHOW_BETA_TAG ?? "true");
export const BETA_BADGE_TEXT = env.VITE_BETA_LABEL ?? "Beta";
export const BETA_BADGE_SUBTEXT =
  env.VITE_BETA_MESSAGE ?? "Preview build • Feedback welcome";

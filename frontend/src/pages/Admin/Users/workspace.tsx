import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/roles";

type UserIdentityLike = {
  full_name?: string | null;
  username: string;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  info:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
};

function toDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function cn(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function formatRoleLabel(roleName: string) {
  return ROLE_LABELS[roleName] || roleName;
}

export function formatDateTime(value?: string | null, fallback = "Never") {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeTime(value?: string | null, fallback = "Never") {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }

  const deltaMs = date.getTime() - Date.now();
  const absMs = Math.abs(deltaMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
    { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
    { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
    { unit: "week", ms: 1000 * 60 * 60 * 24 * 7 },
    { unit: "day", ms: 1000 * 60 * 60 * 24 },
    { unit: "hour", ms: 1000 * 60 * 60 },
    { unit: "minute", ms: 1000 * 60 },
  ];

  for (const { unit, ms } of units) {
    if (absMs >= ms) {
      return rtf.format(Math.round(deltaMs / ms), unit);
    }
  }

  return rtf.format(Math.round(deltaMs / 1000), "second");
}

export function getUserDisplayName(user: UserIdentityLike) {
  return user.full_name?.trim() || user.username;
}

export function getUserInitials(user: UserIdentityLike) {
  const source = getUserDisplayName(user).replace(/[._-]+/g, " ").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "U";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function compareStringSets(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((item, index) => item === rightSorted[index]);
}

export function ToneBadge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <Badge className={cn("normal-case border", toneClasses[tone], className)}>
      {children}
    </Badge>
  );
}

export function UserAvatar({
  className,
  user,
  ...props
}: { user: UserIdentityLike } & ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white",
        className,
      )}
      {...props}
    >
      {getUserInitials(user)}
    </div>
  );
}

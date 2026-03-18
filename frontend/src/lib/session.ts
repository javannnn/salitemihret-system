const SESSION_EXPIRED_EVENT = "session-expired";
const SESSION_RESTORED_EVENT = "session-restored";
const SESSION_LAST_ACTIVITY_KEY = "session_last_activity_at";
const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 15_000;

export type SessionExpiryReason = "expired" | "idle" | "unauthorized";

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

let sessionNoticeRaised = false;
let sessionRestorePromise: Promise<void> | null = null;
let resolveSessionRestore: (() => void) | null = null;
let lastActivityWriteAt = 0;

export function getLastSessionActivityAt(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_LAST_ACTIVITY_KEY);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function recordSessionActivity(now = Date.now(), force = false) {
  if (typeof window === "undefined") return;
  if (!force && now - lastActivityWriteAt < SESSION_ACTIVITY_WRITE_INTERVAL_MS) {
    return;
  }
  lastActivityWriteAt = now;
  window.localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
}

export function clearSessionActivity() {
  lastActivityWriteAt = 0;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
}

export function getSessionIdleRemainingMs(now = Date.now()): number {
  const lastActivityAt = getLastSessionActivityAt() ?? now;
  return Math.max(0, SESSION_IDLE_TIMEOUT_MS - (now - lastActivityAt));
}

export function isSessionIdleExpired(now = Date.now()): boolean {
  return getSessionIdleRemainingMs(now) === 0;
}

export function notifySessionExpired(reason: SessionExpiryReason = "expired") {
  if (typeof window === "undefined") return;
  if (sessionNoticeRaised) return;
  sessionNoticeRaised = true;
  window.dispatchEvent(new CustomEvent<SessionExpiryReason>(SESSION_EXPIRED_EVENT, { detail: reason }));
}

export function waitForSessionRestored(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (!sessionNoticeRaised) {
    return Promise.resolve();
  }
  if (!sessionRestorePromise) {
    sessionRestorePromise = new Promise((resolve) => {
      resolveSessionRestore = resolve;
    });
  }
  return sessionRestorePromise;
}

export function subscribeSessionExpired(handler: (reason: SessionExpiryReason) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    handler((detail as SessionExpiryReason | undefined) || "expired");
  };
  window.addEventListener(SESSION_EXPIRED_EVENT, listener as EventListener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener as EventListener);
}

export function subscribeSessionRestored(handler: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = () => handler();
  window.addEventListener(SESSION_RESTORED_EVENT, listener);
  return () => window.removeEventListener(SESSION_RESTORED_EVENT, listener);
}

export function resetSessionExpiryNotice() {
  sessionNoticeRaised = false;
  if (resolveSessionRestore) {
    resolveSessionRestore();
    resolveSessionRestore = null;
    sessionRestorePromise = null;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_RESTORED_EVENT));
  }
}

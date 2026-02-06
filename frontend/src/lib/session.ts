const SESSION_EXPIRED_EVENT = "session-expired";
const SESSION_RESTORED_EVENT = "session-restored";

let sessionNoticeRaised = false;
let sessionRestorePromise: Promise<void> | null = null;
let resolveSessionRestore: (() => void) | null = null;

export function notifySessionExpired() {
  if (typeof window === "undefined") return;
  if (sessionNoticeRaised) return;
  sessionNoticeRaised = true;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
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

export function subscribeSessionExpired(handler: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = () => handler();
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
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

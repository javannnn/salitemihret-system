import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { subscribeSessionExpired, subscribeSessionRestored } from "@/lib/session";

interface ToastItem {
  id: string;
  message: string;
  kind: "info" | "error";
}

interface ToastContextValue {
  push: (message: string, kind?: "info" | "error") => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [muted, setMuted] = useState(false);

  const createId = useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);

  const push = useCallback((message: string, kind: "info" | "error" = "info") => {
    if (muted) return;
    setToasts((prev) => {
      const hasDuplicate = prev.some((item) => item.message === message && item.kind === kind);
      if (hasDuplicate) return prev;
      const id = createId();
      return [...prev, { id, message, kind }];
    });
  }, [createId, muted]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, 3500)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  useEffect(() => {
    const unsubscribeExpired = subscribeSessionExpired(() => {
      setMuted(true);
      setToasts([]);
    });
    const unsubscribeRestored = subscribeSessionRestored(() => setMuted(false));
    return () => {
      unsubscribeExpired();
      unsubscribeRestored();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-xl shadow-soft text-sm border ${
              toast.kind === "error"
                ? "bg-rose-950/90 text-rose-50 border-rose-700/60"
                : "bg-slate-900/90 text-slate-50 border-slate-700/60"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

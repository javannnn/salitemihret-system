import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { subscribeSessionExpired, subscribeSessionRestored } from "@/lib/session";

interface ToastItem {
  id: string;
  message: string;
}

interface ToastContextValue {
  push: (message: string) => void;
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

  const push = useCallback((message: string) => {
    if (muted) return;
    const id = createId();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3000);
  }, [createId, muted]);

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
            className="bg-ink text-white px-4 py-2 rounded-xl shadow-soft text-sm"
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

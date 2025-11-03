import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { WhoAmI, whoami } from "@/lib/auth";
import { getToken } from "@/lib/api";

interface AuthContextValue {
  user: WhoAmI | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WhoAmI | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await whoami();
      setUser(data);
    } catch (error) {
      console.error(error);
      setUser(null);
      localStorage.removeItem("access_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, refresh: load }),
    [user, loading, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

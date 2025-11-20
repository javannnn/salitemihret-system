import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { WhoAmI, whoami } from "@/lib/auth";
import { getToken, setToken } from "@/lib/api";
import { resetSessionExpiryNotice } from "@/lib/session";

interface AuthContextValue {
  user: WhoAmI | null;
  token: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WhoAmI | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const existing = getToken();
    if (!existing) {
      setUser(null);
      setTokenState(null);
      setLoading(false);
      resetSessionExpiryNotice();
      return;
    }

    setLoading(true);
    try {
      const data = await whoami();
      setUser(data);
      setTokenState(getToken());
      resetSessionExpiryNotice();
    } catch (error) {
      console.error(error);
      setUser(null);
      setToken(null);
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, refresh: load }),
    [user, token, loading, load]
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

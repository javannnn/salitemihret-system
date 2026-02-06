import { api, API_BASE, getToken, setToken } from "@/lib/api";

export type WhoAmI = {
  id: number;
  user: string;
  username: string;
  roles: string[];
  is_super_admin: boolean;
  full_name: string | null;
};

export async function login(email: string, password: string, recaptchaToken?: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, recaptcha_token: recaptchaToken }),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Invalid credentials");
  }

  const data = (await res.json()) as { access_token: string; token_type: string };
  setToken(data.access_token);
  return data;
}

export async function whoami(): Promise<WhoAmI> {
  if (!getToken()) {
    throw new Error("Missing token");
  }
  return api<WhoAmI>("/auth/whoami", { skipSessionRestore: true });
}

type JwtPayload = {
  exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  if (typeof window === "undefined") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decoded = window.atob(padded);
    return JSON.parse(decoded) as JwtPayload;
  } catch (error) {
    console.error("Failed to decode session token", error);
    return null;
  }
}

export function getTokenExpiry(token?: string | null): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

export function isTokenExpired(token?: string | null, skewMs = 30_000): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return false;
  return Date.now() + skewMs >= expiry;
}

export function logout() {
  setToken(null);
  window.location.href = "/login";
}

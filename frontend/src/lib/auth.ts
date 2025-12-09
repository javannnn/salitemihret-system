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
  return api<WhoAmI>("/auth/whoami");
}

export function logout() {
  setToken(null);
  window.location.href = "/login";
}

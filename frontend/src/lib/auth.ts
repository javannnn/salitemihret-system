export type WhoAmI = { user: string; roles: string[]; full_name: string | null };

export async function login(email: string, password: string) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Invalid credentials");
  }

  const data = (await res.json()) as { access_token: string; token_type: string };
  localStorage.setItem("access_token", data.access_token);
  return data;
}

export async function whoami(): Promise<WhoAmI> {
  const token = localStorage.getItem("access_token") || "";
  if (!token) {
    throw new Error("Missing token");
  }

  const res = await fetch(`${import.meta.env.VITE_API_BASE}/auth/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Failed to load session");
  }

  return res.json() as Promise<WhoAmI>;
}

export function logout() {
  localStorage.removeItem("access_token");
  window.location.href = "/login";
}

export const API_BASE = import.meta.env.VITE_API_BASE as string;

export type MemberStatus = "Active" | "Inactive" | "Archived";

export type Member = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  status: MemberStatus;
  phone?: string | null;
  email?: string | null;
  avatar_path?: string | null;
};

export type MemberDetail = Member & {
  birth_date?: string | null;
  is_tither: boolean;
  contribution_method?: string | null;
  contribution_amount?: number | null;
  notes?: string | null;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export function getToken(): string {
  return localStorage.getItem("access_token") || "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed (${res.status})`);
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function exportMembers(params: Record<string, string | number | undefined | null>): Promise<Blob> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  const url = `${API_BASE}/members/export.csv${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Export failed");
  }
  return await res.blob();
}

export type ImportReport = {
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
};

export async function importMembers(file: File): Promise<ImportReport> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}/members/import`, {
    method: "POST",
    body,
    headers: {
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Import failed");
  }
  return res.json();
}

export type AvatarUploadResponse = {
  avatar_url: string;
};

export async function uploadAvatar(memberId: number, file: File): Promise<AvatarUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}/members/${memberId}/avatar`, {
    method: "POST",
    body,
    headers: {
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Avatar upload failed");
  }
  return res.json();
}

export type MemberAuditEntry = {
  changed_at: string;
  actor: string;
  action: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

export async function getMemberAudit(memberId: number): Promise<MemberAuditEntry[]> {
  const res = await fetch(`${API_BASE}/members/${memberId}/audit`, {
    headers: {
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Audit fetch failed");
  }
  return res.json();
}

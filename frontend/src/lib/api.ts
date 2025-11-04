export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8001";

export type MemberStatus = "Active" | "Inactive" | "Pending" | "Archived";

export type Tag = { id: number; name: string; slug: string };
export type Ministry = { id: number; name: string; slug: string };
export type Household = { id: number; name: string; head_member_id: number | null };
export type Priest = { id: number; full_name: string; phone?: string | null; email?: string | null; status: string };
export type Spouse = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  gender?: string | null;
  country_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
};
export type Child = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  gender?: string | null;
  birth_date?: string | null;
  country_of_birth?: string | null;
  notes?: string | null;
};

export type Member = {
  id: number;
  username: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  status: MemberStatus;
  gender?: string | null;
  marital_status?: string | null;
  baptismal_name?: string | null;
  district?: string | null;
  phone: string;
  email?: string | null;
  avatar_path?: string | null;
  address?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_region?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  is_tither: boolean;
  pays_contribution: boolean;
  contribution_method?: string | null;
  contribution_amount?: number | null;
  contribution_currency: string;
  contribution_exception_reason?: string | null;
  notes?: string | null;
  family_count: number;
  household_size_override?: number | null;
  has_father_confessor: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MemberDetail = Member & {
  birth_date?: string | null;
  join_date?: string | null;
  household?: Household | null;
  spouse?: Spouse | null;
  children: Child[];
  tags: Tag[];
  ministries: Ministry[];
  father_confessor?: Priest | null;
  contribution_history: ContributionPayment[];
};

export type ContributionPayment = {
  id: number;
  amount: number;
  currency: string;
  paid_at: string;
  method?: string | null;
  note?: string | null;
  recorded_by_id?: number | null;
  created_at: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

let accessToken: string | null =
  typeof window === "undefined" ? null : window.localStorage.getItem("access_token");

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string | null): void {
  accessToken = token;
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem("access_token", token);
  } else {
    window.localStorage.removeItem("access_token");
  }
}

function shouldSetJsonContentType(body: BodyInit | null | undefined): boolean {
  if (!body) return false;
  if (typeof body === "string") return true;
  return false;
}

function buildHeaders(initHeaders?: HeadersInit, body?: BodyInit | null): Headers {
  const headers = new Headers(initHeaders ?? {});
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (shouldSetJsonContentType(body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = buildHeaders(init.headers, init.body ?? null);
  return fetch(input, { ...init, headers });
}

export class ApiError extends Error {
  status: number;
  body?: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = message;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, init);

  const text = await res.text();

  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, text || "Unauthorized");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    throw new ApiError(res.status, text || `Request failed (${res.status})`);
  }

  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ApiError(res.status, "Unexpected response format");
  }
}

export async function exportMembers(params: Record<string, string | number | undefined | null>): Promise<Blob> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  const url = `${API_BASE}/members/export.csv${query ? `?${query}` : ""}`;
  const res = await authFetch(url, {
    headers: { Accept: "text/csv" },
  });

  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Unauthorized");
  }

  if (res.status === 403) {
    const message = await res.text();
    throw new ApiError(403, message || "Forbidden");
  }

  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(res.status, message || "Export failed");
  }

  return res.blob();
}

export type ImportReport = {
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
};

export async function importMembers(file: File | Blob, filename = "members_import.csv"): Promise<ImportReport> {
  const payload =
    file instanceof File ? file : new File([file], filename, { type: "text/csv" });
  const body = new FormData();
  body.append("file", payload, payload.name);
  const res = await authFetch(`${API_BASE}/members/import`, {
    method: "POST",
    body,
  });

  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Unauthorized");
  }

  const text = await res.text();

  if (res.status === 403) {
    throw new ApiError(403, text || "Forbidden");
  }

  if (!res.ok) {
    throw new ApiError(res.status, text || "Import failed");
  }

  if (!text) {
    throw new ApiError(res.status, "Import response missing body");
  }

  try {
    return JSON.parse(text) as ImportReport;
  } catch {
    throw new ApiError(res.status, "Import response invalid");
  }
}

export type AvatarUploadResponse = {
  avatar_url: string;
};

export async function uploadAvatar(memberId: number, file: File): Promise<AvatarUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const res = await authFetch(`${API_BASE}/members/${memberId}/avatar`, {
    method: "POST",
    body,
  });
  if (res.status === 401) {
    setToken(null);
    throw new Error("Unauthorized");
  }
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
  return api<MemberAuditEntry[]>(`/members/${memberId}/audit`);
}

export type ContributionPaymentPayload = {
  amount: number;
  paid_at?: string;
  method?: string;
  note?: string;
};

export async function getContributionPayments(memberId: number): Promise<ContributionPayment[]> {
  return api<ContributionPayment[]>(`/members/${memberId}/contributions`);
}

export async function createContributionPayment(
  memberId: number,
  payload: ContributionPaymentPayload,
): Promise<ContributionPayment> {
  return api<ContributionPayment>(`/members/${memberId}/contributions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type MembersMeta = {
  statuses: string[];
  genders: string[];
  marital_statuses: string[];
  payment_methods: string[];
  contribution_exception_reasons: string[];
  districts: string[];
  tags: Tag[];
  ministries: Ministry[];
  households: Household[];
  father_confessors: Priest[];
};

export type ChildPromotionCandidate = {
  child_id: number;
  child_name: string;
  birth_date?: string | null;
  turns_on: string;
  parent_member_id: number;
  parent_member_name: string;
  household?: Household | null;
};

export type ChildPromotionPreview = {
  items: ChildPromotionCandidate[];
  total: number;
};

export type ChildPromotionResultItem = {
  child_id: number;
  new_member_id: number;
  new_member_name: string;
  promoted_at: string;
};

export type ChildPromotionRunResponse = {
  promoted: ChildPromotionResultItem[];
};

export async function getMembersMeta(): Promise<MembersMeta> {
  return api<MembersMeta>("/members/meta");
}

export async function getPromotionPreview(withinDays = 30): Promise<ChildPromotionPreview> {
  return api<ChildPromotionPreview>(`/members/promotions?within_days=${withinDays}`);
}

export async function runChildPromotions(): Promise<ChildPromotionRunResponse> {
  return api<ChildPromotionRunResponse>("/members/promotions/run", { method: "POST" });
}

export async function searchPriests(search: string, limit = 20): Promise<Priest[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  return api<Priest[]>(`/priests?${params.toString()}`);
}

export type PriestPayload = {
  full_name: string;
  phone?: string;
  email?: string;
  status?: string;
};

export async function createPriest(payload: PriestPayload): Promise<Priest> {
  return api<Priest>("/priests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEligibleChildren(withinDays = 60): Promise<ChildPromotionPreview> {
  return api<ChildPromotionPreview>(`/children?eligible=true&since_days=${withinDays}`);
}

export async function promoteChild(childId: number): Promise<ChildPromotionResultItem> {
  return api<ChildPromotionResultItem>(`/children/${childId}/promote`, { method: "POST" });
}

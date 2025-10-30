import type { Role } from "../types/rbac";

export interface WhoAmIResponse {
  user: string;
  full_name: string;
  roles: Role[];
  personas: Role[];
}

type Envelope<T> = {
  message?: T;
  data?: T;
};

export const whoAmIMethod = "/api/method/salitemiret.api.auth.whoami";

export async function fetchWhoAmI(): Promise<WhoAmIResponse> {
  const res = await fetch(whoAmIMethod, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`whoami request failed with status ${res.status}`);
  }

  const payload = (await res.json()) as Envelope<WhoAmIResponse>;
  const message = payload.message ?? payload.data ?? (payload as unknown as WhoAmIResponse);

  return {
    user: message.user ?? "",
    full_name: message.full_name ?? "",
    roles: (message.roles ?? []) as Role[],
    personas: (message.personas ?? message.roles ?? []) as Role[],
  };
}

export interface MemberRecord {
  name: string;
  member_name?: string;
  first_name?: string;
  last_name?: string;
}

export interface HouseholdRecord {
  name: string;
  household_name?: string;
  phone?: string;
}

async function fetchResourceList<T>(resource: string, limit = 5): Promise<T[]> {
  const url = `/api/resource/${resource}?limit_page_length=${limit}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`${resource} request failed with status ${res.status}`);
  }

  const payload = (await res.json()) as Envelope<{ data: T[] }> | { data: T[] } | { message: T[] };
  if ("data" in payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  if ("message" in payload && Array.isArray(payload.message)) {
    return payload.message;
  }
  return [];
}

export function fetchMembers(limit = 5): Promise<MemberRecord[]> {
  return fetchResourceList<MemberRecord>("Member", limit);
}

export function fetchHouseholds(limit = 5): Promise<HouseholdRecord[]> {
  return fetchResourceList<HouseholdRecord>("Household", limit);
}

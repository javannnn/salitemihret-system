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

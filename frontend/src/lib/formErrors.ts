import { ApiError } from "@/lib/api";

type ApiErrorDetail = {
  loc?: Array<string | number>;
  msg?: string;
};

type ApiErrorPayload = {
  detail?: ApiErrorDetail[];
};

export type FieldErrorMap = Record<string, string>;

const FRIENDLY_FIELD_MESSAGES: Record<string, string> = {
  contact_email: "Enter a valid email address.",
  contact_phone: "Enter a valid phone number (ex: +1 5551234567).",
  contact_whatsapp: "Enter a valid WhatsApp number (ex: +1 5551234567).",
  family_size: "Family size must be between 1 and 20.",
};

function normalizeFieldMessage(field: string, message: string): string {
  return FRIENDLY_FIELD_MESSAGES[field] || message;
}

export function parseApiFieldErrors(
  error: unknown,
): { fieldErrors: FieldErrorMap; formError?: string } | null {
  if (!(error instanceof ApiError) || error.status !== 422 || !error.body) {
    return null;
  }
  let payload: ApiErrorPayload | null = null;
  try {
    payload = JSON.parse(error.body) as ApiErrorPayload;
  } catch {
    return null;
  }
  if (!payload || !Array.isArray(payload.detail)) {
    return null;
  }

  const fieldErrors: FieldErrorMap = {};
  let formError: string | undefined;

  for (const item of payload.detail) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const loc = Array.isArray(item.loc) ? item.loc : [];
    const msg = typeof item.msg === "string" && item.msg.trim() ? item.msg : "Invalid value.";
    const field = loc.length ? loc[loc.length - 1] : null;
    if (typeof field === "string") {
      if (field === "__root__") {
        formError = msg;
      } else if (!fieldErrors[field]) {
        fieldErrors[field] = normalizeFieldMessage(field, msg);
      }
    } else if (!formError) {
      formError = msg;
    }
  }

  if (!Object.keys(fieldErrors).length && !formError) {
    return null;
  }

  return { fieldErrors, formError };
}

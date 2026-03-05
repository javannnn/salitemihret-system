const CANONICAL_CANADIAN_PHONE = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_ALLOWED_CHARS = /^[\d\s()+\-.]+$/;

export function formatCanadianPhoneInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }
  const trimmed = value.trim();
  let nationalDigits = digitsOnly;
  if (nationalDigits.startsWith("1") && (trimmed.startsWith("+1") || trimmed.startsWith("1") || nationalDigits.length > 10)) {
    nationalDigits = nationalDigits.slice(1);
  }
  nationalDigits = nationalDigits.slice(0, 10);
  if (!nationalDigits) {
    return "";
  }
  return `+1${nationalDigits}`;
}

export function getCanonicalCanadianPhone(value: string): string | null {
  const formatted = formatCanadianPhoneInput(value);
  if (!formatted) {
    return null;
  }
  return CANONICAL_CANADIAN_PHONE.test(formatted) ? formatted : null;
}

export function hasValidCanadianPhone(value: string): boolean {
  return CANONICAL_CANADIAN_PHONE.test(value);
}

export function getCanadianPhoneValidationMessage(value: string, fieldLabel = "Phone number"): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  let nationalDigits = digitsOnly;
  if (nationalDigits.length === 11 && nationalDigits.startsWith("1")) {
    nationalDigits = nationalDigits.slice(1);
  }

  if (nationalDigits.length < 10) {
    return `${fieldLabel} needs 10 digits after +1.`;
  }
  if (nationalDigits.length > 10) {
    return `${fieldLabel} can only have 10 digits after +1.`;
  }
  if (!/^[2-9]/.test(nationalDigits)) {
    return `${fieldLabel} area code must start with 2-9.`;
  }
  if (!/^[2-9]/.test(nationalDigits.slice(3))) {
    return `${fieldLabel} exchange code (digits 4-6) must start with 2-9.`;
  }

  return null;
}

export function getCanadianPhoneSnapSuggestion(value: string): string | null {
  const formatted = formatCanadianPhoneInput(value);
  if (!formatted || CANONICAL_CANADIAN_PHONE.test(formatted)) {
    return null;
  }

  const nationalDigits = formatted.slice(2);
  if (nationalDigits.length !== 10) {
    return null;
  }

  const nextDigits = nationalDigits.split("");
  let changed = false;

  if (!/[2-9]/.test(nextDigits[0] || "")) {
    nextDigits[0] = "2";
    changed = true;
  }
  if (!/[2-9]/.test(nextDigits[3] || "")) {
    nextDigits[3] = "2";
    changed = true;
  }
  if (!changed) {
    return null;
  }

  const suggestion = `+1${nextDigits.join("")}`;
  return CANONICAL_CANADIAN_PHONE.test(suggestion) ? suggestion : null;
}

export function normalizeEmailInput(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function hasValidEmail(value: string): boolean {
  if (!value) {
    return false;
  }
  return EMAIL_PATTERN.test(value.trim());
}

export function isLikelyPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !PHONE_ALLOWED_CHARS.test(trimmed)) {
    return false;
  }
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

const CANONICAL_CANADIAN_PHONE = /^\+1\d{10}$/;
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

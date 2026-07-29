const KEY = "secureauth.mfa.verified";

export function markMfaVerified(userId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, userId);
}

export function isMfaVerified(userId: string) {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) === userId;
}

export function clearMfaVerified() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

export const passwordRules: PasswordRule[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "Upper and lowercase letters", test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: "At least one number", test: (v) => /\d/.test(v) },
  { label: "At least one symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
  { label: "No repeated runs (aaa, 111)", test: (v) => !/(.)\1\1/.test(v) },
];

export function passwordScore(value: string) {
  return passwordRules.filter((rule) => rule.test(value)).length;
}

// Pure helpers shared by the auth schemas, the phone mask and the password
// meter. Rules mirror PolisGo.Application/Auth/AuthValidation.cs — change
// both together.

/* ---------- Phone (Azerbaijan) ---------- */

export const AZ_COUNTRY_CODE = '994';
export const AZ_NATIONAL_LENGTH = 9;
// Display grouping for the national number: "50 123 45 67".
const GROUPS = [2, 3, 2, 2] as const;

// Extracts the 9-digit national number from anything a user might type or
// paste: "+994 50 123 45 67", "994501234567", "0501234567", "50-123-45-67".
export function toNationalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  const international = raw.trim().startsWith('+') || raw.trim().startsWith('00');
  if (raw.trim().startsWith('00')) digits = digits.slice(2);
  // A leading 994 is the country code when it's explicitly international or
  // too long to be a national number (national numbers may start with 99).
  if (digits.startsWith(AZ_COUNTRY_CODE) && (international || digits.length > AZ_NATIONAL_LENGTH)) {
    digits = digits.slice(AZ_COUNTRY_CODE.length);
  }
  // Domestic trunk prefix: 050 123 45 67.
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, AZ_NATIONAL_LENGTH);
}

export function formatAzPhone(national: string): string {
  if (national.length === 0) return '';
  const parts: string[] = [];
  let index = 0;
  for (const size of GROUPS) {
    const part = national.slice(index, index + size);
    if (!part) break;
    parts.push(part);
    index += size;
  }
  return `+${AZ_COUNTRY_CODE} ${parts.join(' ')}`;
}

export function isValidAzNational(national: string): boolean {
  return /^[1-9]\d{8}$/.test(national);
}

// E.164, the format the API stores: +994501234567.
export function toE164(raw: string): string | null {
  const national = toNationalDigits(raw);
  return isValidAzNational(national) ? `+${AZ_COUNTRY_CODE}${national}` : null;
}

/* ---------- Password ---------- */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64; // BCrypt only hashes the first 72 bytes.

export const PASSWORD_RULES = [
  { id: 'length', test: (p: string) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX },
  { id: 'lower', test: (p: string) => /\p{Ll}/u.test(p) },
  { id: 'upper', test: (p: string) => /\p{Lu}/u.test(p) },
  { id: 'digit', test: (p: string) => /\d/.test(p) },
] as const;

export type PasswordRuleId = (typeof PASSWORD_RULES)[number]['id'];

export function meetsPasswordPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

// 0 = empty. Policy compliance alone is "fair"; length and symbols push it up.
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return 0;
  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  if (met < PASSWORD_RULES.length) return 1;
  let score = 2;
  if (password.length >= 12) score++;
  if (/[^\p{L}\d]/u.test(password)) score++;
  return Math.min(score, 4) as PasswordStrength;
}

/* ---------- Names ---------- */

// Letters in any script (ə, ş, Cyrillic…), spaces, hyphens, apostrophes, dots.
export const FULL_NAME_PATTERN = /^[\p{L}][\p{L}\p{M}'’.\- ]*[\p{L}.]$/u;
export const FULL_NAME_MIN = 2;
export const FULL_NAME_MAX = 100;

/* ---------- Dates ---------- */

export const MIN_AGE = 18;
export const MAX_AGE = 100;

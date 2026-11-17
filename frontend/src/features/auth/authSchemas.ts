import { z } from 'zod';
import { addYears, isValidIsoDate, todayIso } from '../../lib/dates';
import {
  FULL_NAME_MAX,
  FULL_NAME_MIN,
  FULL_NAME_PATTERN,
  MAX_AGE,
  MIN_AGE,
  PASSWORD_MAX,
  PASSWORD_MIN,
  meetsPasswordPolicy,
  toE164,
} from './validation';

// Messages are i18n keys, translated where they render. The same rules run
// on the server (AuthValidation.cs); its 400s map back onto these fields.

// Strict enough for real use: one @, a dotted domain with a 2+ letter TLD.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

const email = z
  .string()
  .trim()
  .min(1, 'validation.emailRequired')
  .max(254, 'validation.email')
  .regex(EMAIL_PATTERN, 'validation.email')
  .pipe(z.email('validation.email'))
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email,
  // No strength rules here: accounts created under older rules must still sign in.
  password: z.string().min(1, 'validation.passwordRequired'),
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginValues = z.output<typeof loginSchema>;

const isoDate = (requiredKey: string) =>
  z.string().min(1, requiredKey).refine(isValidIsoDate, 'validation.date');

export function createRegisterSchema(today: string = todayIso()) {
  return (
    z
      .object({
        fullName: z
          .string()
          .trim()
          .min(1, 'validation.fullNameRequired')
          .min(FULL_NAME_MIN, 'validation.fullName')
          .max(FULL_NAME_MAX, 'validation.fullName')
          .regex(FULL_NAME_PATTERN, 'validation.fullName'),
        email,
        // The field holds the masked display value; submit sends E.164.
        phone: z
          .string()
          .min(1, 'validation.phoneRequired')
          .transform((value, ctx) => {
            const e164 = toE164(value);
            if (!e164) {
              ctx.addIssue({ code: 'custom', message: 'validation.phone' });
              return z.NEVER;
            }
            return e164;
          }),
        // Field-level so the age rule reports even while other fields are
        // invalid (object-level refinements are skipped in that case).
        birthDate: isoDate('validation.birthDateRequired').superRefine((value, ctx) => {
          if (value > today) {
            ctx.addIssue({ code: 'custom', message: 'validation.birthDatePast' });
          } else if (value > addYears(today, -MIN_AGE)) {
            ctx.addIssue({ code: 'custom', message: 'validation.adult' });
          } else if (value < addYears(today, -MAX_AGE)) {
            ctx.addIssue({ code: 'custom', message: 'validation.birthDateRange' });
          }
        }),
        drivingLicenseDate: isoDate('validation.licenceDateRequired').refine(
          (value) => value <= today,
          'validation.licenceFuture',
        ),
        password: z
          .string()
          .min(1, 'validation.passwordRequired')
          .min(PASSWORD_MIN, 'validation.password')
          .max(PASSWORD_MAX, 'validation.password')
          .refine(meetsPasswordPolicy, 'validation.password'),
        confirmPassword: z.string().min(1, 'validation.confirmPasswordRequired'),
      })
      // Cross-field rules with `when`: they run as soon as the fields they read
      // are valid, regardless of unrelated fields elsewhere in the form.
      .refine((v) => v.drivingLicenseDate >= addYears(v.birthDate, MIN_AGE), {
        path: ['drivingLicenseDate'],
        message: 'validation.licenceAfter18',
        when: (payload) => fieldsValid(payload, ['birthDate', 'drivingLicenseDate']),
      })
      .refine((v) => v.confirmPassword === v.password, {
        path: ['confirmPassword'],
        message: 'validation.passwordMismatch',
        when: (payload) => fieldsValid(payload, ['confirmPassword']),
      })
  );
}

// True when none of the given fields has an issue yet.
function fieldsValid(payload: z.core.ParsePayload, fields: readonly string[]): boolean {
  return !payload.issues.some((issue) => fields.includes(String(issue.path?.[0])));
}

export type RegisterSchema = ReturnType<typeof createRegisterSchema>;
export type RegisterInput = z.input<RegisterSchema>;
export type RegisterValues = z.output<RegisterSchema>;

// Bounds for the native date pickers, matching the schema.
export function birthDateBounds(today: string = todayIso()) {
  return { min: addYears(today, -MAX_AGE), max: addYears(today, -MIN_AGE) };
}

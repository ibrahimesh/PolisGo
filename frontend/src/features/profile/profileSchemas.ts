import { z } from 'zod';
import {
  FULL_NAME_MAX,
  FULL_NAME_MIN,
  FULL_NAME_PATTERN,
  meetsPasswordPolicy,
  PASSWORD_MAX,
  PASSWORD_MIN,
  toE164,
} from '../auth/validation';

// Same rules and messages as registration (authSchemas.ts), which mirror
// AuthValidation.cs; the server re-checks everything on PUT /api/me and
// POST /api/me/change-password.

const fullName = z
  .string()
  .trim()
  .min(1, 'validation.fullNameRequired')
  .min(FULL_NAME_MIN, 'validation.fullName')
  .max(FULL_NAME_MAX, 'validation.fullName')
  .regex(FULL_NAME_PATTERN, 'validation.fullName');

// The field holds the masked display value; submit sends E.164.
const phone = z
  .string()
  .min(1, 'validation.phoneRequired')
  .transform((value, ctx) => {
    const e164 = toE164(value);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'validation.phone' });
      return z.NEVER;
    }
    return e164;
  });

// Staff accounts have no phone on file, so the field only exists for Clients.
export function createProfileSchema(hasPhone: boolean) {
  return z.object({
    fullName,
    phone: hasPhone ? phone : z.literal('').transform(() => null),
  });
}
export type ProfileInput = z.input<ReturnType<typeof createProfileSchema>>;
export type ProfileValues = z.output<ReturnType<typeof createProfileSchema>>;

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'validation.currentPasswordRequired'),
    newPassword: z
      .string()
      .min(1, 'validation.passwordRequired')
      .min(PASSWORD_MIN, 'validation.password')
      .max(PASSWORD_MAX, 'validation.password')
      .refine(meetsPasswordPolicy, 'validation.password'),
    confirmPassword: z.string().min(1, 'validation.confirmPasswordRequired'),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'validation.passwordUnchanged',
    when: (payload) =>
      !payload.issues.some((i) => ['newPassword', 'currentPassword'].includes(String(i.path?.[0]))),
  })
  .refine((v) => v.confirmPassword === v.newPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
    when: (payload) => !payload.issues.some((i) => String(i.path?.[0]) === 'confirmPassword'),
  });
export type PasswordInput = z.input<typeof passwordSchema>;

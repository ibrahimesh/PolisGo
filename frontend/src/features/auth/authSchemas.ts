import { z } from 'zod';
import { addYears, isValidIsoDate, todayIso } from '../../lib/dates';

// Mirrors AuthService.ValidateRegister; messages are i18n keys.
const email = z.string().trim().pipe(z.email('validation.email'));
const strongPassword = z
  .string()
  .min(8, 'validation.password')
  .regex(/[A-Za-z]/, 'validation.password')
  .regex(/\d/, 'validation.password');
const isoDate = z.string().refine(isValidIsoDate, 'validation.date');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'validation.required'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export function createRegisterSchema(today: string = todayIso()) {
  return z
    .object({
      fullName: z.string().trim().min(1, 'validation.fullNameRequired'),
      email,
      phone: z.string().trim().min(1, 'validation.phoneRequired'),
      birthDate: isoDate,
      drivingLicenseDate: isoDate,
      password: strongPassword,
    })
    .superRefine((value, ctx) => {
      if (value.birthDate >= today) {
        ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'validation.birthDatePast' });
      }
      if (value.drivingLicenseDate < addYears(value.birthDate, 18)) {
        ctx.addIssue({
          code: 'custom',
          path: ['drivingLicenseDate'],
          message: 'validation.licenceAfter18',
        });
      }
    });
}
export type RegisterValues = z.infer<ReturnType<typeof createRegisterSchema>>;

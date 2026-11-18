import { z } from 'zod';
import { isValidIsoDate, todayIso } from '../../lib/dates';
import { addDays } from '../policies/policyDates';

// Mirrors PolicyValidation.cs (start date window, term range). The quote and
// create endpoints apply the same rules; their 400s map back onto these fields.
export const START_HORIZON_DAYS = 60;
export const TERMS = [1, 3, 6, 12] as const;

export function startDateBounds(today: string = todayIso()) {
  return { min: today, max: addDays(today, START_HORIZON_DAYS) };
}

export function createCoverSchema(today: string = todayIso()) {
  const { min, max } = startDateBounds(today);
  return z.object({
    // An untouched radio group reads as null: same message as empty.
    policyTypeCode: z
      .string({ error: 'validation.policyTypeRequired' })
      .min(1, 'validation.policyTypeRequired'),
    // One ordered check, so the field reports the first problem only.
    startDate: z.string().superRefine((value, ctx) => {
      const message = !value
        ? 'validation.startDateRequired'
        : !isValidIsoDate(value)
          ? 'validation.date'
          : value < min
            ? 'validation.startDatePast'
            : value > max
              ? 'validation.startDateTooFar'
              : null;
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
    termMonths: z.coerce
      .number({ error: 'validation.termRange' })
      .int('validation.termRange')
      .min(1, 'validation.termRange')
      .max(12, 'validation.termRange'),
  });
}

export type CoverInput = z.input<ReturnType<typeof createCoverSchema>>;
export type CoverValues = z.output<ReturnType<typeof createCoverSchema>>;

export const vehicleChoiceSchema = z.object({
  vehicleId: z.string({ error: 'validation.vehicleRequired' }).min(1, 'validation.vehicleRequired'),
});
export type VehicleChoice = z.infer<typeof vehicleChoiceSchema>;

export const reviewSchema = z.object({
  accept: z.boolean().refine((v) => v, 'validation.acceptRequired'),
});
export type ReviewValues = z.infer<typeof reviewSchema>;

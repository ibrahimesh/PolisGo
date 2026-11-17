import { z } from 'zod';
import { POLICY_TYPE_CODES } from '../../api/types';
import { addYears, isValidIsoDate, todayIso, yearsBetween } from '../../lib/dates';

// Mirrors PremiumCalculator.Validate so invalid input is caught before a
// request is sent. The API stays the authority: its 400s are still mapped
// onto these same fields. Messages are i18n keys, translated at render.

const isoDate = z.string().refine(isValidIsoDate, 'validation.date');

const wholeNumber = () => z.number({ error: 'validation.number' }).int('validation.integer');

export function createQuoteSchema(today: string = todayIso()) {
  const currentYear = Number(today.slice(0, 4));

  return z
    .object({
      policyTypeCode: z.enum(POLICY_TYPE_CODES),
      engineCapacityCc: wholeNumber()
        .min(1, 'validation.engineCapacityPositive')
        .max(10_000, 'validation.engineCapacityMax'),
      driverBirthDate: isoDate,
      drivingLicenseDate: isoDate,
      vehicleYear: wholeNumber()
        .min(1950, 'validation.vehicleYearMin')
        .max(currentYear, 'validation.vehicleYearFuture'),
      claimsInLast3Years: wholeNumber()
        .min(0, 'validation.claimsNonNegative')
        .max(20, 'validation.claimsMax'),
      termMonths: wholeNumber().min(1, 'validation.termRange').max(12, 'validation.termRange'),
    })
    .superRefine((value, ctx) => {
      if (yearsBetween(value.driverBirthDate, today) < 18) {
        ctx.addIssue({
          code: 'custom',
          path: ['driverBirthDate'],
          message: 'validation.driverMinAge',
        });
      }
      if (value.drivingLicenseDate > today) {
        ctx.addIssue({
          code: 'custom',
          path: ['drivingLicenseDate'],
          message: 'validation.licenceFuture',
        });
      } else if (value.drivingLicenseDate < addYears(value.driverBirthDate, 18)) {
        ctx.addIssue({
          code: 'custom',
          path: ['drivingLicenseDate'],
          message: 'validation.licenceAfter18',
        });
      }
    });
}

export type QuoteSchema = ReturnType<typeof createQuoteSchema>;
export type QuoteFormValues = z.input<QuoteSchema>;

// A typical Baku driver: mid-size engine, ten-plus years' experience.
export const DEFAULT_QUOTE: QuoteFormValues = {
  policyTypeCode: 'MTPL',
  engineCapacityCc: 1800,
  driverBirthDate: '1990-05-01',
  drivingLicenseDate: '2010-06-01',
  vehicleYear: 2018,
  claimsInLast3Years: 0,
  termMonths: 12,
};

export const QUOTE_FIELDS = Object.keys(DEFAULT_QUOTE) as (keyof QuoteFormValues)[];

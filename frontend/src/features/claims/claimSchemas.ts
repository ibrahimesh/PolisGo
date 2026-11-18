import { z } from 'zod';
import { INCIDENT_TYPES } from '../../api/types';
import { isValidIsoDate } from '../../lib/dates';
import { CLAIM_RULES } from './claimRules';

export const policyChoiceSchema = z.object({
  // An untouched radio group reads as null: same message as empty.
  policyId: z
    .string({ error: 'validation.claimPolicyRequired' })
    .min(1, 'validation.claimPolicyRequired'),
});
export type PolicyChoice = z.infer<typeof policyChoiceSchema>;

export interface IncidentBounds {
  // The policy's first and last covered day, and today (UTC, as the API).
  coverStart: string;
  coverEnd: string;
  today: string;
}

export function createIncidentSchema(bounds: IncidentBounds) {
  return z.object({
    // One ordered check, so the field reports the first problem only; the
    // order matches ClaimService (future first, then the cover period).
    incidentDate: z.string().superRefine((value, ctx) => {
      const message = !value
        ? 'validation.incidentDateRequired'
        : !isValidIsoDate(value)
          ? 'validation.date'
          : value > bounds.today
            ? 'validation.incidentInFuture'
            : value < bounds.coverStart || value > bounds.coverEnd
              ? 'validation.incidentOutsideCover'
              : null;
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
    // A select's empty value is '': the enum rejects it with our message.
    incidentType: z.enum(INCIDENT_TYPES, { error: 'validation.incidentTypeRequired' }),
    location: z
      .string()
      .trim()
      .min(CLAIM_RULES.minLocation, 'validation.locationLength')
      .max(CLAIM_RULES.maxLocation, 'validation.locationLength'),
    description: z
      .string()
      .trim()
      .min(CLAIM_RULES.minDescription, 'validation.descriptionLength')
      .max(CLAIM_RULES.maxDescription, 'validation.descriptionLength'),
  });
}

export type IncidentInput = z.input<ReturnType<typeof createIncidentSchema>>;
export type IncidentValues = z.output<ReturnType<typeof createIncidentSchema>>;

// Typed as text: the decimal check runs on what the user wrote, not on a
// float (0.29 * 100 is not 29 in binary floating point). Comma or point.
const AMOUNT = /^\d{1,7}([.,]\d{1,2})?$/;

export const damageSchema = z.object({
  claimedAmount: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const number = Number(value.replace(',', '.'));
      const message = !value
        ? 'validation.amountRequired'
        : !/^\d+([.,]\d+)?$/.test(value)
          ? 'validation.amountNumber'
          : !AMOUNT.test(value)
            ? number > CLAIM_RULES.maxAmount
              ? 'validation.amountTooHigh'
              : 'validation.amountPrecision'
            : number <= 0
              ? 'validation.amountPositive'
              : number > CLAIM_RULES.maxAmount
                ? 'validation.amountTooHigh'
                : null;
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
});
export type DamageValues = z.infer<typeof damageSchema>;

export function parseAmount(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

export const claimReviewSchema = z.object({
  accept: z.boolean().refine((v) => v, 'validation.claimAcceptRequired'),
});
export type ClaimReviewValues = z.infer<typeof claimReviewSchema>;

export const withdrawSchema = z.object({
  reason: z.string().trim().max(CLAIM_RULES.maxReason, 'validation.reasonTooLong'),
});
export type WithdrawValues = z.infer<typeof withdrawSchema>;

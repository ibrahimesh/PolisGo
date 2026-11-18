import { z } from 'zod';
import { isApiError } from '../../../api/errors';

// Mirrors the decision rules in ClaimService.cs: a rejection needs a reason
// (shown to the customer), an approval a positive amount with at most two
// decimals, up to the claimed amount; any note is at most 1000 characters.
// The API checks the same and its 400s map back onto these fields.
export const DECISION_RULES = { maxComment: 1000 } as const;

export const DECISION_OUTCOMES = ['approve', 'reject'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

// Typed as text so the decimal check runs on what was written. Comma or point.
const AMOUNT = /^\d{1,7}([.,]\d{1,2})?$/;

export function parseDecisionAmount(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

export function createDecisionSchema(claimedAmount: number) {
  return z
    .object({
      // A radio group's empty value is null; it is reported below, in the
      // object check, so the message stays translated.
      outcome: z.enum(DECISION_OUTCOMES).nullable(),
      approvedAmount: z.string(),
      comment: z.string().max(DECISION_RULES.maxComment, 'validation.commentTooLong'),
    })
    .superRefine((values, ctx) => {
      if (values.outcome === null) {
        ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'validation.decisionRequired' });
      }
      if (values.outcome === 'approve') {
        const text = values.approvedAmount.trim();
        const number = parseDecisionAmount(text);
        const message = !text
          ? 'validation.approvedAmountRequired'
          : !/^\d+([.,]\d+)?$/.test(text)
            ? 'validation.amountNumber'
            : !AMOUNT.test(text)
              ? 'validation.approvedAmountPrecision'
              : number <= 0
                ? 'validation.approvedAmountPositive'
                : number > claimedAmount
                  ? 'validation.approvedAmountAboveClaimed'
                  : null;
        if (message) ctx.addIssue({ code: 'custom', path: ['approvedAmount'], message });
      }
      if (values.outcome === 'reject' && !values.comment.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['comment'],
          message: 'validation.rejectionReasonRequired',
        });
      }
    });
}

export interface DecisionInput {
  outcome: DecisionOutcome | null;
  approvedAmount: string;
  comment: string;
}
export type DecisionValues = z.output<ReturnType<typeof createDecisionSchema>>;

// The draft lives above the decision panel so it survives a reload of the
// claim (after a conflict the form may re-render, or not be offered at all).
export type DecisionDraft = DecisionInput;

export const emptyDraft = (claimedAmount: number): DecisionDraft => ({
  outcome: null,
  approvedAmount: String(claimedAmount),
  comment: '',
});

// The API's 409 for a decision made on a version someone else has changed
// since (ExceptionHandlingMiddleware.ConcurrentUpdateTitle).
export const CONCURRENT_UPDATE_TITLE = 'Concurrent update';

export function isConcurrencyConflict(error: unknown): boolean {
  return (
    isApiError(error) && error.status === 409 && error.problem?.title === CONCURRENT_UPDATE_TITLE
  );
}

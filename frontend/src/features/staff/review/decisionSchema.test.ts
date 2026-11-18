import { ApiError } from '../../../api/errors';
import { createDecisionSchema, isConcurrencyConflict } from './decisionSchema';

const schema = createDecisionSchema(500);
const issues = (input: Record<string, unknown>) => {
  const result = schema.safeParse({
    outcome: 'approve',
    approvedAmount: '100',
    comment: '',
    ...input,
  });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
};

describe('decision form', () => {
  it('needs an outcome, in the user language', () => {
    expect(issues({ outcome: null })).toEqual({ outcome: 'validation.decisionRequired' });
  });

  it('accepts an approval up to the claimed amount, comma or point', () => {
    expect(issues({ approvedAmount: '500' })).toEqual({});
    expect(issues({ approvedAmount: '499,99' })).toEqual({});
    expect(issues({ approvedAmount: '0.01' })).toEqual({});
  });

  it.each([
    ['', 'validation.approvedAmountRequired'],
    ['abc', 'validation.amountNumber'],
    ['10.555', 'validation.approvedAmountPrecision'],
    ['0', 'validation.approvedAmountPositive'],
    ['500.01', 'validation.approvedAmountAboveClaimed'],
  ])('rejects the approved amount "%s"', (approvedAmount, message) => {
    expect(issues({ approvedAmount })).toEqual({ approvedAmount: message });
  });

  it('requires a reason to reject, and ignores the amount then', () => {
    expect(issues({ outcome: 'reject', approvedAmount: '', comment: '  ' })).toEqual({
      comment: 'validation.rejectionReasonRequired',
    });
    expect(issues({ outcome: 'reject', approvedAmount: 'x', comment: 'Not covered.' })).toEqual({});
  });

  it('caps the note at the history column length', () => {
    expect(issues({ comment: 'c'.repeat(1000) })).toEqual({});
    expect(issues({ comment: 'c'.repeat(1001) })).toEqual({ comment: 'validation.commentTooLong' });
  });
});

describe('concurrency conflicts', () => {
  it('are the 409 titled "Concurrent update", not every 409', () => {
    expect(isConcurrencyConflict(new ApiError('http', 409, { title: 'Concurrent update' }))).toBe(
      true,
    );
    expect(
      isConcurrencyConflict(new ApiError('http', 409, { title: 'Invalid state transition' })),
    ).toBe(false);
    expect(isConcurrencyConflict(new ApiError('http', 400, { title: 'Concurrent update' }))).toBe(
      false,
    );
    expect(isConcurrencyConflict(new Error('x'))).toBe(false);
  });
});

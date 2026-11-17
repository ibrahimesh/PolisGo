import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiError } from '../../api/errors';
import { fieldMessageKey } from '../../i18n/apiErrors';

// Binds ProblemDetails.errors to form fields. Returns true when at least one
// field was matched, so the caller can skip a generic banner.
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): boolean {
  if (!isApiError(error) || error.status !== 400) return false;
  let matched = false;
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const target = fields.find((f) => f.toLowerCase() === field.toLowerCase());
    if (target) {
      setError(target, { type: 'server', message: fieldMessageKey(messages) });
      matched = true;
    }
  }
  return matched;
}

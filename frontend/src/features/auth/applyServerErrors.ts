import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiError } from '../../api/errors';
import { fieldMessageKey } from '../../i18n/apiErrors';

// Binds ProblemDetails.errors to form fields. Returns the matched fields in
// form order (empty when none matched), so the caller can focus the first one
// or fall back to a generic banner.
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): Path<T>[] {
  if (!isApiError(error) || error.status !== 400) return [];
  const serverErrors = Object.entries(error.fieldErrors);
  const matched: Path<T>[] = [];
  for (const field of fields) {
    const entry = serverErrors.find(([key]) => key.toLowerCase() === field.toLowerCase());
    if (entry) {
      setError(field, { type: 'server', message: fieldMessageKey(entry[1]) });
      matched.push(field);
    }
  }
  return matched;
}

// Only same-origin paths are valid "return to" targets (no open redirects).
export function safeReturnPath(from: unknown, fallback = '/app'): string {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : fallback;
}

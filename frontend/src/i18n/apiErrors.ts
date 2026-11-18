import { isApiError } from '../api/errors';

// The API returns English validation messages. Map the known ones to i18n keys
// so users read them in their language; anything unknown falls back to a
// generic, still-translated message rather than leaking English.
const SERVER_MESSAGE_KEYS: Record<string, string> = {
  'Engine capacity must be greater than zero.': 'validation.engineCapacityPositive',
  'Vehicle year must not be in the future.': 'validation.vehicleYearFuture',
  'Vehicle year must be 1950 or later.': 'validation.vehicleYearMin',
  'Term must be between 1 and 12 months.': 'validation.termRange',
  'Claims count cannot be negative.': 'validation.claimsNonNegative',
  'Driver must be at least 18 years old.': 'validation.driverMinAge',
  'Driving licence date must not be in the future.': 'validation.licenceFuture',
  'Driving licence date must be after the driver turns 18.': 'validation.licenceAfter18',
  'Driving licence date must be after the customer turns 18.': 'validation.licenceAfter18',
  // Account rules — AuthValidation.Messages (a contract test keeps these in sync).
  'Email is required.': 'validation.emailRequired',
  'Email is not a valid address.': 'validation.email',
  'Password is required.': 'validation.passwordRequired',
  'Password must be 8-64 characters and include an uppercase letter, a lowercase letter and a digit.':
    'validation.password',
  'Full name is required.': 'validation.fullNameRequired',
  'Full name must be 2-100 letters; spaces, hyphens and apostrophes are allowed.':
    'validation.fullName',
  'Phone is required.': 'validation.phoneRequired',
  'Phone must be an Azerbaijani number: +994 followed by 9 digits.': 'validation.phone',
  'Birth date must be in the past.': 'validation.birthDatePast',
  'The customer must be at least 18 years old.': 'validation.adult',
  'Birth date must be within the last 100 years.': 'validation.birthDateRange',
  'A user with this email already exists.': 'errors.emailTaken',
  'Current password is required.': 'validation.currentPasswordRequired',
  'Current password is incorrect.': 'validation.currentPasswordIncorrect',
  'New password must be different from the current one.': 'validation.passwordUnchanged',
  'Staff accounts have no phone on file.': 'validation.phoneNotApplicable',
};

export function serverMessageKey(message: string | undefined): string | undefined {
  return message === undefined ? undefined : SERVER_MESSAGE_KEYS[message];
}

export function fieldMessageKey(messages: readonly string[] | undefined): string {
  return serverMessageKey(messages?.[0]) ?? 'validation.invalidField';
}

export interface DescribedError {
  messageKey: string;
  traceId: string | undefined;
}

// Status-specific overrides let a screen say something more precise, e.g. a
// 401 on the login form means "wrong password", not "session expired".
export type StatusOverrides = Partial<Record<number, string>>;

export function describeError(error: unknown, overrides: StatusOverrides = {}): DescribedError {
  if (!isApiError(error)) return { messageKey: 'errors.unknown', traceId: undefined };
  if (error.kind === 'network') return { messageKey: 'errors.network', traceId: undefined };

  const override = overrides[error.status];
  const fromDetail = serverMessageKey(error.problem?.detail);
  const byStatus =
    error.status >= 500 && error.status !== 503 ? 'errors.http.500' : `errors.http.${error.status}`;
  const known = [400, 401, 403, 404, 409, 429, 503].includes(error.status) || error.status >= 500;

  return {
    messageKey: override ?? fromDetail ?? (known ? byStatus : 'errors.unknown'),
    traceId: error.traceId,
  };
}

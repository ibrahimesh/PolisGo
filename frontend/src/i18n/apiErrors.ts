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
  // Vehicle rules — VehicleValidation.Messages (same contract test).
  'Make is required.': 'validation.makeRequired',
  'Make must be 64 characters or fewer.': 'validation.makeTooLong',
  'Model is required.': 'validation.modelRequired',
  'Model must be 64 characters or fewer.': 'validation.modelTooLong',
  'Plate number is required.': 'validation.plateRequired',
  'Plate number must be up to 16 letters, digits, spaces or hyphens.': 'validation.plateInvalid',
  'VIN is required.': 'validation.vinRequired',
  'VIN must be 17 characters: digits and letters except I, O and Q.': 'validation.vinInvalid',
  'Model year must be between 1950 and next year.': 'validation.vehicleYearRange',
  'Engine capacity must be 10000 cc or less.': 'validation.engineCapacityMax',
  // Purchase rules — PolicyValidation.Messages (same contract test).
  'Start date cannot be in the past.': 'validation.startDatePast',
  'Start date cannot be more than 60 days in the future.': 'validation.startDateTooFar',
  'Policy type is required.': 'validation.policyTypeRequired',
  'Vehicle is required.': 'validation.vehicleRequired',
  'Search must be at most 100 characters.': 'validation.searchTooLong',
  'An active or draft policy of this type already covers the vehicle in the chosen period.':
    'errors.policyOverlap',
  'The start date of this draft has passed. Start a new purchase to choose a new date.':
    'errors.draftStartPassed',
  'This policy has already expired.': 'errors.policyExpired',
  'A vehicle with this plate number is already registered.': 'errors.plateTaken',
};

export function serverMessageKey(message: string | undefined): string | undefined {
  return message === undefined ? undefined : SERVER_MESSAGE_KEYS[message];
}

export function fieldMessageKey(messages: readonly string[] | undefined): string {
  return serverMessageKey(messages?.[0]) ?? 'validation.invalidField';
}

// For a 400 whose fields aren't on the current screen (e.g. the quote
// rejecting a vehicle year while the user is choosing cover), the first
// field message says more than the generic "some details need attention".
export function firstFieldMessageKey(error: unknown): string | undefined {
  if (!isApiError(error) || error.status !== 400) return undefined;
  const first = Object.values(error.problem?.errors ?? {})[0];
  return first ? fieldMessageKey(first) : undefined;
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

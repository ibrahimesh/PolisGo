import { createRegisterSchema, loginSchema } from './authSchemas';
import { formatAzPhone, passwordStrength, toE164, toNationalDigits } from './validation';

const TODAY = '2026-11-18';

const valid = {
  fullName: 'Leyla Məmmədova',
  email: 'Leyla.M@Mail.az',
  phone: '+994 50 123 45 67',
  birthDate: '1990-05-01',
  drivingLicenseDate: '2010-06-01',
  password: 'Secret123',
  confirmPassword: 'Secret123',
};

function issues(input: Partial<typeof valid>) {
  const result = createRegisterSchema(TODAY).safeParse({ ...valid, ...input });
  if (result.success) return {};
  // First issue per field, which is what React Hook Form displays.
  const first: Record<string, string> = {};
  for (const issue of result.error.issues) first[issue.path.join('.')] ??= issue.message;
  return first;
}

describe('Azerbaijani phone', () => {
  it.each([
    ['+994 50 123 45 67', '501234567'],
    ['+994501234567', '501234567'],
    ['994501234567', '501234567'],
    ['00994 50 123 45 67', '501234567'],
    ['0501234567', '501234567'],
    ['050-123-45-67', '501234567'],
    ['(50) 123 45 67', '501234567'],
    ['501234567', '501234567'],
    // National numbers can start with 99 (an operator code), not the country code.
    ['994123456', '994123456'],
  ])('reads %s as national %s', (raw, national) => {
    expect(toNationalDigits(raw)).toBe(national);
  });

  it('formats as +994 XX XXX XX XX while typing', () => {
    expect(formatAzPhone('')).toBe('');
    expect(formatAzPhone('5')).toBe('+994 5');
    expect(formatAzPhone('50123')).toBe('+994 50 123');
    expect(formatAzPhone('501234567')).toBe('+994 50 123 45 67');
  });

  it('normalises to E.164 or rejects', () => {
    expect(toE164('050 123 45 67')).toBe('+994501234567');
    expect(toE164('+994 50 123 45')).toBeNull(); // too short
    expect(toE164('12')).toBeNull();
    expect(toE164('+994 012345678')).toBeNull(); // national can't start with 0
  });
});

describe('password strength', () => {
  it('is 0 when empty and 1 until every rule is met', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('password1')).toBe(1); // no uppercase
    expect(passwordStrength('PASSWORD1')).toBe(1); // no lowercase
  });

  it('rises with length and symbols once compliant', () => {
    expect(passwordStrength('Secret12')).toBe(2);
    expect(passwordStrength('Secret123456')).toBe(3);
    expect(passwordStrength('Secret-123456')).toBe(4);
  });
});

describe('register schema', () => {
  it('accepts a valid form and sends normalised values', () => {
    const result = createRegisterSchema(TODAY).parse(valid);
    expect(result.phone).toBe('+994501234567');
    expect(result.email).toBe('leyla.m@mail.az');
    expect(result.fullName).toBe('Leyla Məmmədova');
  });

  it.each([
    [{ email: 'abc@' }, 'email', 'validation.email'],
    [{ email: 'repro@polisgo' }, 'email', 'validation.email'], // no TLD
    [{ email: '' }, 'email', 'validation.emailRequired'],
    [{ phone: '1' }, 'phone', 'validation.phone'],
    [{ phone: '' }, 'phone', 'validation.phoneRequired'],
    [{ fullName: 'x' }, 'fullName', 'validation.fullName'],
    [{ fullName: 'R2D2 Droid' }, 'fullName', 'validation.fullName'],
    [{ password: 'Short1', confirmPassword: 'Short1' }, 'password', 'validation.password'],
    [{ password: 'password1', confirmPassword: 'password1' }, 'password', 'validation.password'],
    [{ confirmPassword: 'Secret124' }, 'confirmPassword', 'validation.passwordMismatch'],
    [{ birthDate: '2015-01-01' }, 'birthDate', 'validation.adult'],
    [{ birthDate: '2027-01-01' }, 'birthDate', 'validation.birthDatePast'],
    [
      { birthDate: '1900-01-01', drivingLicenseDate: '1950-01-01' },
      'birthDate',
      'validation.birthDateRange',
    ],
    [{ drivingLicenseDate: '2027-01-01' }, 'drivingLicenseDate', 'validation.licenceFuture'],
    [{ drivingLicenseDate: '2005-01-01' }, 'drivingLicenseDate', 'validation.licenceAfter18'],
  ])('rejects %o on %s', (input, field, message) => {
    expect(issues(input)[field]).toBe(message);
  });

  // Regression: the age rule used to live in an object-level refinement that
  // Zod skips while any field is invalid, so a 2015 birth date showed no error.
  it('reports age and licence errors even while unrelated fields are invalid', () => {
    const result = issues({
      password: 'abc',
      confirmPassword: '',
      phone: '12',
      birthDate: '2015-01-01',
      drivingLicenseDate: '2016-01-01',
    });
    expect(result.birthDate).toBe('validation.adult');
    expect(result.phone).toBe('validation.phone');
    expect(result.password).toBe('validation.password');
    // Measured against an invalid birth date, the licence rule waits: fixing
    // the birth date first is the only useful next step.
    expect(result.drivingLicenseDate).toBeUndefined();

    const licence = issues({ password: 'abc', phone: '12', drivingLicenseDate: '2005-01-01' });
    expect(licence.drivingLicenseDate).toBe('validation.licenceAfter18');
  });

  it('flags a mismatched confirmation even when the password itself is weak', () => {
    expect(issues({ password: 'abc', confirmPassword: 'abd' }).confirmPassword).toBe(
      'validation.passwordMismatch',
    );
  });

  it('accepts names in Azerbaijani and Cyrillic, with hyphens and apostrophes', () => {
    expect(issues({ fullName: 'Rəşad Əliyev-Qasımov' })).toEqual({});
    expect(issues({ fullName: 'Анна О’Нил' })).toEqual({});
  });
});

describe('login schema', () => {
  it('requires a well-formed email but not a strong password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.az', password: 'old' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.az', password: '' }).success).toBe(false);
  });
});

// Regression: a "required" check with abort:true on any field (e.g. an empty
// licence date) used to abort the whole object and hide the password mismatch.
it('reports a password mismatch while another field is still empty', () => {
  const result = createRegisterSchema(TODAY).safeParse({
    ...valid,
    drivingLicenseDate: '',
    password: 'abc',
    confirmPassword: 'abd',
  });
  expect(result.success).toBe(false);
  const messages = result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
  expect(messages).toContain('confirmPassword:validation.passwordMismatch');
  expect(messages).toContain('drivingLicenseDate:validation.licenceDateRequired');
});

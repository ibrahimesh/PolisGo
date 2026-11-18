import { createProfileSchema, passwordSchema } from './profileSchemas';

function errors(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]),
  );
}

describe('profile schema', () => {
  it('sends the masked phone as E.164 and trims the name', () => {
    expect(
      createProfileSchema(true).parse({ fullName: ' Nigar Əliyeva ', phone: '+994 55 987 65 43' }),
    ).toEqual({ fullName: 'Nigar Əliyeva', phone: '+994559876543' });
  });

  it('uses the registration messages', () => {
    expect(
      errors(createProfileSchema(true).safeParse({ fullName: 'x1', phone: '+994 12' })),
    ).toEqual({
      fullName: 'validation.fullName',
      phone: 'validation.phone',
    });
    expect(errors(createProfileSchema(true).safeParse({ fullName: 'Ab', phone: '' })).phone).toBe(
      'validation.phoneRequired',
    );
  });

  it('sends no phone for staff', () => {
    expect(createProfileSchema(false).parse({ fullName: 'Admin Person', phone: '' })).toEqual({
      fullName: 'Admin Person',
      phone: null,
    });
  });
});

describe('password schema', () => {
  const valid = {
    currentPassword: 'Secret123',
    newPassword: 'Better456x',
    confirmPassword: 'Better456x',
  };

  it('accepts a new compliant password', () => {
    expect(passwordSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    [{ currentPassword: '' }, 'currentPassword', 'validation.currentPasswordRequired'],
    [{ newPassword: 'short', confirmPassword: 'short' }, 'newPassword', 'validation.password'],
    [
      { newPassword: 'Secret123', confirmPassword: 'Secret123' },
      'newPassword',
      'validation.passwordUnchanged',
    ],
    [{ confirmPassword: 'Better456y' }, 'confirmPassword', 'validation.passwordMismatch'],
  ])('rejects %j', (patch, field, message) => {
    expect(errors(passwordSchema.safeParse({ ...valid, ...patch }))[field]).toBe(message);
  });
});

import {
  createStaffSchema,
  DEFAULT_STAFF_LIST,
  readStaffList,
  toStaffQuery,
  writeStaffList,
} from './staffSchema';

const issues = (input: Record<string, unknown>) => {
  const result = createStaffSchema.safeParse({
    fullName: 'Leyla Əliyeva',
    email: 'Leyla@PolisGo.az',
    password: 'Secret123',
    role: 'Agent',
    ...input,
  });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
};

describe('staff account form', () => {
  it('accepts a valid account and lower-cases the email', () => {
    const result = createStaffSchema.parse({
      fullName: 'Leyla Əliyeva',
      email: 'Leyla@PolisGo.az',
      password: 'Secret123',
      role: 'Admin',
    });
    expect(result.email).toBe('leyla@polisgo.az');
  });

  it('applies the registration rules, with translated messages', () => {
    expect(issues({ fullName: 'A', email: 'nope', password: 'weak', role: null })).toEqual({
      fullName: 'validation.fullName',
      email: 'validation.email',
      password: 'validation.password',
      role: 'validation.staffRoleRequired',
    });
    expect(issues({ role: 'Client' })).toEqual({ role: 'validation.staffRoleRequired' });
  });
});

describe('staff list URL state', () => {
  it('round-trips and drops unknown values', () => {
    const state = { search: 'Leyla', role: 'Agent', status: 'Inactive', page: 2 } as const;
    expect(readStaffList(writeStaffList(state))).toEqual(state);
    expect(readStaffList(new URLSearchParams('role=Client&status=Gone&page=x'))).toEqual(
      DEFAULT_STAFF_LIST,
    );
    expect(toStaffQuery(DEFAULT_STAFF_LIST)).toEqual({ status: 'All', page: 1, pageSize: 20 });
  });
});

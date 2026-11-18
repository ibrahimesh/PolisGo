import type { PolicyResponse } from '../../api/types';
import { checkFile, claimEligibility, incidentDateBounds } from './claimRules';
import { readClaimList, toClaimQuery, writeClaimList } from './claimListParams';
import { createIncidentSchema, damageSchema, withdrawSchema } from './claimSchemas';

const TODAY = '2026-11-18';

function policy(patch: Partial<PolicyResponse>): PolicyResponse {
  return {
    id: 'p1',
    policyNumber: 'PG-1',
    status: 'Active',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    policyTypeCode: 'MTPL',
    ...patch,
  } as PolicyResponse;
}

describe('claim eligibility', () => {
  it('accepts an active policy whose cover has started', () => {
    expect(claimEligibility(policy({}), TODAY)).toEqual({ eligible: true });
  });

  it.each([
    [{ status: 'Draft' as const }, 'unpaid'],
    [{ status: 'Expired' as const }, 'ended'],
    [{ status: 'Cancelled' as const }, 'cancelled'],
    [{ startDate: '2026-12-01' }, 'notStarted'],
  ])('gives a reason for %o', (patch, reason) => {
    expect(claimEligibility(policy(patch), TODAY)).toMatchObject({ eligible: false, reason });
  });
});

describe('incident step', () => {
  const schema = createIncidentSchema(
    incidentDateBounds({ startDate: '2026-06-01', endDate: '2027-05-31' }, TODAY),
  );
  const valid = {
    incidentDate: '2026-11-10',
    incidentType: 'Collision',
    location: 'Baku',
    description: 'Hit from behind at a red light.',
  };
  const messageFor = (patch: object) => {
    const result = schema.safeParse({ ...valid, ...patch });
    return result.success ? null : result.error.issues[0]?.message;
  };

  it('accepts a complete incident', () => {
    expect(messageFor({})).toBeNull();
  });

  it.each([
    [{ incidentDate: '' }, 'validation.incidentDateRequired'],
    [{ incidentDate: '2026-02-30' }, 'validation.date'],
    [{ incidentDate: '2026-11-19' }, 'validation.incidentInFuture'],
    [{ incidentDate: '2026-05-31' }, 'validation.incidentOutsideCover'],
    [{ incidentType: '' }, 'validation.incidentTypeRequired'],
    [{ incidentType: 'Meteor' }, 'validation.incidentTypeRequired'],
    [{ location: ' ab ' }, 'validation.locationLength'],
    [{ location: 'x'.repeat(201) }, 'validation.locationLength'],
    [{ description: 'too short' }, 'validation.descriptionLength'],
    [{ description: 'x'.repeat(2001) }, 'validation.descriptionLength'],
  ])('rejects %o with %s', (patch, message) => {
    expect(messageFor(patch)).toBe(message);
  });

  it('caps the date input at the end of an expired cover', () => {
    const bounds = incidentDateBounds({ startDate: '2025-01-01', endDate: '2025-12-31' }, TODAY);
    expect(bounds.max).toBe('2025-12-31');
  });
});

describe('damage step', () => {
  const messageFor = (claimedAmount: string) => {
    const result = damageSchema.safeParse({ claimedAmount });
    return result.success ? null : result.error.issues[0]?.message;
  };

  it.each(['850', '850.5', '0.29', '1234,56', '50000'])('accepts %s', (value) => {
    expect(messageFor(value)).toBeNull();
  });

  it.each([
    ['', 'validation.amountRequired'],
    ['abc', 'validation.amountNumber'],
    ['-5', 'validation.amountNumber'],
    ['0', 'validation.amountPositive'],
    ['100.555', 'validation.amountPrecision'],
    ['50000.01', 'validation.amountTooHigh'],
    ['99999999', 'validation.amountTooHigh'],
  ])('rejects %s with %s', (value, message) => {
    expect(messageFor(value)).toBe(message);
  });
});

describe('withdraw reason', () => {
  it('allows an empty reason and caps it at 500', () => {
    expect(withdrawSchema.safeParse({ reason: '' }).success).toBe(true);
    expect(withdrawSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('file checks', () => {
  const file = (name: string, bytes: number[], size?: number) => {
    const content = new Uint8Array(size ?? bytes.length);
    content.set(bytes);
    return new File([content], name);
  };
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  it('accepts a real PNG, JPEG and PDF', async () => {
    expect(await checkFile(file('a.png', PNG))).toBeNull();
    expect(await checkFile(file('a.JPG', [0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(await checkFile(file('a.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
  });

  it('rejects by name, size and content, in that order', async () => {
    expect(await checkFile(file('a.gif', PNG))).toBe('fileType');
    expect(await checkFile(file('noextension', PNG))).toBe('fileType');
    expect(await checkFile(new File([], 'a.png'))).toBe('fileEmpty');
    expect(await checkFile(file('a.png', PNG, 5 * 1024 * 1024 + 1))).toBe('fileTooLarge');
    expect(await checkFile(file('a.pdf', [0x4d, 0x5a, 0x90, 0]))).toBe('fileContent');
    expect(await checkFile(file('a.png', [0xff, 0xd8, 0xff]))).toBe('fileContent');
  });
});

describe('claims list URL', () => {
  it('maps "open" to the open flag and a status to status', () => {
    const open = toClaimQuery(readClaimList(new URLSearchParams('status=open')));
    expect(open).toMatchObject({ open: true });
    expect(open).not.toHaveProperty('status');
    expect(toClaimQuery(readClaimList(new URLSearchParams('status=Withdrawn')))).toMatchObject({
      status: 'Withdrawn',
    });
  });

  it('drops unknown values and round-trips known ones', () => {
    const state = readClaimList(new URLSearchParams('status=Nope&sort=x&page=-2&q=CL-2026'));
    expect(state).toEqual({ status: '', search: 'CL-2026', sort: 'newest', page: 1 });
    const back = readClaimList(
      writeClaimList({ status: 'Paid', search: 'x', sort: 'amountHigh', page: 3 }),
    );
    expect(back).toEqual({ status: 'Paid', search: 'x', sort: 'amountHigh', page: 3 });
    expect(toClaimQuery(back)).toMatchObject({ sortBy: 'ClaimedAmount', sortDir: 'Desc' });
  });
});

import { asReference, DEFAULT_ERRORS, readErrors, toErrorQuery, writeErrors } from './errorParams';

describe('error list URL state', () => {
  it('round-trips and drops what does not parse', () => {
    const state = {
      ...DEFAULT_ERRORS,
      q: '8F05E497',
      source: 'Frontend',
      status: 'New',
      regressed: true,
      sort: 'Count',
      page: 3,
    } as const;
    expect(readErrors(writeErrors(state))).toEqual(state);
    expect(
      readErrors(new URLSearchParams('source=Mars&status=Gone&sort=x&page=-2&regressed=yes')),
    ).toEqual(DEFAULT_ERRORS);
    expect(writeErrors(DEFAULT_ERRORS).toString()).toBe('');
  });

  it('sends only the filters that are set', () => {
    expect(toErrorQuery({ ...DEFAULT_ERRORS, q: '  ' })).toEqual({
      sort: 'LastSeen',
      page: 1,
      pageSize: 25,
    });
  });
});

describe('asReference', () => {
  it.each([
    ['8F05E497', '8F05E497'],
    ['8f05-e497', '8F05E497'],
    [' 8F05 E497 ', '8F05E497'],
    ['8f05e497f602ed095d0149881a2e0468', '8F05E497'],
    ['00-8f05e497f602ed095d0149881a2e0468-ce9bed5f785d5dd5-01', '8F05E497'],
  ])('%s → %s', (text, code) => {
    expect(asReference(text)).toBe(code);
  });

  it.each(['settings', '8F05E49', '8F05E49Z', 'policy PG-2026'])(
    '%s is not a reference',
    (text) => {
      expect(asReference(text)).toBeNull();
    },
  );
});

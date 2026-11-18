import {
  DEFAULT_STATE,
  hasFilters,
  pageCount,
  readListState,
  toQuery,
  writeListState,
} from './listParams';

describe('policy list URL state', () => {
  it('round-trips a filtered view through the URL', () => {
    const state = {
      status: 'Expired',
      type: 'CASCO',
      search: '10-AA',
      sort: 'endSoonest',
      page: 3,
    } as const;
    expect(readListState(writeListState(state))).toEqual(state);
  });

  it('keeps the default view out of the URL', () => {
    expect(writeListState(DEFAULT_STATE).toString()).toBe('');
  });

  it('falls back to defaults for anything it does not recognise', () => {
    const state = readListState(
      new URLSearchParams('status=Lost&sort=customer&page=-2&type=<script>'),
    );
    expect(state).toEqual(DEFAULT_STATE);
  });

  it('caps the search at the API limit', () => {
    expect(readListState(new URLSearchParams(`q=${'x'.repeat(150)}`)).search).toHaveLength(100);
  });

  it('maps the combined sort option to the API fields', () => {
    expect(toQuery({ ...DEFAULT_STATE, sort: 'premiumHigh', search: '  pg ' })).toEqual({
      search: 'pg',
      sortBy: 'Premium',
      sortDir: 'Desc',
      page: 1,
      pageSize: 10,
    });
  });

  it('knows when filters are applied and how many pages there are', () => {
    expect(hasFilters(DEFAULT_STATE)).toBe(false);
    expect(hasFilters({ ...DEFAULT_STATE, search: ' ' })).toBe(false);
    expect(hasFilters({ ...DEFAULT_STATE, type: 'MTPL' })).toBe(true);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(21)).toBe(3);
  });
});

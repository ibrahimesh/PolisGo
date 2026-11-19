import {
  ageInDays,
  DEFAULT_QUEUE,
  hasQueueFilters,
  needsAttention,
  readQueue,
  toQueueFilter,
  toQueueQuery,
  writeQueue,
} from './queueParams';

const read = (query: string) => readQueue(new URLSearchParams(query));

describe('claims queue URL state', () => {
  it('defaults to the waiting claims, oldest first', () => {
    expect(read('')).toEqual(DEFAULT_QUEUE);
    expect(writeQueue(DEFAULT_QUEUE).toString()).toBe('');
  });

  it('round-trips every non-default value', () => {
    const state = {
      view: 'all',
      status: 'Rejected',
      search: 'Əliyev',
      sort: 'amountHigh',
      page: 3,
      from: '2026-01-01',
      to: '2026-03-31',
    } as const;
    expect(read(writeQueue(state).toString())).toEqual(state);
  });

  it('filters by incident dates, never a reversed or broken range', () => {
    expect(toQueueQuery(read('from=2026-01-01&to=2026-01-31'))).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(read('from=2026-03-01&to=2026-01-01')).toMatchObject({ from: '', to: '' });
    expect(read('from=2026-02-31').from).toBe('');
    expect(hasQueueFilters(read('from=2026-01-01'))).toBe(true);
  });

  it('drops unknown or tampered values instead of sending them to the API', () => {
    expect(read('view=everything&status=Lost&sort=random&page=-2')).toEqual(DEFAULT_QUEUE);
    // A status only applies to the "all" view.
    expect(read('view=waiting&status=Paid').status).toBe('');
    expect(read(`q=${'x'.repeat(150)}`).search).toHaveLength(100);
  });

  it('turns each attention view into its API filter', () => {
    expect(toQueueQuery(read(''))).toMatchObject({
      status: 'Submitted',
      sortBy: 'CreatedAt',
      sortDir: 'Asc',
    });
    expect(toQueueQuery(read('view=mine'))).toMatchObject({
      status: 'UnderReview',
      assignedToMe: true,
    });
    expect(toQueueQuery(read('view=toPay'))).toMatchObject({ status: 'Approved' });
    expect(toQueueQuery(read('view=all')).status).toBeUndefined();
    expect(toQueueQuery(read('view=all&status=Paid'))).toMatchObject({ status: 'Paid' });
  });

  it('exports the same filters without paging', () => {
    const state = read('view=mine&q=CLM&sort=number&page=4');
    const filter = toQueueFilter(state);
    expect(filter).toEqual({
      status: 'UnderReview',
      assignedToMe: true,
      search: 'CLM',
      sortBy: 'ClaimNumber',
      sortDir: 'Asc',
    });
    expect(toQueueQuery(state)).toEqual({ ...filter, page: 4, pageSize: 20 });
  });

  it('counts only search and an explicit status as filters', () => {
    expect(hasQueueFilters(read('view=mine'))).toBe(false);
    expect(hasQueueFilters(read('q=x'))).toBe(true);
    expect(hasQueueFilters(read('view=all&status=Paid'))).toBe(true);
  });
});

describe('claim age', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('counts whole days', () => {
    expect(ageInDays('2026-11-18T08:00:00Z', now)).toBe(0);
    expect(ageInDays('2026-11-11T12:00:00Z', now)).toBe(7);
    expect(ageInDays('2026-11-19T12:00:00Z', now)).toBe(0);
  });

  it('flags open claims a week old, never closed ones', () => {
    expect(needsAttention({ status: 'Submitted', createdAt: '2026-11-11T12:00:00Z' }, now)).toBe(
      true,
    );
    expect(needsAttention({ status: 'UnderReview', createdAt: '2026-11-12T12:00:00Z' }, now)).toBe(
      false,
    );
    expect(needsAttention({ status: 'Paid', createdAt: '2026-01-01T00:00:00Z' }, now)).toBe(false);
  });
});

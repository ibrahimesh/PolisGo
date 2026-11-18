import { addDays, endDateFor, termMonths } from './policyDates';

describe('termMonths', () => {
  it.each([
    ['2026-11-18', '2027-11-17', 12],
    ['2026-11-18', '2026-12-17', 1],
    ['2026-07-01', '2026-12-31', 6],
    // AddMonths clamps: Jan 31 + 1 month = Feb 28, minus a day.
    ['2026-01-31', '2026-02-27', 1],
    ['2028-02-29', '2029-02-27', 12],
  ])('%s to %s is %i months', (start, end, months) => {
    expect(termMonths(start, end)).toBe(months);
  });
});

describe('addDays', () => {
  it('crosses month and year ends in UTC', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('endDateFor', () => {
  it.each([
    ['2026-11-18', 12, '2027-11-17'],
    ['2026-01-31', 1, '2026-02-27'],
    ['2028-02-29', 12, '2029-02-27'],
    ['2026-12-15', 3, '2027-03-14'],
  ])('%s + %i months ends %s, and termMonths reads it back', (start, months, end) => {
    expect(endDateFor(start, months)).toBe(end);
    expect(termMonths(start, end)).toBe(months);
  });
});

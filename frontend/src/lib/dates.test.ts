import { addDays } from '../features/policies/policyDates';
import { BUSINESS_TIME_ZONE, parseApiTime, todayIso, tomorrowIso } from './dates';

// Business dates are Baku dates on both sides (BusinessCalendar.cs): Baku is
// UTC+4 all year, so from 20:00 UTC it is already tomorrow there.
describe('business dates', () => {
  it('uses the Asia/Baku date, not the UTC one', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Baku');
    expect(todayIso(new Date('2026-03-01T19:59:00Z'))).toBe('2026-03-01');
    expect(todayIso(new Date('2026-03-01T20:00:00Z'))).toBe('2026-03-02');
    expect(todayIso(new Date('2026-12-31T21:30:00Z'))).toBe('2027-01-01');
  });

  it('starts cover tomorrow at the earliest', () => {
    const now = new Date('2026-03-01T21:30:00Z');
    expect(tomorrowIso(now)).toBe('2026-03-03');
    expect(tomorrowIso(now)).toBe(addDays(todayIso(now), 1));
  });
});

describe('parseApiTime', () => {
  it('reads a timestamp without an offset as UTC', () => {
    expect(parseApiTime('2026-11-24T13:13:00').toISOString()).toBe('2026-11-24T13:13:00.000Z');
    expect(parseApiTime('2026-11-24T13:13:00.1234567').toISOString()).toBe(
      '2026-11-24T13:13:00.123Z',
    );
  });

  it('keeps an explicit offset', () => {
    expect(parseApiTime('2026-11-24T13:13:00Z').toISOString()).toBe('2026-11-24T13:13:00.000Z');
    expect(parseApiTime('2026-11-24T17:13:00+04:00').toISOString()).toBe(
      '2026-11-24T13:13:00.000Z',
    );
  });
});

import { createNumberFormatter, formatDateTime, formatIsoDate } from './format';

const money = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

describe('createNumberFormatter', () => {
  it('uses CLDR Azerbaijani separators regardless of the ICU build', () => {
    expect(createNumberFormatter('az', money)(1234.5)).toBe('1.234,50');
    expect(createNumberFormatter('az', money)(49.16)).toBe('49,16');
  });

  it('formats English and Russian with Intl', () => {
    expect(createNumberFormatter('en', money)(1234.5)).toBe('1,234.50');
    // Russian groups with a narrow no-break space.
    expect(createNumberFormatter('ru', money)(1234.5)).toMatch(/^1\s234,50$/u);
  });
});

describe('formatIsoDate', () => {
  it('writes calendar dates without timezone drift', () => {
    expect(formatIsoDate('en', '2026-01-05')).toBe('5 Jan 2026');
    expect(formatIsoDate('ru', '2026-01-05')).toBe('05.01.2026');
    expect(formatIsoDate('az', '2026-12-31')).toBe('31.12.2026');
  });

  it('accepts a date-time and keeps only its date part', () => {
    expect(formatIsoDate('en', '2026-11-18T23:59:00Z')).toBe('18 Nov 2026');
  });
});

describe('formatDateTime', () => {
  it('adds the local time to the date', () => {
    expect(formatDateTime('ru', '2026-11-18T10:05:00')).toBe('18.11.2026, 10:05');
  });

  it('returns unparseable input unchanged', () => {
    expect(formatDateTime('en', 'not a date')).toBe('not a date');
  });
});

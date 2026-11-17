import { createNumberFormatter } from './format';

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

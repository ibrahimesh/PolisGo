import {
  addDaysIso,
  addMonthsIso,
  applyInput,
  clampIso,
  isoToDisplay,
  isWithin,
  maskDigits,
  monthGrid,
  parseDateText,
  valueForText,
  weekdayIndex,
} from './dateInput';

describe('date text', () => {
  it('shows ISO dates as DD.MM.YYYY', () => {
    expect(isoToDisplay('2025-03-04')).toBe('04.03.2025');
    expect(isoToDisplay('12.0')).toBe('12.0');
  });

  it('masks typed digits progressively, eight at most', () => {
    expect(maskDigits('1')).toBe('1');
    expect(maskDigits('140')).toBe('14.0');
    expect(maskDigits('14032025')).toBe('14.03.2025');
    expect(maskDigits('14a03b2025999')).toBe('14.03.2025');
  });

  it.each([
    ['2025-03-14', '2025-03-14'],
    ['2025-3-4', '2025-03-04'],
    ['14.03.2025', '2025-03-14'],
    ['14/03/2025', '2025-03-14'],
    ['4-3-2025', '2025-03-04'],
    [' 14.03.2025 ', '2025-03-14'],
  ])('reads a pasted "%s"', (text, iso) => {
    expect(parseDateText(text)).toBe(iso);
  });

  it('keeps impossible and incomplete dates visible to the schema', () => {
    expect(applyInput('31.02.2025')).toEqual({ display: '31.02.2025', value: '2025-02-31' });
    expect(applyInput('3102')).toEqual({ display: '31.02', value: '31.02' });
    expect(valueForText('')).toBe('');
    expect(parseDateText('yesterday')).toBeNull();
  });

  it('takes a full ISO date as typed or filled, not as digits', () => {
    expect(applyInput('1992-03-14')).toEqual({ display: '14.03.1992', value: '1992-03-14' });
  });
});

describe('calendar arithmetic', () => {
  it('moves by days and months across boundaries', () => {
    expect(addDaysIso('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDaysIso('2024-03-01', -1)).toBe('2024-02-29');
    expect(addMonthsIso('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsIso('2025-01-15', -1)).toBe('2024-12-15');
    expect(addMonthsIso('2025-11-30', 14)).toBe('2027-01-30');
  });

  it('lays a month out in Monday-first weeks', () => {
    // 1 March 2025 is a Saturday.
    expect(weekdayIndex('2025-03-01')).toBe(5);
    const weeks = monthGrid({ year: 2025, month: 3 });
    expect(weeks[0]).toEqual([null, null, null, null, null, '2025-03-01', '2025-03-02']);
    expect(weeks.at(-1)?.at(0)).toBe('2025-03-31');
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('checks and clamps against min and max', () => {
    expect(isWithin('2025-03-14', '2025-03-01', '2025-03-31')).toBe(true);
    expect(isWithin('2025-04-01', '2025-03-01', '2025-03-31')).toBe(false);
    expect(isWithin('2025-04-01')).toBe(true);
    expect(clampIso('2025-02-01', '2025-03-01', '2025-03-31')).toBe('2025-03-01');
    expect(clampIso('2025-05-01', '2025-03-01', '2025-03-31')).toBe('2025-03-31');
  });
});

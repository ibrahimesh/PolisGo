import { DEFAULT_RANGE, isValidCustomRange, readRange, toDates, writeRange } from './rangeParams';

const read = (query: string) => readRange(new URLSearchParams(query));

describe('dashboard range', () => {
  it('defaults to twelve months and keeps the URL short', () => {
    expect(read('')).toEqual(DEFAULT_RANGE);
    expect(writeRange(DEFAULT_RANGE).toString()).toBe('');
    expect(toDates(DEFAULT_RANGE, '2026-11-20')).toEqual({ from: '2025-12-01', to: '2026-11-20' });
  });

  it('reads presets and custom spans back from the URL', () => {
    expect(read('range=3m')).toEqual({ kind: 'preset', preset: '3m' });
    expect(toDates(read('range=3m'), '2026-11-20')).toEqual({
      from: '2026-09-01',
      to: '2026-11-20',
    });
    const custom = { kind: 'custom', from: '2026-01-01', to: '2026-03-31' } as const;
    expect(read(writeRange(custom).toString())).toEqual(custom);
  });

  it('falls back instead of sending the API a range it refuses', () => {
    expect(read('from=2026-03-01&to=2026-01-01')).toEqual(DEFAULT_RANGE);
    expect(read('from=2022-01-01&to=2026-01-01')).toEqual(DEFAULT_RANGE);
    expect(read('from=2026-02-31&to=2026-03-01')).toEqual(DEFAULT_RANGE);
    expect(read('range=forever')).toEqual(DEFAULT_RANGE);
    expect(isValidCustomRange('2024-01-01', '2026-01-01')).toBe(true);
  });
});

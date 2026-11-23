import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches a subsequence and reports the indexes to highlight', () => {
    expect(fuzzyMatch('cvg', 'Coverage')?.indexes).toEqual([0, 2, 6]);
    expect(fuzzyMatch('xyz', 'Coverage')).toBeNull();
  });

  it('ranks word starts and runs above scattered letters', () => {
    const coverage = fuzzyMatch('cov', 'Coverage')?.score ?? 0;
    const recovery = fuzzyMatch('cov', 'Recovery')?.score ?? 0;
    expect(coverage).toBeGreaterThan(recovery);
    const audit = fuzzyMatch('al', 'Audit log')?.indexes;
    expect(audit).toEqual([0, 6]);
  });

  it('ignores case, accents and the Azerbaijani letters', () => {
    expect(fuzzyMatch('azerb', 'Azərbaycanca')).not.toBeNull();
    expect(fuzzyMatch('sigorta', 'Sığorta hadisələri')).not.toBeNull();
    expect(fuzzyMatch('РУС', 'Русский')?.indexes).toEqual([0, 1, 2]);
  });

  it('treats an empty query as a match with nothing highlighted', () => {
    expect(fuzzyMatch('  ', 'Anything')).toEqual({ score: 0, indexes: [] });
  });
});

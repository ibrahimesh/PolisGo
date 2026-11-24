import { describe, expect, it } from 'vitest';
import { foldSearch } from './searchText';

// Mirrors tests/PolisGo.Tests/Admin/AuditSearchTests.Fold_ignores_case_…:
// the SPA and the API must fold the same way.
describe('foldSearch', () => {
  it.each([
    ['İbrahim Şirinov', 'ibrahim şirinov'],
    ['IBRAHIM', 'ibrahim'],
    ['ıbrahım', 'ibrahim'],
    ['i̇brahim', 'ibrahim'],
    ['MƏMMƏDOVA', 'məmmədova'],
    ['Фёдор  ЁЛКИН ', 'федор елкин'],
    ['ÇƏKİC ĞÖÜŞ', 'çəkic ğöüş'],
    ['  ', ''],
  ])('%s → %s', (text, folded) => {
    expect(foldSearch(text)).toBe(folded);
  });
});

import az from './locales/az.json';
import en from './locales/en.json';
import ru from './locales/ru.json';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function keys(tree: object, prefix = ''): Set<string> {
  const result = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      for (const nested of keys(value as object, path)) result.add(nested);
    } else {
      // Languages need different plural forms; compare the base key only.
      result.add(path.replace(PLURAL_SUFFIX, ''));
    }
  }
  return result;
}

describe('locales', () => {
  const reference = [...keys(en)].sort();

  it.each([
    ['ru', ru],
    ['az', az],
  ])('%s has exactly the same keys as en', (_, locale) => {
    expect([...keys(locale)].sort()).toEqual(reference);
  });

  it('renders Azerbaijani and Cyrillic letters as-is', () => {
    expect(az.language.az).toBe('Azərbaycanca');
    expect(JSON.stringify(az)).toMatch(/[əşçğıöü]/);
    expect(ru.nav.signIn).toBe('Войти');
  });
});

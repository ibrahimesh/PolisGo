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

// The System section's strings ship with its lazy chunks (systemI18n): the
// same rules hold there, and no key lives in both places.
describe('System section locales', async () => {
  const [sysEn, sysRu, sysAz] = await Promise.all([
    import('../features/admin/system/locales/en.json'),
    import('../features/admin/system/locales/ru.json'),
    import('../features/admin/system/locales/az.json'),
  ]);
  const reference = [...keys(sysEn.default)].sort();

  it.each([
    ['ru', sysRu.default],
    ['az', sysAz.default],
  ])('%s has exactly the same keys as en', (_, locale) => {
    expect([...keys(locale)].sort()).toEqual(reference);
  });

  it('shares no key with the main locale files', () => {
    const main = keys(en);
    expect(reference.filter((key) => main.has(key))).toEqual([]);
  });

  it('registers its strings when the section loads', async () => {
    const { default: i18n } = await import('./index');
    await import('../features/admin/system/systemI18n');
    expect(i18n.t('admin.system.title', { lng: 'az' })).toBe('Sistem');
    expect(i18n.t('admin.system.lookup.invalid', { lng: 'en' })).toMatch(/^Enter the 8 letters/);
  });
});

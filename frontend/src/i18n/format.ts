import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { INTL_LOCALE, isLanguage } from '.';
import type { Language } from '.';

// Chromium ships trimmed ICU data without Azerbaijani number symbols, so
// Intl silently formats "az" like English ("1,234.50"). CLDR's az rules use
// "." for grouping and "," for decimals; apply them explicitly so the result
// doesn't depend on which ICU build the browser has.
const SEPARATOR_OVERRIDES: Partial<Record<Language, { group: string; decimal: string }>> = {
  az: { group: '.', decimal: ',' },
};

export function createNumberFormatter(
  lang: Language,
  options: Intl.NumberFormatOptions,
): (value: number) => string {
  const override = SEPARATOR_OVERRIDES[lang];
  if (!override) {
    const format = new Intl.NumberFormat(INTL_LOCALE[lang], options);
    return (value) => format.format(value);
  }
  const base = new Intl.NumberFormat('en-US', options);
  return (value) =>
    base
      .formatToParts(value)
      .map((part) =>
        part.type === 'group'
          ? override.group
          : part.type === 'decimal'
            ? override.decimal
            : part.value,
      )
      .join('');
}

export function useFormatters() {
  const { i18n } = useTranslation();
  const lang: Language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';

  return useMemo(() => {
    const amount = createNumberFormatter(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Factors keep up to 4 decimals so term factors like 0.9167 stay honest.
    const factor = createNumberFormatter(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return {
      amount,
      factor: (value: number) => `×${factor(value)}`,
      factorPlain: factor,
    };
  }, [lang]);
}

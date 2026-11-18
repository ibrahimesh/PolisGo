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

// Dates are formatted without Intl month names: trimmed ICU builds lack
// Azerbaijani (and some Russian genitive) month data and fall back to English.
// RU and AZ conventionally write 18.11.2026; English gets "18 Nov 2026".
const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// "YYYY-MM-DD" (C# DateOnly) is a calendar date: read it as-is, never through
// Date, so no timezone can shift it by a day.
export function formatIsoDate(lang: Language, isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number) as [number, number, number];
  return lang === 'en' ? `${d} ${EN_MONTHS[m - 1] ?? ''} ${y}` : `${pad(d)}.${pad(m)}.${y}`;
}

// ISO date-time (C# DateTime, UTC): shown in the viewer's local time.
export function formatDateTime(lang: Language, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${formatIsoDate(lang, day)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    const integer = createNumberFormatter(lang, { maximumFractionDigits: 0 });
    return {
      amount,
      // Money always carries its currency; the API only speaks AZN today.
      money: (value: number, currency = 'AZN') => `${amount(value)} ${currency}`,
      integer,
      factor: (value: number) => `×${factor(value)}`,
      factorPlain: factor,
      date: (isoDate: string) => formatIsoDate(lang, isoDate),
      dateTime: (iso: string) => formatDateTime(lang, iso),
    };
  }, [lang]);
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { INTL_LOCALE, isLanguage } from '.';

export function useFormatters() {
  const { i18n } = useTranslation();
  const lang = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  const locale = INTL_LOCALE[lang];

  return useMemo(() => {
    const amount = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Factors keep up to 4 decimals so term factors like 0.9167 stay honest.
    const factor = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return {
      amount: (value: number) => amount.format(value),
      factor: (value: number) => `×${factor.format(value)}`,
      factorPlain: (value: number) => factor.format(value),
    };
  }, [locale]);
}

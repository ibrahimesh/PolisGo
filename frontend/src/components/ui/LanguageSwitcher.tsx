import { useTranslation } from 'react-i18next';
import { currentLanguage, LANGUAGES } from '../../i18n';
import type { Language } from '../../i18n';
import { SegmentedControl } from './SegmentedControl';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <SegmentedControl<Language>
      legend={t('language.label')}
      value={currentLanguage()}
      onChange={(lng) => void i18n.changeLanguage(lng)}
      segments={LANGUAGES.map((lng) => ({
        value: lng,
        // Each language names itself, in its own language, for screen readers.
        label: <span className="label-mono">{lng}</span>,
        ariaLabel: t(`language.${lng}`),
        lang: lng,
      }))}
    />
  );
}

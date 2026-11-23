import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceChips } from '../components/ui/ChoiceChips';
import { MoonIcon, SunIcon, SystemIcon } from '../components/ui/icons';
import { currentLanguage, LANGUAGES } from '../i18n';
import type { Language } from '../i18n';
import { usePrefersReducedMotion } from '../lib/hooks';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemePreference } from '../theme/ThemeProvider';
import { setMotionPreference, systemPrefersReducedMotion, useMotionPreference } from './motion';

const THEME_ICONS = { dark: MoonIcon, light: SunIcon, system: SystemIcon } as const;
const THEME_ORDER: readonly ThemePreference[] = ['light', 'dark', 'system'];

// Appearance, language and motion: the one set of controls behind the
// Settings dialog and the profile page. State lives in the theme provider,
// i18next and the motion store, so every place shows the same choice.
export function SettingsFields() {
  const { t, i18n } = useTranslation();
  const { preference, setPreference } = useTheme();
  const motion = useMotionPreference();
  // Re-render when the OS setting changes, to show or hide the note.
  usePrefersReducedMotion();
  const motionId = useId();
  const systemReduces = systemPrefersReducedMotion();

  return (
    <div className="space-y-8">
      <ChoiceChips<ThemePreference>
        legend={t('settings.appearance')}
        value={preference}
        onChange={setPreference}
        choices={THEME_ORDER.map((theme) => {
          const Icon = THEME_ICONS[theme];
          return {
            value: theme,
            label: (
              <>
                <Icon />
                {t(`theme.${theme}`)}
              </>
            ),
          };
        })}
      />

      <ChoiceChips<Language>
        legend={t('settings.language')}
        value={currentLanguage()}
        onChange={(lng) => void i18n.changeLanguage(lng)}
        // Each language names itself, in its own language.
        choices={LANGUAGES.map((lng) => ({ value: lng, label: t(`language.${lng}`), lang: lng }))}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('settings.motion')}</p>
        <div className="flex items-start gap-3 rounded-sm border border-line-strong px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
          <input
            id={motionId}
            type="checkbox"
            checked={motion === 'reduce'}
            onChange={(event) => setMotionPreference(event.target.checked ? 'reduce' : 'system')}
            aria-describedby={`${motionId}-hint`}
            className="mt-1 size-4 shrink-0 accent-[var(--pg-accent)] focus-visible:outline-none"
          />
          <div className="space-y-1">
            <label htmlFor={motionId} className="block cursor-pointer text-text">
              {t('settings.reduceMotion')}
            </label>
            <p id={`${motionId}-hint`} className="text-sm text-muted">
              {systemReduces ? t('settings.systemReduces') : t('settings.reduceMotionHint')}
            </p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted">{t('settings.savedOnDevice')}</p>
    </div>
  );
}

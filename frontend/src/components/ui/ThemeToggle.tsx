import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemePreference } from '../../theme/ThemeProvider';
import { MoonIcon, SunIcon, SystemIcon } from './icons';
import { SegmentedControl } from './SegmentedControl';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <SegmentedControl<ThemePreference>
      legend={t('theme.label')}
      value={preference}
      onChange={setPreference}
      segments={[
        { value: 'dark', label: <MoonIcon />, ariaLabel: t('theme.dark') },
        { value: 'light', label: <SunIcon />, ariaLabel: t('theme.light') },
        { value: 'system', label: <SystemIcon />, ariaLabel: t('theme.system') },
      ]}
    />
  );
}

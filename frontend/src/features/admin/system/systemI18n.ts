import i18n from '../../../i18n';
import az from './locales/az.json';
import en from './locales/en.json';
import ru from './locales/ru.json';

// The System section's strings (admin.system.*) travel with its lazy chunks,
// not with the locale files every page loads up front: only an admin opening
// the section needs them, and the landing page must not carry them. Every
// module here that renders text imports this file; it registers once.
for (const [lang, bundle] of [
  ['en', en],
  ['ru', ru],
  ['az', az],
] as const) {
  i18n.addResourceBundle(lang, 'translation', bundle, true, false);
}

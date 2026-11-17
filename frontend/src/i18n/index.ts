import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import az from './locales/az.json';
import en from './locales/en.json';
import ru from './locales/ru.json';

export const LANGUAGES = ['en', 'ru', 'az'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'polisgo.lang';

// BCP 47 tags for Intl formatting; Azerbaijani is written in Latin script.
export const INTL_LOCALE: Record<Language, string> = {
  en: 'en-GB',
  ru: 'ru-RU',
  az: 'az-Latn-AZ',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  const browser = navigator.language.slice(0, 2).toLowerCase();
  return isLanguage(browser) ? browser : 'en';
}

export function currentLanguage(): Language {
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Non-fatal: the choice just won't survive a reload.
  }
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, az: { translation: az } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
  // Resources are bundled, so init synchronously and avoid a first render with raw keys.
  initAsync: false,
});

document.documentElement.lang = currentLanguage();

export default i18n;

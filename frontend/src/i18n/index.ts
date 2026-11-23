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

// A returning visitor gets their choice; a first visit takes the first of
// the browser's languages we speak (az, ru, en), else English. Either way
// it is remembered on this device by the languageChanged handler below.
export function detectLanguage(
  stored: string | null,
  browserLanguages: readonly string[],
): Language {
  if (isLanguage(stored)) return stored;
  for (const tag of browserLanguages) {
    const base = tag.slice(0, 2).toLowerCase();
    if (isLanguage(base)) return base;
  }
  return 'en';
}

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Storage blocked: fall back to the browser languages.
  }
}

function browserLanguages(): readonly string[] {
  return navigator.languages.length ? navigator.languages : [navigator.language];
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
  lng: detectLanguage(storedLanguage(), browserLanguages()),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
  // Resources are bundled, so init synchronously and avoid a first render with raw keys.
  initAsync: false,
});

document.documentElement.lang = currentLanguage();
// Remember the first-visit pick too (init doesn't always emit languageChanged).
try {
  localStorage.setItem(STORAGE_KEY, currentLanguage());
} catch {
  // Non-fatal.
}

export default i18n;

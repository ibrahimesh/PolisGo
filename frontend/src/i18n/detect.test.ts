import { describe, expect, it } from 'vitest';
import { detectLanguage } from '.';

describe('detectLanguage', () => {
  it('keeps a stored choice over the browser', () => {
    expect(detectLanguage('ru', ['az-AZ', 'en'])).toBe('ru');
  });

  it('takes the first browser language PolisGo speaks on a first visit', () => {
    expect(detectLanguage(null, ['de-DE', 'az-Latn-AZ', 'ru'])).toBe('az');
    expect(detectLanguage(null, ['RU-ru'])).toBe('ru');
  });

  it('ignores a stored value that is not a language and falls back to English', () => {
    expect(detectLanguage('fr', ['de', 'fr'])).toBe('en');
  });
});

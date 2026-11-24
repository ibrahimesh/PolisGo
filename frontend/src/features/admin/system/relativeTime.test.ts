import i18n from '../../../i18n';
import { relativeTime, uptime } from './relativeTime';

describe('relativeTime', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('reads in minutes, hours and days', () => {
    expect(relativeTime(ago(20_000), now, i18n.t)).toBe('just now');
    expect(relativeTime(ago(5 * 60_000), now, i18n.t)).toBe('5 min ago');
    expect(relativeTime(ago(3 * 3_600_000), now, i18n.t)).toBe('3 h ago');
    expect(relativeTime(ago(2 * 86_400_000), now, i18n.t)).toBe('2 days ago');
  });

  it('uses Russian plural forms', async () => {
    await i18n.changeLanguage('ru');
    expect(relativeTime(ago(5 * 86_400_000), now, i18n.t)).toBe('5 дней назад');
    expect(relativeTime(ago(2 * 86_400_000), now, i18n.t)).toBe('2 дня назад');
  });

  it('formats uptime', () => {
    expect(uptime(7 * 60, i18n.t)).toBe('7 min');
    expect(uptime(5 * 3600 + 12 * 60, i18n.t)).toBe('5 h 12 min');
    expect(uptime(3 * 86400 + 4 * 3600, i18n.t)).toBe('3 d 4 h');
  });
});

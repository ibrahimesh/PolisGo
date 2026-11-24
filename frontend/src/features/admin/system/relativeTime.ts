import './systemI18n';
import type { TFunction } from 'i18next';
import { parseApiTime } from '../../../lib/dates';

// "just now", "5 min ago", "3 h ago", "2 days ago": beside an absolute time,
// never instead of it (the absolute one is the record).
export function relativeTime(iso: string, now: number, t: TFunction): string {
  const minutes = Math.floor((now - parseApiTime(iso).getTime()) / 60_000);
  if (minutes < 1) return t('admin.system.relative.justNow');
  if (minutes < 60) return t('admin.system.relative.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('admin.system.relative.hours', { count: hours });
  return t('admin.system.relative.days', { count: Math.floor(hours / 24) });
}

// "3 d 4 h", "5 h 12 min", "7 min".
export function uptime(seconds: number, t: TFunction): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return t('admin.system.health.uptimeDays', { days, hours: hours % 24 });
  if (hours > 0) return t('admin.system.health.uptimeHours', { hours, minutes: minutes % 60 });
  return t('admin.system.health.uptimeMinutes', { minutes });
}

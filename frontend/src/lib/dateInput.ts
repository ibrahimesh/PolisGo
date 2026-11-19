import { isValidIsoDate } from './dates';

// The DateField's text side. The field shows DD.MM.YYYY whatever the browser
// language; the form value is the ISO date the API takes ("YYYY-MM-DD"), or,
// while a date is incomplete or impossible, the text as typed, which the
// form's schema then reports as an invalid date.

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
// Day first with any common separator: 14.03.2025, 14/03/2025, 14-03-2025.
const DAY_FIRST = /^(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{4})$/;

const pad = (n: number | string, size = 2) => String(n).padStart(size, '0');

export function isoToDisplay(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${pad(m[3] ?? '')}.${pad(m[2] ?? '')}.${m[1] ?? ''}` : iso;
}

// A complete date written in a known format (typed, pasted or filled by a
// test), as ISO. Impossible dates come back too ("2025-02-31"): the schema
// says why they are wrong, the field doesn't silently drop them.
export function parseDateText(text: string): string | null {
  const trimmed = text.trim();
  const iso = ISO.exec(trimmed);
  if (iso) return `${iso[1] ?? ''}-${pad(iso[2] ?? '')}-${pad(iso[3] ?? '')}`;
  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst) return `${dayFirst[3] ?? ''}-${pad(dayFirst[2] ?? '')}-${pad(dayFirst[1] ?? '')}`;
  return null;
}

// Typing: keep the digits (eight at most) and insert the dots as they go.
export function maskDigits(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

// What the form receives for what is in the box.
export function valueForText(display: string): string {
  if (!display.trim()) return '';
  return parseDateText(display) ?? display;
}

// One keystroke or paste: a full date in any known format is taken as is,
// anything else goes through the mask.
export function applyInput(raw: string): { display: string; value: string } {
  const parsed = parseDateText(raw);
  if (parsed) return { display: isoToDisplay(parsed), value: parsed };
  const display = maskDigits(raw);
  return { display, value: valueForText(display) };
}

/* ---------- Calendar arithmetic, on ISO strings (no timezone drift) ---------- */

export interface YearMonth {
  year: number;
  // 1-12
  month: number;
}

export function toYearMonth(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function isoOf(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same day in another month, clamped to that month's length (31 Jan + 1 → 28/29 Feb).
export function addMonthsIso(iso: string, months: number): string {
  const { year, month } = toYearMonth(iso);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return isoOf(y, m, Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m)));
}

// Monday = 0 … Sunday = 6, as calendars are read in AZ and RU.
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// The month as weeks of seven days, null where the month hasn't started or
// has ended.
export function monthGrid({ year, month }: YearMonth): (string | null)[][] {
  const first = isoOf(year, month, 1);
  const cells: (string | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let day = 1; day <= daysInMonth(year, month); day++) cells.push(isoOf(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function isWithin(iso: string, min?: string, max?: string): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}

export function clampIso(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export const isCompleteIso = (value: string) => isValidIsoDate(value);

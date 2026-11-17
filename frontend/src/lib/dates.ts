// Dates travel as "YYYY-MM-DD" strings (C# DateOnly). Working on the string
// form avoids timezone drift that Date objects introduce around midnight.

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The API prices "as of" UTC today (DateOnly.FromDateTime(DateTime.UtcNow)).
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Same rule as the API's YearsBetween: full years, minus one if the
// anniversary hasn't happened yet this year.
export function yearsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years--;
  return years;
}

export function addYears(date: string, years: number): string {
  const [y, rest] = [Number(date.slice(0, 4)), date.slice(4)];
  return `${String(y + years).padStart(4, '0')}${rest}`;
}

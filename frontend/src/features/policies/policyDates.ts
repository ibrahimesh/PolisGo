// Policies run from startDate to endDate inclusive, where
// endDate = startDate.AddMonths(N) - 1 day (PolicyService). Recover N: the
// day after the end is N calendar months after the start. AddMonths clamps
// (Jan 31 + 1 month = Feb 28), which only moves the day, never the month.
export function termMonths(startDate: string, endDate: string): number {
  const [sy, sm] = startDate.split('-').map(Number) as [number, number];
  const [ey, em] = addDays(endDate, 1).split('-').map(Number) as [number, number];
  return Math.max((ey - sy) * 12 + (em - sm), 1);
}

// "YYYY-MM-DD" n days after the given date, without timezone drift.
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Same rule as PolicyService: start.AddMonths(n) - 1 day, where AddMonths
// clamps to the month's last day (Jan 31 + 1 month = Feb 28).
export function endDateFor(startDate: string, months: number): string {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return addDays(target.toISOString().slice(0, 10), -1);
}

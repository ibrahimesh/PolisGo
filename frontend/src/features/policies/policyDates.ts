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

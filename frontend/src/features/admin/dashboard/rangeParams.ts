import { addMonthsIso, isCompleteIso } from '../../../lib/dateInput';
import { todayIso } from '../../../lib/dates';

// The dashboard's period lives in the URL: a preset (?range=6m) or a custom
// span (?from=…&to=…). Anything the API would refuse (reversed, longer than
// 24 months, not a date) falls back to the default twelve months.

export const RANGE_PRESETS = ['3m', '6m', '12m', '24m'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const MAX_RANGE_MONTHS = 24;

export type RangeState =
  { kind: 'preset'; preset: RangePreset } | { kind: 'custom'; from: string; to: string };

export const DEFAULT_RANGE: RangeState = { kind: 'preset', preset: '12m' };

const firstOfMonth = (iso: string) => `${iso.slice(0, 8)}01`;

export function isValidCustomRange(from: string, to: string): boolean {
  return (
    isCompleteIso(from) &&
    isCompleteIso(to) &&
    from <= to &&
    from >= addMonthsIso(to, -MAX_RANGE_MONTHS)
  );
}

export function readRange(params: URLSearchParams): RangeState {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (from && to && isValidCustomRange(from, to)) return { kind: 'custom', from, to };
  const preset = params.get('range') ?? '';
  return (RANGE_PRESETS as readonly string[]).includes(preset)
    ? { kind: 'preset', preset: preset as RangePreset }
    : DEFAULT_RANGE;
}

export function writeRange(state: RangeState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.kind === 'custom') {
    params.set('from', state.from);
    params.set('to', state.to);
  } else if (state.preset !== '12m') {
    params.set('range', state.preset);
  }
  return params;
}

// A preset of n months: this month and the n - 1 before it, to today.
export function toDates(
  state: RangeState,
  today: string = todayIso(),
): { from: string; to: string } {
  if (state.kind === 'custom') return { from: state.from, to: state.to };
  const months = Number.parseInt(state.preset, 10);
  return { from: addMonthsIso(firstOfMonth(today), -(months - 1)), to: today };
}

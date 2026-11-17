import type { PremiumBreakdown } from '../../api/types';

export const FACTOR_KEYS = [
  'engineFactor',
  'driverAgeFactor',
  'experienceFactor',
  'vehicleAgeFactor',
  'bonusMalusFactor',
  'termFactor',
] as const satisfies readonly (keyof PremiumBreakdown)[];

export type FactorKey = (typeof FACTOR_KEYS)[number];

// Same bounds as Tariff.MinRiskProduct / MaxRiskProduct. Used only to explain
// a result the API already capped — never to compute a price.
const MIN_RISK = 0.5;
const MAX_RISK = 3;

export interface RiskCap {
  raw: number;
  capped: number;
}

export function detectRiskCap(b: PremiumBreakdown): RiskCap | null {
  const raw =
    b.engineFactor *
    b.driverAgeFactor *
    b.experienceFactor *
    b.vehicleAgeFactor *
    b.bonusMalusFactor;
  if (raw < MIN_RISK) return { raw, capped: MIN_RISK };
  if (raw > MAX_RISK) return { raw, capped: MAX_RISK };
  return null;
}

export type Effect = 'raises' | 'lowers' | 'neutral';

export function effectOf(factor: number): Effect {
  if (Math.abs(factor - 1) < 1e-9) return 'neutral';
  return factor > 1 ? 'raises' : 'lowers';
}

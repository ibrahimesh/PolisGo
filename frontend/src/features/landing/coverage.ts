// Product copy for the comparison table, keyed by the API's policy type code.
// The API owns which products exist and their rates; what each one covers is
// marketing content that needs translating, so it lives here. A product the
// API adds later still gets a column (with its base rate) and shows its own
// cover once a row set is added for its code.

export const COVERAGE_ROWS = [
  'thirdPartyProperty',
  'thirdPartyInjury',
  'ownDamage',
  'theft',
  'natural',
  'glass',
] as const;

export type CoverageRow = (typeof COVERAGE_ROWS)[number];

export const COVERAGE_BY_CODE: Partial<
  Record<string, { mandatory: boolean; covers: readonly CoverageRow[] }>
> = {
  // Compulsory motor third-party liability.
  MTPL: { mandatory: true, covers: ['thirdPartyProperty', 'thirdPartyInjury'] },
  // Voluntary own-damage cover.
  CASCO: { mandatory: false, covers: ['ownDamage', 'theft', 'natural', 'glass'] },
};

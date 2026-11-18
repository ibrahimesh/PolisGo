import { z } from 'zod';
import { todayIso } from '../../lib/dates';

// Mirrors PolisGo.Application/Vehicles/VehicleValidation.cs for instant
// feedback; the API stays the authority and its 400s map onto these fields.
// Messages are i18n keys. Change both sides together.

export const MAKE_MAX = 64;
export const MODEL_MAX = 64;
export const PLATE_MAX = 16;
export const MIN_YEAR = 1950;
export const MAX_ENGINE_CC = 10_000;

// Letters and digits, single spaces or hyphens between groups: 10-AA-123.
const PLATE_PATTERN = /^[A-Z0-9]+([ -][A-Z0-9]+)*$/;
// ISO 3779: 17 characters, no I, O or Q.
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

// Inputs hold strings; empty or non-numeric becomes NaN, reported with the
// field's own message rather than a generic "expected number".
const wholeNumber = (message: string) =>
  z.preprocess(
    (value) => (value === '' || value == null ? Number.NaN : Number(value)),
    z.number({ error: message }).int(message),
  );

export function createVehicleSchema(today: string = todayIso()) {
  const nextYear = Number(today.slice(0, 4)) + 1;
  return z.object({
    make: z
      .string()
      .trim()
      .min(1, 'validation.makeRequired')
      .max(MAKE_MAX, 'validation.makeTooLong'),
    model: z
      .string()
      .trim()
      .min(1, 'validation.modelRequired')
      .max(MODEL_MAX, 'validation.modelTooLong'),
    year: wholeNumber('validation.vehicleYearRange').refine(
      (y) => y >= MIN_YEAR && y <= nextYear,
      'validation.vehicleYearRange',
    ),
    engineCapacityCc: wholeNumber('validation.engineCapacityPositive')
      .refine((cc) => cc > 0, 'validation.engineCapacityPositive')
      .refine((cc) => cc <= MAX_ENGINE_CC, 'validation.engineCapacityMax'),
    plateNumber: z
      .string()
      .trim()
      .min(1, 'validation.plateRequired')
      .transform((value) => value.toUpperCase())
      .refine((v) => v.length <= PLATE_MAX && PLATE_PATTERN.test(v), 'validation.plateInvalid'),
    vin: z
      .string()
      .trim()
      .min(1, 'validation.vinRequired')
      .transform((value) => value.toUpperCase())
      .refine((v) => VIN_PATTERN.test(v), 'validation.vinInvalid'),
  });
}

export type VehicleSchema = ReturnType<typeof createVehicleSchema>;
export type VehicleInput = z.input<VehicleSchema>;
export type VehicleValues = z.output<VehicleSchema>;

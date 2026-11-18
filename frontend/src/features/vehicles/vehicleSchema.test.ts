import { createVehicleSchema } from './vehicleSchema';

const schema = createVehicleSchema('2026-11-18');
const valid = {
  make: 'Toyota',
  model: 'Corolla',
  year: '2019',
  engineCapacityCc: '1800',
  plateNumber: '10-aa-123',
  vin: '1hgbh41jxmn109186',
};

function errors(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]));
}

describe('vehicle schema (mirrors VehicleValidation.cs)', () => {
  it('accepts and normalises a valid vehicle', () => {
    expect(schema.parse(valid)).toEqual({
      make: 'Toyota',
      model: 'Corolla',
      year: 2019,
      engineCapacityCc: 1800,
      plateNumber: '10-AA-123',
      vin: '1HGBH41JXMN109186',
    });
  });

  it.each([
    ['plateNumber', 'THIS-PLATE-IS-FAR-TOO-LONG', 'validation.plateInvalid'],
    ['plateNumber', '10--AA', 'validation.plateInvalid'],
    ['plateNumber', '', 'validation.plateRequired'],
    ['vin', '1HGBH41JXMN10918O', 'validation.vinInvalid'],
    ['vin', 'SHORT', 'validation.vinInvalid'],
    ['make', 'm'.repeat(65), 'validation.makeTooLong'],
    ['model', '  ', 'validation.modelRequired'],
    ['year', '1949', 'validation.vehicleYearRange'],
    ['year', '2028', 'validation.vehicleYearRange'],
    ['year', 'abc', 'validation.vehicleYearRange'],
    ['engineCapacityCc', '0', 'validation.engineCapacityPositive'],
    ['engineCapacityCc', '10001', 'validation.engineCapacityMax'],
  ])('rejects %s = %j with %s', (field, value, message) => {
    expect(errors({ ...valid, [field]: value })[field]).toBe(message);
  });

  it('allows next year’s models, as the API does', () => {
    expect(errors({ ...valid, year: '2027' })).toEqual({});
  });
});

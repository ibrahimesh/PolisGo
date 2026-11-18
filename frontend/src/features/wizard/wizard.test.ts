import { createCoverSchema, reviewSchema, vehicleChoiceSchema } from './wizardSchema';
import {
  canVisit,
  clearState,
  initialState,
  loadState,
  saveState,
  storageKey,
  valuesKey,
} from './wizardState';
import type { WizardState } from './wizardState';

const TODAY = '2026-11-18';

function fieldErrors(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]),
  );
}

describe('cover step schema (mirrors PolicyValidation.cs)', () => {
  const schema = createCoverSchema(TODAY);

  it('accepts today and the 60th day', () => {
    expect(
      schema.safeParse({ policyTypeCode: 'MTPL', startDate: TODAY, termMonths: '12' }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ policyTypeCode: 'MTPL', startDate: '2027-01-17', termMonths: 1 }).success,
    ).toBe(true);
  });

  it.each([
    [{ startDate: '2026-11-17' }, 'startDate', 'validation.startDatePast'],
    [{ startDate: '2027-01-18' }, 'startDate', 'validation.startDateTooFar'],
    [{ startDate: '' }, 'startDate', 'validation.startDateRequired'],
    [{ startDate: '2026-02-30' }, 'startDate', 'validation.date'],
    [{ termMonths: 13 }, 'termMonths', 'validation.termRange'],
    [{ termMonths: 0 }, 'termMonths', 'validation.termRange'],
    [{ policyTypeCode: '' }, 'policyTypeCode', 'validation.policyTypeRequired'],
  ])('rejects %j', (patch, field, message) => {
    const result = schema.safeParse({
      policyTypeCode: 'MTPL',
      startDate: TODAY,
      termMonths: 12,
      ...patch,
    });
    expect(fieldErrors(result)[field]).toBe(message);
  });

  it('requires a vehicle and the acceptance tick', () => {
    expect(fieldErrors(vehicleChoiceSchema.safeParse({ vehicleId: '' })).vehicleId).toBe(
      'validation.vehicleRequired',
    );
    expect(fieldErrors(reviewSchema.safeParse({ accept: false })).accept).toBe(
      'validation.acceptRequired',
    );
  });
});

describe('wizard state', () => {
  function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
      clear: () => data.clear(),
      key: (i) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    };
  }

  it('survives a reload, per user', () => {
    const storage = memoryStorage();
    const state: WizardState = { ...initialState({ policyTypeCode: 'CASCO' }), step: 'vehicle' };
    saveState('user-a', state, storage);
    expect(loadState('user-a', storage)).toEqual(state);
    expect(loadState('user-b', storage)).toBeNull();
    clearState('user-a', storage);
    expect(loadState('user-a', storage)).toBeNull();
  });

  it('ignores corrupt or foreign data', () => {
    const storage = memoryStorage();
    storage.setItem(storageKey('u'), '{not json');
    expect(loadState('u', storage)).toBeNull();
    storage.setItem(storageKey('u'), JSON.stringify({ version: 2, step: 'done' }));
    expect(loadState('u', storage)).toBeNull();
  });

  it('sends a payment step without its draft back to review', () => {
    const storage = memoryStorage();
    saveState('u', { ...initialState(), step: 'payment' }, storage);
    expect(loadState('u', storage)?.step).toBe('review');
  });

  it('lets you step back, but not past a payment', () => {
    const atReview: WizardState = { ...initialState(), step: 'review' };
    expect(canVisit(atReview, 'cover')).toBe(true);
    expect(canVisit(atReview, 'payment')).toBe(false);
    const done: WizardState = { ...atReview, step: 'done' };
    expect(canVisit(done, 'cover')).toBe(false);
    expect(canVisit(done, 'done')).toBe(true);
  });

  it('keys a draft by the answers it was created from', () => {
    const a = initialState({ policyTypeCode: 'MTPL', vehicleId: 'v', startDate: TODAY });
    expect(valuesKey(a.values)).toBe(valuesKey({ ...a.values }));
    expect(valuesKey(a.values)).not.toBe(valuesKey({ ...a.values, termMonths: 6 }));
  });
});

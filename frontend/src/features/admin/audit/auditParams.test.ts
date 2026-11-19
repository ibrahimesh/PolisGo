import { DEFAULT_AUDIT, hasAuditFilters, readAudit, toAuditQuery, writeAudit } from './auditParams';

const read = (query: string) => readAudit(new URLSearchParams(query));
const actor = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('audit URL state', () => {
  it('round-trips every filter', () => {
    const state = { actor, type: 'Claim', from: '2026-01-01', to: '2026-01-31', page: 3 } as const;
    expect(read(writeAudit(state).toString())).toEqual(state);
    expect(toAuditQuery(state)).toEqual({
      actorId: actor,
      entityType: 'Claim',
      from: '2026-01-01',
      to: '2026-01-31',
      page: 3,
      pageSize: 25,
    });
  });

  it('drops what the API would refuse', () => {
    expect(read('actor=me&type=Payment&from=2026-02-31&page=0')).toEqual(DEFAULT_AUDIT);
    expect(read('from=2026-03-01&to=2026-01-01')).toEqual(DEFAULT_AUDIT);
    expect(read('page=999').page).toBe(200);
  });

  it('knows when anything is filtered', () => {
    expect(hasAuditFilters(DEFAULT_AUDIT)).toBe(false);
    expect(hasAuditFilters(read('type=User'))).toBe(true);
  });
});

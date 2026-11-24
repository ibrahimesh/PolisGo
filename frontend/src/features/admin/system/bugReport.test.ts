import type { ErrorGroupDetail } from '../../../api/types';
import i18n from '../../../i18n';
import { bugReport } from './bugReport';

const group: ErrorGroupDetail = {
  id: 'g1',
  fingerprint: 'ab'.repeat(32),
  title: 'Payment for [email] failed',
  source: 'Backend',
  exceptionType: 'System.InvalidOperationException',
  endpoint: 'POST api/policies/{id}/pay',
  occurrenceCount: 42,
  storedOccurrenceCount: 20,
  firstSeenAt: '2026-11-20T08:00:00Z',
  lastSeenAt: '2026-11-24T09:15:00Z',
  lastHttpStatus: 500,
  status: 'New',
  isRegressed: true,
  regressedAt: '2026-11-24T09:15:00Z',
  resolvedByName: null,
  resolvedAt: null,
  note: 'Seen after the 1.4 deploy',
  rowVersion: 'r1',
  occurrences: [
    {
      id: 'o1',
      occurredAt: '2026-11-24T09:15:00Z',
      traceId: '8f05e497f602ed095d0149881a2e0468',
      referenceCode: '8F05E497',
      httpStatus: 500,
      httpMethod: 'POST',
      routeTemplate: 'api/policies/{id}/pay',
      actorRole: 'Client',
      actorUserId: 'u1',
      appVersion: '1.4.0',
      environment: 'Production',
      message: 'Payment for [email] failed',
      stackTrace:
        'System.InvalidOperationException: x\n   at PolisGo.Application.Policies.PolicyService.PayAsync() in PolicyService.cs:line 270',
      userAgentFamily: 'Chrome',
      clientRoute: null,
    },
  ],
};

describe('bugReport', () => {
  it('holds the title, fingerprint, counts, endpoint, build and the stack in a code block', () => {
    const md = bugReport(group, i18n.t);
    expect(md).toMatch(/^## Bug report: Payment for \[email\] failed\n/);
    expect(md).toContain(`\`${'ab'.repeat(32)}\``);
    expect(md).toContain('- **Occurrences:** 42');
    expect(md).toContain('`POST api/policies/{id}/pay`');
    expect(md).toContain('- **Version:** 1.4.0');
    expect(md).toContain('- **Environment:** Production');
    expect(md).toContain('- **Reference:** `8F05E497`');
    expect(md).toContain('New (Regressed)');
    expect(md).toContain(
      '```text\nSystem.InvalidOperationException: x\n   at PolisGo.Application.Policies.PolicyService.PayAsync()',
    );
    expect(md).toContain('**Note:** Seen after the 1.4 deploy');
    // Balanced fences.
    expect((md.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it('works without occurrences (all expired)', () => {
    const md = bugReport({ ...group, occurrences: [], note: null }, i18n.t);
    expect(md).not.toContain('```');
    expect(md).toContain('- **Occurrences:** 42');
  });
});

import './systemI18n';
import type { TFunction } from 'i18next';
import type { ErrorGroupDetail } from '../../../api/types';

// A Markdown report of one error group, ready to paste into an issue or a
// coding assistant: what, where, how often, the build, and the newest
// occurrence's (already redacted) stack. Times are UTC ISO, unambiguous for
// whoever reads it.
export function bugReport(group: ErrorGroupDetail, t: TFunction): string {
  const latest = group.occurrences[0];
  const line = (label: string, value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? null : `- **${label}:** ${value}`;
  const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;

  const summary = [
    line(t('admin.system.detail.source'), t(`admin.system.sources.${group.source}`)),
    line(t('admin.system.detail.type'), code(group.exceptionType)),
    line(t('admin.system.detail.endpoint'), code(group.endpoint)),
    line(t('admin.system.detail.count'), group.occurrenceCount),
    line(t('admin.system.detail.firstSeen'), group.firstSeenAt),
    line(t('admin.system.detail.lastSeen'), group.lastSeenAt),
    line(t('admin.system.detail.lastStatus'), group.lastHttpStatus),
    line(
      t('admin.system.detail.triage'),
      t(`admin.system.statuses.${group.status}`) +
        (group.isRegressed ? ` (${t('admin.system.regressed')})` : ''),
    ),
    line(t('admin.system.detail.fingerprint'), code(group.fingerprint)),
  ];
  const occurrence = latest
    ? [
        line(t('admin.system.report.reference'), code(latest.referenceCode)),
        line(t('admin.system.detail.lastSeen'), latest.occurredAt),
        line(
          t('admin.system.detail.route'),
          latest.httpMethod || latest.routeTemplate
            ? code(`${latest.httpMethod ?? ''} ${latest.routeTemplate ?? ''}`.trim())
            : null,
        ),
        line(t('admin.system.detail.page'), latest.clientRoute ? code(latest.clientRoute) : null),
        line(t('admin.system.detail.status'), latest.httpStatus),
        line(t('admin.system.detail.role'), latest.actorRole ?? t('admin.system.detail.signedOut')),
        line(t('admin.system.detail.version'), latest.appVersion),
        line(t('admin.system.detail.environment'), latest.environment),
        line(t('admin.system.detail.browser'), latest.userAgentFamily),
      ]
    : [];

  const parts = [
    `## ${t('admin.system.report.heading')}: ${group.title}`,
    '',
    `### ${t('admin.system.report.summary')}`,
    ...summary.filter((l): l is string => l !== null),
  ];
  if (latest) {
    parts.push(
      '',
      `### ${t('admin.system.report.latest')}`,
      ...occurrence.filter((l): l is string => l !== null),
      '',
      `**${t('admin.system.detail.message')}:**`,
      '',
      '```text',
      latest.message,
      '```',
      '',
      `**${t('admin.system.detail.stack')}:**`,
      '',
      '```text',
      latest.stackTrace ?? t('admin.system.detail.noStack'),
      '```',
    );
  }
  if (group.note) parts.push('', `**${t('admin.system.detail.note')}:** ${group.note}`);
  return parts.join('\n') + '\n';
}

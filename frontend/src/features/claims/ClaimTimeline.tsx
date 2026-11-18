import { useTranslation } from 'react-i18next';
import type { ClaimHistoryEntry } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { cx } from '../../components/ui/cx';
import { useFormatters } from '../../i18n/format';

// The API writes this fixed English comment on the first history row; the
// status line already says it, in the user's language.
const SYSTEM_COMMENTS = new Set(['Claim submitted.']);

// The claim's audit history, oldest first. The customer reads "by your agent";
// staff read who each person is ("the customer", "agent").
export function ClaimTimeline({
  history,
  audience = 'customer',
  headingId = 'claim-timeline-title',
}: {
  history: readonly ClaimHistoryEntry[];
  audience?: 'customer' | 'staff';
  headingId?: string;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { user } = useAuth();
  const actors = audience === 'staff' ? 'staff.review.actor' : 'claimDetail.actor';

  const actor = (entry: ClaimHistoryEntry) =>
    entry.changedByUserId === user?.id
      ? t('claimDetail.actor.you')
      : t(`${actors}.${entry.changedByRole}`, { name: entry.changedByName });

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-2xl">
        {t('claimDetail.timelineTitle')}
      </h2>
      <ol className="space-y-0">
        {history.map((entry, index) => {
          const last = index === history.length - 1;
          const comment = SYSTEM_COMMENTS.has(entry.comment) ? '' : entry.comment.trim();
          return (
            <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
              {/* Hairline joining the steps; decorative. */}
              {!last && (
                <span
                  aria-hidden="true"
                  className="absolute top-4 bottom-0 left-[5px] w-px bg-line"
                />
              )}
              <span
                aria-hidden="true"
                className={cx(
                  'relative mt-1.5 size-[11px] shrink-0 rounded-full border-2',
                  last ? 'border-accent bg-accent' : 'border-line-strong bg-bg',
                )}
              />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{t(`claimDetail.timeline.${entry.toStatus}`)}</p>
                <p className="text-sm text-muted">
                  <time dateTime={entry.changedAt}>{format.dateTime(entry.changedAt)}</time> ·{' '}
                  {actor(entry)}
                </p>
                {comment && (
                  <blockquote className="border-l-2 border-line-strong pl-3 text-sm leading-relaxed break-words whitespace-pre-line">
                    {comment}
                  </blockquote>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

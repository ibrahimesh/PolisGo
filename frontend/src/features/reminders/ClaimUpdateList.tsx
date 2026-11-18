import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cabinetApi } from '../../api/endpoints';
import type { ClaimUpdateResponse } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { useFormatters } from '../../i18n/format';
import { useInvalidateCabinet } from '../cabinet/queries';

// Claim status changes made by staff, same pattern as renewal reminders:
// computed by the API from the claim history, only the read mark is stored.
export function ClaimUpdateList({ updates }: { updates: readonly ClaimUpdateResponse[] }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const invalidate = useInvalidateCabinet();
  const markRead = useMutation({
    mutationFn: (claimId: string) => cabinetApi.markClaimUpdateRead(claimId),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      {markRead.isError && <ErrorNotice error={markRead.error} className="mx-4" />}
      <ul className="divide-y divide-line">
        {updates.map((update) => {
          const unread = update.readAt === null;
          return (
            <li key={update.claimId} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-2 size-2 shrink-0 rounded-full',
                    unread ? 'bg-warning' : 'bg-transparent',
                  )}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">
                    {unread && <span className="sr-only">{t('reminders.unread')}: </span>}
                    <Link
                      to={`/app/claims/${update.claimId}`}
                      className="underline decoration-line-strong underline-offset-4 hover:decoration-current"
                    >
                      {t(`claimUpdates.status.${update.toStatus}`, { number: update.claimNumber })}
                    </Link>
                  </p>
                  <p className="text-sm text-muted tabular">
                    <time dateTime={update.changedAt}>{format.dateTime(update.changedAt)}</time>
                  </p>
                  {update.comment.trim() && (
                    <p className="line-clamp-2 text-sm break-words text-muted">{update.comment}</p>
                  )}
                  {unread && (
                    <div className="pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={markRead.isPending && markRead.variables === update.claimId}
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(update.claimId)}
                      >
                        {t('reminders.markRead')}
                        <span className="sr-only"> — {update.claimNumber}</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

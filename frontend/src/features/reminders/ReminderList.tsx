import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cabinetApi } from '../../api/endpoints';
import type { ReminderResponse } from '../../api/types';
import { Button, ButtonLink } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { useFormatters } from '../../i18n/format';
import { useInvalidateCabinet } from '../cabinet/queries';

// Renewal reminders, shared by the overview and the notifications panel.
// Unread items carry a dot and the word "Unread" for screen readers.
export function ReminderList({
  reminders,
  compact = false,
}: {
  reminders: readonly ReminderResponse[];
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const invalidate = useInvalidateCabinet();
  const markRead = useMutation({
    mutationFn: (policyId: string) => cabinetApi.markRead(policyId),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      {markRead.isError && <ErrorNotice error={markRead.error} />}
      <ul className="divide-y divide-line border-y border-line">
        {reminders.map((reminder) => {
          const unread = reminder.readAt === null;
          return (
            <li key={reminder.policyId} className={cx('py-4', compact ? 'px-4' : 'px-0')}>
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
                      to={`/app/policies/${reminder.policyId}`}
                      className="underline decoration-line-strong underline-offset-4 hover:decoration-current"
                    >
                      {t(`calculator.products.${reminder.policyTypeCode}`, {
                        defaultValue: reminder.policyTypeCode,
                      })}{' '}
                      · {reminder.vehicle.plateNumber}
                    </Link>
                  </p>
                  <p className="text-sm text-muted tabular">
                    {t('reminders.endsOn', { date: format.date(reminder.endDate) })} ·{' '}
                    {reminder.daysLeft === 0
                      ? t('reminders.lastDay')
                      : t('reminders.daysLeft', { count: reminder.daysLeft })}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <ButtonLink to={`/app/buy?renew=${reminder.policyId}`} size="sm">
                      {t('reminders.renew')}
                      <span className="sr-only"> — {reminder.policyNumber}</span>
                    </ButtonLink>
                    {unread && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={markRead.isPending && markRead.variables === reminder.policyId}
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(reminder.policyId)}
                      >
                        {t('reminders.markRead')}
                        {/* Visible text stays the start of the name (WCAG 2.5.3). */}
                        <span className="sr-only"> — {reminder.policyNumber}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

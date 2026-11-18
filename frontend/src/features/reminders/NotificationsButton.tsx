import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cabinetApi } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { BellIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { useInvalidateCabinet, useReminders } from '../cabinet/queries';
import { usePopover } from '../cabinet/usePopover';
import { ReminderList } from './ReminderList';

// Header bell for Clients: renewal reminders computed by the API from end
// dates. A disclosure, not a menu: the panel holds ordinary buttons and
// links, so Tab moves through it and Escape returns to the bell.
export function NotificationsButton() {
  const { t } = useTranslation();
  const format = useFormatters();
  const popover = usePopover();
  const reminders = useReminders();
  const invalidate = useInvalidateCabinet();
  const markAll = useMutation({ mutationFn: cabinetApi.markAllRead, onSuccess: invalidate });

  const unread = reminders.data?.filter((r) => r.readAt === null).length ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        {...popover.buttonProps}
        onClick={popover.toggle}
        className="relative grid size-9 place-items-center rounded-sm border border-line text-muted transition-colors hover:text-text"
      >
        <BellIcon />
        <span className="sr-only">{t('notifications.button', { count: unread })}</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-sm bg-accent px-1 text-sm leading-none font-medium text-accent-ink tabular"
          >
            {format.integer(unread)}
          </span>
        )}
      </button>

      <div
        {...popover.panelProps}
        role="region"
        aria-labelledby="notifications-title"
        className="fixed inset-x-4 top-16 z-50 mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-sm border border-line-strong bg-surface sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-96"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="notifications-title" className="font-sans text-base font-medium">
            {t('reminders.title')}
          </h2>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {t('reminders.markAll')}
            </Button>
          )}
        </div>
        {markAll.isError && <ErrorNotice error={markAll.error} className="m-4" />}
        {reminders.isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : reminders.isError ? (
          <ErrorNotice error={reminders.error} className="m-4" />
        ) : reminders.data.length === 0 ? (
          <p className="px-4 py-6 text-muted">{t('reminders.empty')}</p>
        ) : (
          <ReminderList reminders={reminders.data} compact />
        )}
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          {t('notifications.note')}
        </p>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../../i18n/apiErrors';
import type { StatusOverrides } from '../../i18n/apiErrors';
import { cx } from './cx';
import { AlertIcon } from './icons';

interface ErrorNoticeProps {
  error: unknown;
  title?: ReactNode;
  overrides?: StatusOverrides;
  action?: ReactNode;
  className?: string;
}

// Inline, translated API error with the server traceId so a user can quote it.
export function ErrorNotice({ error, title, overrides, action, className }: ErrorNoticeProps) {
  const { t } = useTranslation();
  const { messageKey, traceId } = describeError(error, overrides);

  return (
    <div
      role="alert"
      className={cx('flex gap-3 rounded-sm border border-danger/50 p-4', className)}
    >
      <span className="mt-0.5 text-danger">
        <AlertIcon />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        <p className={title ? 'opacity-80' : undefined}>{t(messageKey)}</p>
        {traceId && (
          <p className="pt-1 text-sm break-all opacity-80">
            {t('errors.reference')}: <span className="normal-case">{traceId}</span>
          </p>
        )}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

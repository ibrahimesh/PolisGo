import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError } from '../../api/errors';
import { describeError } from '../../i18n/apiErrors';
import type { StatusOverrides } from '../../i18n/apiErrors';
import { cx } from './cx';
import { AlertIcon } from './icons';
import { ReferenceChip } from './ReferenceChip';

interface ErrorNoticeProps {
  error: unknown;
  title?: ReactNode;
  overrides?: StatusOverrides;
  action?: ReactNode;
  className?: string;
  // A short horizontal shake on arrival (a failed sign-in); off under
  // reduced motion like every animation.
  shake?: boolean;
}

// The one way a failed request is shown: an icon, the translated message,
// and the server's reference as a short chip people can copy and quote.
// Field validation (a 400 with field errors) needs no reference: the fields
// say what to fix. Every new error re-mounts the alert, so it is announced
// and animates again even when the text is the same as last time.
export function ErrorNotice({
  error,
  title,
  overrides,
  action,
  className,
  shake = false,
}: ErrorNoticeProps) {
  const { t } = useTranslation();
  const { messageKey, traceId } = describeError(error, overrides);
  const fieldValidation =
    isApiError(error) &&
    error.status === 400 &&
    Object.keys(error.problem?.errors ?? {}).length > 0;
  const reference = fieldValidation ? undefined : traceId;

  const [seen, setSeen] = useState(error);
  const [attempt, setAttempt] = useState(0);
  if (error !== seen) {
    setSeen(error);
    setAttempt(attempt + 1);
  }

  return (
    <div
      key={attempt}
      role="alert"
      data-testid="error-notice"
      className={cx(
        'flex gap-3 rounded-sm border border-danger/50 p-4',
        shake ? 'animate-notice-shake' : 'animate-notice-in',
        className,
      )}
    >
      <span className="mt-0.5 shrink-0 text-danger">
        <AlertIcon />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          {title && <p className="font-medium">{title}</p>}
          <p className={title ? 'text-muted' : undefined}>{t(messageKey)}</p>
        </div>
        {reference && <ReferenceChip traceId={reference} />}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

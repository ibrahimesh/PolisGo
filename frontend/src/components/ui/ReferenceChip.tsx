import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shortReference } from '../../lib/reference';
import { cx } from './cx';
import { CheckIcon, CopyIcon } from './icons';

// "Reference 8F05E497" with a copy button. The full id is in the tooltip and
// in the button's description, and is what gets copied.
export function ReferenceChip({ traceId, className }: { traceId: string; className?: string }) {
  const { t } = useTranslation();
  const code = shortReference(traceId);
  const descriptionId = useId();
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(traceId);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <span
      title={traceId}
      data-testid="reference-chip"
      className={cx(
        'inline-flex h-8 max-w-full items-center gap-2 rounded-sm border border-line pr-1 pl-2.5 text-sm text-muted',
        className,
      )}
    >
      <span className="whitespace-nowrap">
        {t('errors.reference')}{' '}
        <span className="font-medium tracking-wide text-text tabular">{code}</span>
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('errors.copyReference', { code })}
        aria-describedby={descriptionId}
        className="grid size-6 shrink-0 place-items-center rounded-sm text-muted transition-colors duration-(--duration-fast) hover:bg-surface-2 hover:text-text"
      >
        {copied === 'copied' ? <CheckIcon /> : <CopyIcon />}
      </button>
      {/* hidden: read as the button's description, not as part of the alert. */}
      <span id={descriptionId} hidden>
        {t('errors.fullReference', { traceId })}
      </span>
      {/* Announced politely; visible next to the chip while it lasts. */}
      <span role="status" className={cx('whitespace-nowrap', copied === 'idle' && 'sr-only')}>
        {copied === 'copied'
          ? t('errors.copied')
          : copied === 'failed'
            ? t('errors.copyFailed')
            : ''}
      </span>
    </span>
  );
}

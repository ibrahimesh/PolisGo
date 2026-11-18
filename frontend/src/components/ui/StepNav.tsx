import { useTranslation } from 'react-i18next';
import { cx } from './cx';
import { CheckIcon } from './icons';

export interface StepNavItem<T extends string> {
  id: T;
  label: string;
}

// An ordered list of steps; the current one is aria-current="step". Steps you
// may return to are buttons. Phones get a compact "Step 2 of 5" line and a
// segmented bar instead of labels that would not fit at 390px. Five steps at
// most: more labels don't fit one row beside the sidebar.
export function StepNav<T extends string>({
  label,
  steps,
  current,
  canVisit,
  onSelect,
}: {
  label: string;
  steps: readonly StepNavItem<T>[];
  current: T;
  canVisit: (id: T) => boolean;
  onSelect: (id: T) => void;
}) {
  const { t } = useTranslation();
  const index = steps.findIndex((step) => step.id === current);
  const currentLabel = steps[index]?.label ?? '';

  return (
    <nav aria-label={label}>
      <p className="text-sm text-muted md:hidden">
        {t('wizard.stepOf', { step: index + 1, total: steps.length })} ·{' '}
        <span className="font-medium text-text">{currentLabel}</span>
      </p>
      <div className="mt-2 flex gap-1 md:hidden" aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={step.id}
            className={cx('h-1 flex-1 rounded-full', i <= index ? 'bg-accent' : 'bg-line')}
          />
        ))}
      </div>

      <ol
        className="hidden border-y border-line md:grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => {
          const done = i < index;
          const isCurrent = i === index;
          const visitable = canVisit(step.id);
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cx(
                  'grid size-6 shrink-0 place-items-center rounded-sm border text-sm tabular',
                  isCurrent
                    ? 'border-accent bg-accent text-accent-ink'
                    : done
                      ? 'border-accent text-accent'
                      : 'border-line-strong text-muted',
                )}
              >
                {done ? <CheckIcon /> : i + 1}
              </span>
              <span className={cx('min-w-0 text-left', isCurrent ? 'text-text' : 'text-muted')}>
                {step.label}
                {done && <span className="sr-only"> — {t('wizard.completed')}</span>}
              </span>
            </>
          );
          const base =
            'relative flex h-full w-full items-center gap-3 px-3 py-4 text-sm font-medium';
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className={cx(
                isCurrent &&
                  'before:absolute before:inset-x-0 before:bottom-[-1px] before:h-0.5 before:bg-accent',
                'relative',
              )}
            >
              {visitable && !isCurrent ? (
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  className={cx(base, 'rounded-sm transition-colors hover:bg-surface-2')}
                >
                  {content}
                </button>
              ) : (
                <div className={base}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

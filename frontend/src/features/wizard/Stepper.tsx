import { useTranslation } from 'react-i18next';
import { cx } from '../../components/ui/cx';
import { CheckIcon } from '../../components/ui/icons';
import { useWizard } from './WizardContext';
import { canVisit, STEPS } from './wizardState';

// An ordered list of steps; the current one is aria-current="step". Steps you
// may return to are buttons. Phones get a compact "Step 2 of 5" line and a
// segmented bar instead of five labels that would not fit at 390px.
export function Stepper() {
  const { t } = useTranslation();
  const { state, goTo, navigating } = useWizard();
  const current = STEPS.indexOf(state.step);

  return (
    <nav aria-label={t('wizard.progress')}>
      <p className="text-sm text-muted md:hidden">
        {t('wizard.stepOf', { step: current + 1, total: STEPS.length })} ·{' '}
        <span className="font-medium text-text">{t(`wizard.steps.${state.step}.short`)}</span>
      </p>
      <div className="mt-2 grid grid-cols-5 gap-1 md:hidden" aria-hidden="true">
        {STEPS.map((step, index) => (
          <span
            key={step}
            className={cx('h-1 rounded-full', index <= current ? 'bg-accent' : 'bg-line')}
          />
        ))}
      </div>

      <ol className="hidden border-y border-line md:grid md:grid-cols-5">
        {STEPS.map((step, index) => {
          const done = index < current;
          const isCurrent = index === current;
          const visitable = canVisit(state, step) && !navigating;
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
                {done ? <CheckIcon /> : index + 1}
              </span>
              <span className={cx('min-w-0 text-left', isCurrent ? 'text-text' : 'text-muted')}>
                {t(`wizard.steps.${step}.short`)}
                {done && <span className="sr-only"> — {t('wizard.completed')}</span>}
              </span>
            </>
          );
          const base =
            'relative flex h-full w-full items-center gap-3 px-3 py-4 text-sm font-medium';
          return (
            <li
              key={step}
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
                  onClick={() => void goTo(step)}
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

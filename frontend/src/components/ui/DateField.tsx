import { useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDaysIso,
  addMonthsIso,
  applyInput,
  clampIso,
  daysInMonth,
  isCompleteIso,
  isoOf,
  isoToDisplay,
  isWithin,
  monthGrid,
  toYearMonth,
  valueForText,
  weekdayIndex,
} from '../../lib/dateInput';
import { todayIso } from '../../lib/dates';
import { cx } from './cx';
import { Field } from './Field';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { controlClasses, describedBy } from './styles';

interface DateFieldProps {
  label: ReactNode;
  // ISO "YYYY-MM-DD"; '' when empty; the typed text while incomplete.
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  min?: string;
  max?: string;
  // Defaults to the allowed range in words when min or max is set.
  hint?: ReactNode;
  error?: string | undefined;
  disabled?: boolean;
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
}

// One date control for the whole app. The native picker follows the
// browser's language (a Russian calendar in the Azerbaijani UI) and gives no
// reason when a day can't be picked; this one types as DD.MM.YYYY in every
// language, has its own calendar in EN/RU/AZ, and says which dates it takes.
export function DateField({
  label,
  value,
  onChange,
  onBlur,
  id: idProp,
  name,
  min,
  max,
  hint,
  error,
  disabled,
  required,
  ref,
}: DateFieldProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp ?? autoId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState(() => isoToDisplay(value));

  // A value set from outside (reset, a server value) replaces the text.
  if (valueForText(display) !== value && display !== value) {
    setDisplay(isoToDisplay(value));
  }

  const rangeHint = useRangeText(min, max);
  const shownHint = hint ?? rangeHint;

  const leave = (event: FocusEvent) => {
    if (!wrapperRef.current?.contains(event.relatedTarget)) onBlur?.();
  };

  return (
    <Field id={id} label={label} hint={shownHint} error={error}>
      <div ref={wrapperRef} className="relative" onBlur={leave}>
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('dateField.placeholder')}
          value={display}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint: shownHint, error })}
          className={cx(controlClasses, 'pr-14')}
          onChange={(event) => {
            const next = applyInput(event.target.value);
            setDisplay(next.display);
            onChange(next.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && event.altKey) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <button
            ref={toggleRef}
            type="button"
            disabled={disabled}
            aria-label={t('dateField.openCalendar')}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            className="grid size-10 place-items-center rounded-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <CalendarIcon />
          </button>
        </div>
        {open && (
          <Calendar
            value={isCompleteIso(value) ? value : null}
            min={min}
            max={max}
            rangeText={rangeHint}
            onPick={(iso) => {
              setDisplay(isoToDisplay(iso));
              onChange(iso);
              setOpen(false);
              toggleRef.current?.focus();
            }}
            onClose={() => {
              setOpen(false);
              toggleRef.current?.focus();
            }}
            wrapperRef={wrapperRef}
          />
        )}
      </div>
    </Field>
  );
}

function useRangeText(min?: string, max?: string): string | undefined {
  const { t } = useTranslation();
  const today = todayIso();
  const word = (iso: string) => (iso === today ? t('dateField.todayWord') : isoToDisplay(iso));
  if (min && max) return t('dateField.between', { min: word(min), max: word(max) });
  if (min) return t('dateField.from', { min: word(min) });
  if (max) return t('dateField.until', { max: word(max) });
  return undefined;
}

function Calendar({
  value,
  min,
  max,
  rangeText,
  onPick,
  onClose,
  wrapperRef,
}: {
  value: string | null;
  min?: string;
  max?: string;
  rangeText?: string;
  onPick: (iso: string) => void;
  onClose: () => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const today = todayIso();
  const months = t('dateField.months', { returnObjects: true }) as string[];
  const monthsOfDay = t('dateField.monthsOfDay', { returnObjects: true }) as string[];
  const weekdays = t('dateField.weekdays', { returnObjects: true }) as string[];
  const weekdaysLong = t('dateField.weekdaysLong', { returnObjects: true }) as string[];

  // The focused day: the value, else today, kept inside the allowed range.
  const [active, setActive] = useState(() => clampIso(value ?? today, min, max));
  const shown = toYearMonth(active);
  const grid = monthGrid(shown);
  const gridRef = useRef<HTMLTableElement>(null);
  const focusDay = useRef(true);

  useEffect(() => {
    if (!focusDay.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${active}"]`)?.focus();
  }, [active]);

  // Outside click closes, like Escape.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, wrapperRef]);

  const thisYear = Number(today.slice(0, 4));
  const firstYear = min ? Number(min.slice(0, 4)) : thisYear - 100;
  const lastYear = max ? Number(max.slice(0, 4)) : thisYear + 5;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i);

  const move = (next: string, fromKeyboard = true) => {
    focusDay.current = fromKeyboard;
    setActive(next);
  };
  // The month and year pickers keep the day where the month allows it.
  const jumpTo = (year: number, month: number) => {
    const day = Math.min(Number(active.slice(8, 10)), daysInMonth(year, month));
    move(clampIso(isoOf(year, month, day), min, max), false);
  };

  const dayLabel = (iso: string) =>
    t('dateField.dayLabel', {
      day: Number(iso.slice(8, 10)),
      month: monthsOfDay[Number(iso.slice(5, 7)) - 1],
      year: iso.slice(0, 4),
      weekday: weekdaysLong[weekdayIndex(iso)],
    });

  const onGridKey = (event: KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDaysIso(active, -1),
      ArrowRight: () => addDaysIso(active, 1),
      ArrowUp: () => addDaysIso(active, -7),
      ArrowDown: () => addDaysIso(active, 7),
      PageUp: () => addMonthsIso(active, event.shiftKey ? -12 : -1),
      PageDown: () => addMonthsIso(active, event.shiftKey ? 12 : 1),
      Home: () => addDaysIso(active, -weekdayIndex(active)),
      End: () => addDaysIso(active, 6 - weekdayIndex(active)),
    };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      move(step());
    }
  };

  return (
    // Escape anywhere in the popover closes it (WAI-ARIA date picker dialog);
    // the handler is the dialog's, its controls are the real buttons inside.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="absolute top-full left-0 z-40 mt-2 w-[min(21rem,calc(100vw-2rem))] origin-top-left animate-pop-in rounded-sm border border-line bg-surface p-4 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)]"
    >
      <h2 id={titleId} className="sr-only">
        {t('dateField.calendar')}
      </h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('dateField.previousMonth')}
          onClick={() => move(addMonthsIso(active, -1), false)}
          className="grid size-9 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronLeftIcon />
        </button>
        <label className="sr-only" htmlFor={`${titleId}-month`}>
          {t('dateField.month')}
        </label>
        <select
          id={`${titleId}-month`}
          value={shown.month}
          onChange={(event) => jumpTo(shown.year, Number(event.target.value))}
          className="h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-2 text-sm text-text"
        >
          {months.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${titleId}-year`}>
          {t('dateField.year')}
        </label>
        <select
          id={`${titleId}-year`}
          value={shown.year}
          onChange={(event) => jumpTo(Number(event.target.value), shown.month)}
          className="h-9 w-24 rounded-sm border border-line-strong bg-surface px-2 text-sm text-text tabular"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={t('dateField.nextMonth')}
          onClick={() => move(addMonthsIso(active, 1), false)}
          className="grid size-9 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {months[shown.month - 1]} {shown.year}
      </p>

      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        className="mt-3 w-full table-fixed"
      >
        <thead>
          <tr>
            {weekdays.map((day, index) => (
              <th key={day} scope="col" className="pb-1 text-center text-sm font-medium text-muted">
                <abbr title={weekdaysLong[index]} className="no-underline">
                  {day}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week, row) => (
            <tr key={row}>
              {week.map((iso, column) =>
                iso === null ? (
                  <td key={`empty-${row}-${column}`} />
                ) : (
                  <td
                    key={iso}
                    role="gridcell"
                    aria-selected={iso === value}
                    className="p-0.5 text-center"
                  >
                    <button
                      type="button"
                      data-day={iso}
                      tabIndex={iso === active ? 0 : -1}
                      aria-label={dayLabel(iso)}
                      aria-current={iso === today ? 'date' : undefined}
                      // Kept focusable so the arrow keys pass through; the
                      // range under the grid says why it can't be picked.
                      aria-disabled={isWithin(iso, min, max) ? undefined : true}
                      onClick={() => {
                        if (isWithin(iso, min, max)) onPick(iso);
                        else move(iso);
                      }}
                      onKeyDown={(event) => {
                        if (
                          (event.key === 'Enter' || event.key === ' ') &&
                          !isWithin(iso, min, max)
                        ) {
                          event.preventDefault();
                        } else {
                          onGridKey(event);
                        }
                      }}
                      className={cx(
                        'grid h-9 w-full place-items-center rounded-sm text-sm tabular transition-colors',
                        iso === value
                          ? 'bg-accent font-medium text-accent-ink'
                          : isWithin(iso, min, max)
                            ? 'text-text hover:bg-surface-2'
                            : 'cursor-not-allowed text-muted line-through decoration-muted/60',
                        iso === today && iso !== value && 'ring-1 ring-line-strong ring-inset',
                      )}
                    >
                      {Number(iso.slice(8, 10))}
                    </button>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="min-w-0 text-sm text-muted">{rangeText ?? t('dateField.anyDate')}</p>
        {isWithin(today, min, max) && (
          <button
            type="button"
            onClick={() => onPick(today)}
            className="rounded-sm px-2 py-1 text-sm font-medium text-text underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >
            {t('dateField.today')}
          </button>
        )}
      </div>
    </div>
  );
}

import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  // Accessible name when the visible label is an icon or abbreviation.
  ariaLabel?: string;
  lang?: string;
}

interface SegmentedControlProps<T extends string> {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  segments: readonly Segment<T>[];
  size?: 'sm' | 'md';
  className?: string;
}

// Real radio inputs underneath: arrow-key navigation and screen-reader
// semantics come from the platform rather than custom ARIA.
export function SegmentedControl<T extends string>({
  legend,
  value,
  onChange,
  segments,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx('flex', className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex rounded-sm border border-line">
        {segments.map((segment) => {
          const checked = segment.value === value;
          return (
            <label
              key={segment.value}
              lang={segment.lang}
              className={cx(
                'relative grid cursor-pointer place-items-center border-r border-line transition-colors duration-150 last:border-r-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                size === 'sm' ? 'h-9 min-w-9 px-3' : 'h-12 min-w-12 px-4',
                checked ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
              )}
            >
              <input
                type="radio"
                name={name}
                value={segment.value}
                checked={checked}
                onChange={() => onChange(segment.value)}
                aria-label={segment.ariaLabel}
                className="sr-only"
              />
              {segment.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

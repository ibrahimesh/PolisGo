import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  lang?: string;
}

// Bordered chips around real radios (DESIGN.md "Choice chips"): they wrap
// at 390px, the checked one gets the accent border and surface-2, and arrow
// keys move between them as the platform's radio group does.
export function ChoiceChips<T extends string>({
  legend,
  value,
  onChange,
  choices,
  name,
}: {
  legend: ReactNode;
  value: T;
  onChange: (value: T) => void;
  choices: readonly Choice<T>[];
  name?: string;
}) {
  const fallbackName = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const checked = choice.value === value;
          return (
            <label
              key={choice.value}
              lang={choice.lang}
              className={cx(
                'inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-sm border px-4 text-base whitespace-nowrap transition-colors duration-(--duration-fast) has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                checked
                  ? 'border-accent bg-surface-2 text-text'
                  : 'border-line-strong text-text hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name={name ?? fallbackName}
                value={choice.value}
                checked={checked}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              {choice.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

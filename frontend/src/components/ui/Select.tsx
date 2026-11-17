import { useId } from 'react';
import type { ReactNode, Ref, SelectHTMLAttributes } from 'react';
import { Field } from './Field';
import { controlClasses, describedBy } from './styles';
import type { FieldMessages } from './Field';
import { cx } from './cx';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldMessages {
  label: ReactNode;
  options: readonly { value: string | number; label: string }[];
  ref?: Ref<HTMLSelectElement>;
}

// Native <select> for free keyboard, screen-reader and mobile picker support.
export function Select({
  label,
  hint,
  error,
  options,
  id: idProp,
  className,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          className={cx(controlClasses, 'appearance-none pr-10', className)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3.5 size-3 -translate-y-1/2 text-muted"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      </div>
    </Field>
  );
}

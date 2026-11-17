import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { Field } from './Field';
import { controlClasses, describedBy } from './styles';
import type { FieldMessages } from './Field';
import { cx } from './cx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldMessages {
  label: ReactNode;
  // Unit shown inside the field (e.g. "cc"); purely visual, the label carries meaning.
  suffix?: ReactNode;
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  hint,
  error,
  suffix,
  trailing,
  id: idProp,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          className={cx(controlClasses, (suffix ?? trailing) ? 'pr-14' : undefined, className)}
          {...rest}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center label-mono text-muted"
          >
            {suffix}
          </span>
        )}
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
    </Field>
  );
}

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import { Field } from './Field';
import type { FieldMessages } from './Field';
import { controlClasses, describedBy } from './styles';

interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-describedby'>, FieldMessages {
  label: ReactNode;
  // Unit shown inside the field (e.g. "cc"); purely visual, the label carries meaning.
  suffix?: ReactNode;
  trailing?: ReactNode;
  // Extra ids to announce with the field (e.g. a live password checklist).
  describedById?: string;
  // Rendered between the control and its hint/error (e.g. a strength meter).
  below?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  hint,
  error,
  suffix,
  trailing,
  describedById,
  below,
  id: idProp,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const ariaDescribedBy =
    [describedBy(id, { hint, error }), describedById].filter(Boolean).join(' ') || undefined;

  return (
    <Field id={id} label={label} hint={hint} error={error} below={below}>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={ariaDescribedBy}
          className={cx(controlClasses, (suffix ?? trailing) ? 'pr-14' : undefined, className)}
          {...rest}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
          >
            {suffix}
          </span>
        )}
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
    </Field>
  );
}

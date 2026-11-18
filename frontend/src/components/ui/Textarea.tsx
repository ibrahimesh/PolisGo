import { useId } from 'react';
import type { ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { Field } from './Field';
import type { FieldMessages } from './Field';
import { describedBy } from './styles';

interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'aria-describedby'>, FieldMessages {
  label: ReactNode;
  // Live "120 / 2000" under the field; announced only through the hint id.
  count?: { value: number; max: number };
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  hint,
  error,
  count,
  id: idProp,
  className,
  rows = 5,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const counter = count && (
    <p
      id={`${id}-count`}
      className={cx('text-sm tabular', count.value > count.max ? 'text-danger' : 'text-muted')}
    >
      {count.value} / {count.max}
    </p>
  );
  const ariaDescribedBy =
    [describedBy(id, { hint, error }), count ? `${id}-count` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <Field id={id} label={label} hint={hint} error={error} below={counter}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={ariaDescribedBy}
        className={cx(
          'min-h-32 w-full rounded-sm border border-line-strong bg-surface px-4 py-3 text-base leading-relaxed text-text transition-colors duration-150 placeholder:text-muted hover:border-text/50 disabled:opacity-50 aria-invalid:border-danger',
          className,
        )}
        {...rest}
      />
    </Field>
  );
}

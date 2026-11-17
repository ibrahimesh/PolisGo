import type { FieldErrors, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AlertIcon } from './icons';

export interface SummaryField<T extends FieldValues> {
  name: keyof T & string;
  // The input's DOM id, so each entry can move focus to its field.
  id: string;
  label: string;
}

interface FormErrorSummaryProps<T extends FieldValues> {
  errors: FieldErrors<T>;
  fields: readonly SummaryField<T>[];
  // Only announce after the user tried to submit, not while typing.
  show: boolean;
}

// The live region always exists so screen readers register it before it fills.
export function FormErrorSummary<T extends FieldValues>({
  errors,
  fields,
  show,
}: FormErrorSummaryProps<T>) {
  const { t } = useTranslation();
  const invalid = fields.flatMap((field) => {
    const message = errors[field.name]?.message;
    return typeof message === 'string' ? [{ ...field, message }] : [];
  });

  return (
    <div aria-live="assertive" aria-atomic="true">
      {show && invalid.length > 0 && (
        <div className="rounded-sm border border-danger/50 p-4" data-testid="error-summary">
          <p className="flex items-center gap-2 font-medium text-danger">
            <AlertIcon />
            {t('forms.errorSummary', { count: invalid.length })}
          </p>
          <ul className="mt-2 space-y-1 pl-6 text-sm">
            {invalid.map((field) => (
              <li key={field.name}>
                <a
                  href={`#${field.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(field.id)?.focus();
                  }}
                  className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
                >
                  {field.label}: {t(field.message)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

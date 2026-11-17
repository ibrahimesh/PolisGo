import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertIcon } from './icons';

export interface FieldMessages {
  hint?: ReactNode;
  // An i18n key; Field translates it so client- and server-side errors share copy.
  error?: string | undefined;
}

interface FieldProps extends FieldMessages {
  id: string;
  label: ReactNode;
  children: ReactNode;
  below?: ReactNode;
}

// Shared label / hint / error frame used by Input and Select. Inline errors
// are not live regions: the form's error summary announces on submit, and a
// focused field reads its error through aria-describedby.
export function Field({ id, label, hint, error, children, below }: FieldProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {below}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-danger">
          <span className="mt-0.5 shrink-0">
            <AlertIcon />
          </span>
          {t(error)}
        </p>
      )}
    </div>
  );
}

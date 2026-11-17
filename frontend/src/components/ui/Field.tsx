import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface FieldMessages {
  hint?: ReactNode;
  // An i18n key; Field translates it so client- and server-side errors share copy.
  error?: string | undefined;
}

interface FieldProps extends FieldMessages {
  id: string;
  label: ReactNode;
  children: ReactNode;
}

// Shared label / hint / error frame used by Input and Select.
export function Field({ id, label, hint, error, children }: FieldProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-mono text-muted">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      <p id={`${id}-error`} className="text-xs text-danger empty:hidden" aria-live="polite">
        {error ? t(error) : null}
      </p>
    </div>
  );
}

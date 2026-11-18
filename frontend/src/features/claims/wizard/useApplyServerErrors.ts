import { useEffect } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { useClaimWizard } from './ClaimWizardContext';

// A rejected submit sends the user back to the step that owns the first bad
// field; this puts the server's message on the field and focuses it.
export function useApplyServerErrors<T extends FieldValues>(
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
  focus: (field: Path<T>) => void,
) {
  const { serverErrors, setServerErrors } = useClaimWizard();
  useEffect(() => {
    const mine = fields.filter((field) => serverErrors[field]);
    if (mine.length === 0) return;
    for (const field of mine) {
      setError(field, { type: 'server', message: serverErrors[field] });
    }
    const first = mine[0];
    if (first) focus(first);
    // Hand the rest (none, normally) back for their own steps.
    setServerErrors(
      Object.fromEntries(
        Object.entries(serverErrors).filter(
          ([field]) => !(mine as readonly string[]).includes(field),
        ),
      ),
    );
    // Runs when errors arrive for this step; the rest are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverErrors]);
}

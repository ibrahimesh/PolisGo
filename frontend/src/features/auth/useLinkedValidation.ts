import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import type {
  Control,
  FieldPath,
  FieldValues,
  UseFormGetFieldState,
  UseFormTrigger,
} from 'react-hook-form';

// Re-validates `target` when `source` changes, but only once the user has
// touched `target`. RHF's `deps` fires immediately, which showed "Repeat your
// password" while the user was still typing the first password.
export function useLinkedValidation<T extends FieldValues>(
  control: Control<T>,
  trigger: UseFormTrigger<T>,
  getFieldState: UseFormGetFieldState<T>,
  source: FieldPath<T>,
  target: FieldPath<T>,
) {
  const value = useWatch({ control, name: source });
  useEffect(() => {
    if (getFieldState(target).isTouched) void trigger(target);
  }, [value, getFieldState, trigger, target]);
}

import type { ComponentProps } from 'react';
import { Controller } from 'react-hook-form';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { DateField } from './DateField';

type Props<T extends FieldValues> = Omit<
  ComponentProps<typeof DateField>,
  'value' | 'onChange' | 'onBlur' | 'name' | 'ref'
> & {
  control: Control<T>;
  name: FieldPath<T>;
};

// DateField bound to React Hook Form. The field shows DD.MM.YYYY but the form
// holds the ISO date, so it can't use register(): RHF would write its value
// into the text box. The controller keeps the two apart, and its ref still
// lets RHF move focus to the field on an error.
export function FormDateField<T extends FieldValues>({ control, name, error, ...rest }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DateField
          {...rest}
          name={field.name}
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          error={error ?? fieldState.error?.message}
        />
      )}
    />
  );
}

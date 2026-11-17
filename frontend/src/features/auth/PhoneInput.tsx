import type { ComponentProps, Ref } from 'react';
import { Input } from '../../components/ui/Input';
import { formatAzPhone, toNationalDigits } from './validation';

type PhoneInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
};

// Masks input as "+994 XX XXX XX XX". Any pasted variant (0501234567,
// 994501234567, (50) 123-45-67) is re-read as the 9-digit national number.
// The field value stays the readable display string; the schema converts it
// to E.164 on submit.
export function PhoneInput({ value, onChange, ...rest }: PhoneInputProps) {
  return (
    <Input
      {...rest}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+994 50 123 45 67"
      value={value}
      onChange={(event) => {
        const raw = event.target.value;
        let national = toNationalDigits(raw);
        // Backspacing over a mask space removes no digit; drop one so the
        // caret doesn't get stuck behind the separator.
        if (raw.length < value.length && national === toNationalDigits(value)) {
          national = national.slice(0, -1);
        }
        onChange(formatAzPhone(national));
      }}
    />
  );
}

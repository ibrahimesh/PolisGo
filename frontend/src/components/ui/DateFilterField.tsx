import { useState } from 'react';
import { isCompleteIso, isWithin } from '../../lib/dateInput';
import { DateField } from './DateField';

// A date filter for a list. It applies once the box holds a whole date inside
// min/max (or is cleared); a half-typed or out-of-range date stays in the box
// with its error, after the user leaves the field, instead of filtering.
export function DateFilterField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);
  // The URL changed under us (cleared filters, Back): show that value.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  const invalid = draft !== '' && !isCompleteIso(draft);
  const outside = isCompleteIso(draft) && !isWithin(draft, min, max);
  return (
    <DateField
      id={id}
      label={label}
      value={draft}
      min={min}
      max={max}
      error={
        touched && invalid
          ? 'validation.date'
          : touched && outside
            ? 'validation.dateOutsideRange'
            : undefined
      }
      onChange={(next) => {
        setDraft(next);
        if (next === '' || (isCompleteIso(next) && isWithin(next, min, max))) onCommit(next);
      }}
      onBlur={() => setTouched(true)}
    />
  );
}

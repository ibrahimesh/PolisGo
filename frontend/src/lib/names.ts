// "Leyla Məmmədova" -> "LM"; one name -> one letter. Locale-aware upper-casing
// keeps Azerbaijani i/İ correct.
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}

// The name to greet someone by: the first word of their full name.
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

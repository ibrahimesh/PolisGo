import { useEffect, useRef, useState } from 'react';
import { CloseIcon, SearchIcon } from './icons';
import { Input } from './Input';

// Free-text search for a list whose filters live in the URL (the audit log,
// the System section's errors). Typing is debounced (300ms) before it
// reaches the URL; the URL stays the source of truth, so Back, a shared
// link and "Clear filters" all update the box. One clear button, Escape
// clears too; a text input in the searchbox role, because type="search"
// adds the browser's own X beside it.
export function SearchField({
  id,
  label,
  hint,
  placeholder,
  clearLabel,
  value,
  maxLength,
  onCommit,
  onTyping,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  clearLabel: string;
  value: string;
  maxLength: number;
  onCommit: (q: string) => void;
  // True while typed text waits for the debounce (lists show "Searching…").
  onTyping?: (typing: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  // The URL changed from elsewhere (Back, Clear filters): follow it.
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // What this field last sent. A URL change that isn't it came from
  // elsewhere, and a pending send must not bring the old text back.
  const sent = useRef(value);
  useEffect(() => {
    if (value !== sent.current) clearTimeout(timer.current);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => onTyping?.(draft.trim() !== committed.trim()), [draft, committed, onTyping]);

  const change = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      sent.current = next;
      setCommitted(next);
      onCommit(next);
    }, 300);
  };

  const clear = () => {
    clearTimeout(timer.current);
    setDraft('');
    sent.current = '';
    setCommitted('');
    onCommit('');
    inputRef.current?.focus();
  };

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      role="searchbox"
      enterKeyHint="search"
      label={label}
      hint={hint}
      placeholder={placeholder}
      value={draft}
      maxLength={maxLength}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => change(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && draft) {
          event.preventDefault();
          clear();
        }
      }}
      trailing={
        draft ? (
          <button
            type="button"
            onClick={clear}
            aria-label={clearLabel}
            className="grid size-10 place-items-center rounded-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
          >
            <CloseIcon />
          </button>
        ) : (
          <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
            <SearchIcon />
          </span>
        )
      }
    />
  );
}

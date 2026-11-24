import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui/cx';
import { CheckIcon, ChevronDownIcon, UserIcon } from '../../../components/ui/icons';
import { controlClasses } from '../../../components/ui/styles';
import { useDebouncedValue } from '../../../lib/hooks';
import { useStaffOptions } from '../queries';

interface Option {
  id: string;
  name: string;
  detail?: string;
}

// "Actor": who made the change. A WAI-ARIA editable combobox over the staff
// list, searched on the server (50 at a time), so a team of any size can be
// narrowed by typing. It looks and behaves like a picker (a person icon and
// a chevron, a list that opens), not like the page's free-text search above
// it, which it used to be confused with.
export function ActorCombobox({
  value,
  knownName,
  onChange,
}: {
  // The chosen user id, '' for anyone.
  value: string;
  // The chosen person's name when the page already knows it.
  knownName?: string | undefined;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // null while not typing: the field then shows the current choice.
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const term = useDebouncedValue((text ?? '').trim(), 300);
  const staff = useStaffOptions({ status: 'All', ...(term ? { search: term } : {}) });

  const items = staff.data?.items ?? [];
  const chosen = items.find((member) => member.id === value);
  const chosenName = value ? (chosen?.fullName ?? knownName ?? t('admin.picker.selected')) : '';
  const options: Option[] = [
    { id: '', name: t('admin.audit.anyone') },
    ...items.map((member) => ({
      id: member.id,
      name: member.fullName,
      detail: `${t(`roles.${member.role}`)} · ${member.email}`,
    })),
  ];
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;
  const total = staff.data?.totalCount ?? 0;
  const more = total > items.length;

  // Keep the active option visible however it moved.
  useLayoutEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from id, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const close = () => {
    setOpen(false);
    setText(null);
  };

  const choose = (option: Option) => {
    onChange(option.id);
    close();
  };

  const show = () => {
    const current = options.findIndex((option) => option.id === value);
    setActive(current >= 0 ? current : 0);
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open || event.altKey) show();
        else setActive(Math.min(activeIndex + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open) setActive(Math.max(activeIndex - 1, 0));
        break;
      case 'Home':
      case 'End':
        if (open) {
          event.preventDefault();
          setActive(event.key === 'Home' ? 0 : options.length - 1);
        }
        break;
      case 'Enter': {
        const option = options[activeIndex];
        if (open && option) {
          event.preventDefault();
          choose(option);
        }
        break;
      }
      case 'Escape':
        if (open || text !== null) {
          event.preventDefault();
          // Handled here so the page doesn't also react to it.
          event.stopPropagation();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {t('admin.audit.actor')}
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
          aria-hidden="true"
        >
          <UserIcon />
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? optionId(activeIndex) : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          value={text ?? chosenName}
          placeholder={t('admin.audit.anyone')}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={close}
          className={cx(controlClasses, 'pr-12 pl-10')}
        />
        {/* Mouse-only shortcut to open the list; keyboards use Alt+↓ (APG). */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('admin.audit.actorShow')}
          aria-controls={listId}
          aria-expanded={open}
          onMouseDown={(event) => {
            // Keep focus in the input, so it doesn't blur and close.
            event.preventDefault();
            if (open) close();
            else show();
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
        >
          <ChevronDownIcon />
        </button>

        <div
          hidden={!open}
          className="absolute top-full right-0 left-0 z-50 mt-1 origin-top animate-pop-in rounded-sm border border-line-strong bg-surface"
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={t('admin.audit.actor')}
            className="max-h-72 overflow-y-auto overscroll-contain py-1"
          >
            {options.map((option, index) => (
              // Options are reached through the combobox (aria-activedescendant).
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={option.id || 'anyone'}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(option)}
                className={cx(
                  'mx-1 flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-3 py-2',
                  index === activeIndex && 'bg-surface-2 shadow-[inset_2px_0_0_var(--pg-accent)]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{option.name}</span>
                  {option.detail && (
                    <span className="block truncate text-sm text-muted">{option.detail}</span>
                  )}
                </span>
                {option.id === value && (
                  <span className="shrink-0 text-accent">
                    <CheckIcon />
                    <span className="sr-only">{t('palette.current')}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {(more || (term && items.length === 0 && !staff.isFetching)) && (
            <p className="border-t border-line px-4 py-2 text-sm text-muted">
              {more
                ? t('admin.audit.actorMore', {
                    shown: items.length,
                    count: total,
                  })
                : t('admin.audit.actorNone')}
            </p>
          )}
        </div>
      </div>
      <p id={hintId} className="text-sm text-muted">
        {t('admin.audit.actorHint')}
      </p>
      {/* How many people the list holds, announced while it is open. */}
      <p className="sr-only" aria-live="polite">
        {open && staff.data ? t('admin.audit.actorResults', { count: staff.data.totalCount }) : ''}
      </p>
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { LANGUAGES } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { THEME_PREFERENCES } from '../../theme/ThemeProvider';
import { cx } from '../ui/cx';
import { SearchIcon } from '../ui/icons';
import { LANDING_SECTIONS } from './navigation';

interface Command {
  id: string;
  group: 'navigation' | 'language' | 'theme' | 'account';
  label: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// Ctrl/⌘+K command palette: WAI-ARIA combobox + listbox inside a native
// <dialog> (focus trap, Esc, inert page come from the platform).
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const { setPreference } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => void navigate(to);
    const list: Command[] = [
      { id: 'home', group: 'navigation', label: t('nav.home'), run: go('/') },
      ...LANDING_SECTIONS.map((section) => ({
        id: `section-${section}`,
        group: 'navigation' as const,
        label: t(`nav.${section}`),
        run: go(`/#${section}`),
      })),
      ...(status === 'authenticated'
        ? [
            {
              id: 'workspace',
              group: 'navigation' as const,
              label: t('nav.workspace'),
              run: go('/app'),
            },
          ]
        : [
            {
              id: 'login',
              group: 'navigation' as const,
              label: t('nav.signIn'),
              run: go('/login'),
            },
            {
              id: 'register',
              group: 'navigation' as const,
              label: t('nav.register'),
              run: go('/register'),
            },
          ]),
      ...LANGUAGES.map((lng) => ({
        id: `lang-${lng}`,
        group: 'language' as const,
        label: t(`language.${lng}`),
        keywords: `${lng} ${t('language.label')}`,
        run: () => void i18n.changeLanguage(lng),
      })),
      ...THEME_PREFERENCES.map((theme) => ({
        id: `theme-${theme}`,
        group: 'theme' as const,
        label: t(`theme.${theme}`),
        keywords: t('theme.label'),
        run: () => setPreference(theme),
      })),
    ];
    if (status === 'authenticated') {
      list.push({
        id: 'sign-out',
        group: 'account',
        label: t('nav.signOut'),
        run: () => {
          logout();
          void navigate('/');
        },
      });
    }
    return list;
  }, [t, i18n, navigate, status, logout, setPreference]);

  const needle = query.trim().toLowerCase();
  const results = needle
    ? commands.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(needle))
    : commands;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function close() {
    setQuery('');
    setActive(0);
    onClose();
  }

  function run(command: Command | undefined) {
    if (!command) return;
    close();
    command.run();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + results.length) % Math.max(results.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(results[activeIndex]);
    }
  }

  const optionId = (id: string) => `${listId}-${id}`;
  let lastGroup: Command['group'] | null = null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('palette.title')}
      onClose={close}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] rounded-sm border border-line-strong bg-surface p-0 text-text backdrop:bg-overlay"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <span className="text-muted">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            results[activeIndex] ? optionId(results[activeIndex].id) : undefined
          }
          aria-autocomplete="list"
          aria-label={t('palette.title')}
          placeholder={t('palette.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
        />
        <kbd className="rounded-sm border border-line px-2 text-sm text-muted">Esc</kbd>
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={t('palette.title')}
        className="max-h-96 overflow-y-auto py-2"
      >
        {results.length === 0 && <li className="px-4 py-4 text-muted">{t('palette.empty')}</li>}
        {results.map((command, index) => {
          const header = command.group !== lastGroup ? command.group : null;
          lastGroup = command.group;
          return (
            <li key={command.id} role="presentation">
              {header && (
                <p role="presentation" className="px-4 pt-3 pb-1 text-sm font-medium text-muted">
                  {t(`palette.groups.${header}`)}
                </p>
              )}
              <div
                id={optionId(command.id)}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') run(command);
                }}
                className={cx(
                  'mx-2 flex cursor-pointer items-center rounded-sm px-2 py-2',
                  index === activeIndex ? 'bg-surface-2 text-text' : 'text-text',
                )}
              >
                {command.label}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-4 py-3 text-sm text-muted">{t('palette.hint')}</p>
    </dialog>
  );
}

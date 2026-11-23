import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useRequestSignOut } from '../../auth/signOut';
import { SECTION_ICONS } from '../../features/cabinet/sectionIcons';
import { sectionsFor } from '../../features/workspace/sections';
import { currentLanguage, LANGUAGES } from '../../i18n';
import { setMotionPreference, useMotionPreference } from '../../settings/motion';
import { useSettings } from '../../settings/SettingsProvider';
import { THEME_PREFERENCES, useTheme } from '../../theme/ThemeProvider';
import { cx } from '../ui/cx';
import {
  ArrowRightIcon,
  CheckIcon,
  HomeIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
  SunIcon,
  SystemIcon,
  UserIcon,
} from '../ui/icons';
import { fuzzyMatch } from './fuzzy';
import { LANDING_SECTIONS } from './navigation';

type Group = 'recent' | 'pages' | 'actions' | 'language' | 'theme';
const GROUP_ORDER: readonly Group[] = ['recent', 'pages', 'actions', 'language', 'theme'];

interface Command {
  id: string;
  group: Exclude<Group, 'recent'>;
  label: string;
  keywords?: string;
  icon?: ComponentType;
  current?: boolean;
  lang?: string;
  run: () => void;
}

interface Item {
  key: string;
  group: Group;
  command: Command;
  indexes: readonly number[];
}

const RECENT_KEY = 'polisgo.palette.recent';
const RECENT_MAX = 5;
const PAGE_STEP = 8;

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function rememberRecent(id: string) {
  try {
    const next = [id, ...readRecent().filter((v) => v !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: the list just isn't remembered.
  }
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  // Where focus goes back to on close (the button that opened it).
  returnFocusTo?: RefObject<HTMLElement | null>;
}

// Ctrl/⌘+K command palette: a WAI-ARIA combobox with a grouped listbox in a
// native modal <dialog>. Focus stays on the input (Tab is held), the active
// option follows aria-activedescendant and is scrolled into view, and Esc or
// a backdrop click closes it and returns focus to the opener.
export function CommandPalette({ open, onClose, returnFocusTo }: CommandPaletteProps) {
  const { t } = useTranslation();
  const commands = useCommands();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecent);

  const items = useMemo(() => buildItems(commands, query, recent), [commands, query, recent]);
  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));
  const activeItem = items[activeIndex];
  const optionId = (key: string) => `${listId}-${key}`;

  const close = useCallback(() => {
    setQuery('');
    setActive(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        returnFocusTo?.current ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setRecent(readRecent());
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus({ preventScroll: true });
    }
  }, [open, returnFocusTo]);

  // Keep the active option visible however it moved (keys, typing, hover).
  useLayoutEffect(() => {
    if (!open || !activeItem) return;
    const element = document.getElementById(optionId(activeItem.key));
    element?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from listId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeItem]);

  function run(item: Item | undefined) {
    if (!item) return;
    rememberRecent(item.command.id);
    close();
    item.command.run();
  }

  function move(to: number) {
    if (items.length === 0) return;
    setActive(Math.max(0, Math.min(items.length - 1, to)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = items.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(activeIndex >= last ? 0 : activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(activeIndex <= 0 ? Math.max(last, 0) : activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(last);
        break;
      case 'PageDown':
        event.preventDefault();
        move(activeIndex + PAGE_STEP);
        break;
      case 'PageUp':
        event.preventDefault();
        move(activeIndex - PAGE_STEP);
        break;
      case 'Enter':
        event.preventDefault();
        run(activeItem);
        break;
      case 'Escape':
        // Handled here, not only by the dialog's cancel event, which a
        // browser may skip (close-watcher rules) or route elsewhere.
        event.preventDefault();
        close();
        break;
      case 'Tab':
        // The input is the palette's only stop; keep focus inside.
        event.preventDefault();
        break;
    }
  }

  let lastGroup: Group | null = null;
  const groups: { group: Group; items: { item: Item; index: number }[] }[] = [];
  items.forEach((item, index) => {
    if (item.group !== lastGroup) groups.push({ group: item.group, items: [] });
    lastGroup = item.group;
    groups[groups.length - 1]?.items.push({ item, index });
  });

  // The backdrop click is a mouse-only convenience; Esc covers keyboards.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      aria-label={t('palette.title')}
      data-testid="command-palette"
      onClose={() => {
        if (open) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] dialog-in rounded-sm border border-line-strong bg-surface p-0 text-text shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] backdrop:bg-overlay"
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
          aria-activedescendant={activeItem ? optionId(activeItem.key) : undefined}
          aria-autocomplete="list"
          aria-label={t('palette.title')}
          placeholder={t('palette.placeholder')}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted"
        />
        <kbd className="hidden rounded-sm border border-line px-2 text-sm text-muted sm:inline">
          Esc
        </kbd>
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={t('palette.title')}
        className="max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain py-2"
      >
        {groups.map(({ group, items: groupItems }) => {
          const headerId = `${listId}-group-${group}`;
          return (
            <div key={group} role="group" aria-labelledby={headerId} className="pb-1">
              <div
                id={headerId}
                role="presentation"
                className="px-4 pt-3 pb-1 text-sm font-medium text-muted"
              >
                {t(`palette.groups.${group}`)}
              </div>
              {groupItems.map(({ item, index }) => (
                <Option
                  key={item.key}
                  id={optionId(item.key)}
                  item={item}
                  active={index === activeIndex}
                  onHover={() => setActive(index)}
                  onRun={() => run(item)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div role="status" className="space-y-1 px-4 pt-2 pb-6">
          <p className="text-text">{t('palette.emptyTitle', { query: query.trim() })}</p>
          <p className="text-sm text-muted">{t('palette.emptyHint')}</p>
        </div>
      )}

      <div
        aria-hidden="true"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-sm text-muted"
      >
        <Hint keys={['↑', '↓']}>{t('palette.keys.move')}</Hint>
        <Hint keys={['↵']}>{t('palette.keys.run')}</Hint>
        <Hint keys={['Home', 'End']}>{t('palette.keys.ends')}</Hint>
        <Hint keys={['Esc']}>{t('palette.keys.close')}</Hint>
      </div>
      {/* The same hints for screen readers, once, in words. */}
      <p className="sr-only">{t('palette.hint')}</p>
    </dialog>
  );
}

function Hint({ keys, children }: { keys: readonly string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {keys.map((key) => (
        <kbd key={key} className="rounded-sm border border-line px-1.5 font-sans">
          {key}
        </kbd>
      ))}
      <span className="ml-1">{children}</span>
    </span>
  );
}

function Option({
  id,
  item,
  active,
  onHover,
  onRun,
}: {
  id: string;
  item: Item;
  active: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const { command } = item;
  const Icon = command.icon;
  // Options are reached through the combobox (aria-activedescendant), so
  // they take clicks only; Enter is handled on the input.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onRun}
      className={cx(
        'mx-2 flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 py-2',
        // The accent edge marks the active row without relying on the fill.
        active ? 'bg-surface-2 text-text shadow-[inset_2px_0_0_var(--pg-accent)]' : 'text-text',
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center text-muted" aria-hidden="true">
        {Icon ? <Icon /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate" lang={command.lang}>
        <Highlighted text={command.label} indexes={item.indexes} />
      </span>
      {command.current && (
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <CheckIcon />
          <span className="sr-only">{t('palette.current')}</span>
        </span>
      )}
      <kbd
        aria-hidden="true"
        className={cx(
          'rounded-sm border border-line px-1.5 font-sans text-sm text-muted',
          !active && 'invisible',
        )}
      >
        ↵
      </kbd>
    </div>
  );
}

// Matched characters in the accent, bold; the rest as is. Not colour alone:
// weight changes too.
function Highlighted({ text, indexes }: { text: string; indexes: readonly number[] }) {
  if (indexes.length === 0) return <>{text}</>;
  const marks = new Set(indexes);
  const parts: { text: string; mark: boolean }[] = [];
  Array.from(text).forEach((char, i) => {
    const mark = marks.has(i);
    const last = parts[parts.length - 1];
    if (last && last.mark === mark) last.text += char;
    else parts.push({ text: char, mark });
  });
  return (
    <>
      {parts.map((part, i) =>
        part.mark ? (
          <mark key={i} className="bg-transparent font-semibold text-accent">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function buildItems(commands: readonly Command[], query: string, recent: readonly string[]) {
  const needle = query.trim();
  if (!needle) {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const recentItems: Item[] = recent.flatMap((id) => {
      const command = byId.get(id);
      return command
        ? [{ key: `recent-${id}`, group: 'recent' as const, command, indexes: [] }]
        : [];
    });
    const rest = GROUP_ORDER.flatMap((group) =>
      commands
        .filter((c) => c.group === group)
        .map((command) => ({ key: command.id, group, command, indexes: [] as number[] })),
    );
    return [...recentItems, ...rest];
  }

  const scored = commands.flatMap((command) => {
    const onLabel = fuzzyMatch(needle, command.label);
    const onKeywords = command.keywords ? fuzzyMatch(needle, command.keywords) : null;
    if (!onLabel && !onKeywords) return [];
    // A label match outranks a keyword-only one and is highlighted.
    const score = Math.max(onLabel ? onLabel.score + 1 : -Infinity, onKeywords?.score ?? -Infinity);
    return [{ command, score, indexes: onLabel?.indexes ?? [] }];
  });
  // Groups keep their order of first appearance by best score.
  const groupBest = new Map<Group, number>();
  for (const s of scored) {
    groupBest.set(s.command.group, Math.max(groupBest.get(s.command.group) ?? -Infinity, s.score));
  }
  return [...scored]
    .sort(
      (a, b) =>
        (groupBest.get(b.command.group) ?? 0) - (groupBest.get(a.command.group) ?? 0) ||
        GROUP_ORDER.indexOf(a.command.group) - GROUP_ORDER.indexOf(b.command.group) ||
        b.score - a.score,
    )
    .map((s) => ({
      key: s.command.id,
      group: s.command.group,
      command: s.command,
      indexes: s.indexes,
    }));
}

const THEME_ICONS = { dark: MoonIcon, light: SunIcon, system: SystemIcon } as const;

// Everything the palette can do for this visitor. Staff get their desks'
// pages (sections.ts decides, as for the sidebar and the route guards).
function useCommands(): Command[] {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, user } = useAuth();
  const signOut = useRequestSignOut();
  const { openSettings } = useSettings();
  const { preference, setPreference } = useTheme();
  const motion = useMotionPreference();
  const language = currentLanguage();

  return useMemo(() => {
    const go = (to: string) => () => void navigate(to);
    const authed = status === 'authenticated' && user;
    const pages: Command[] = [
      { id: 'home', group: 'pages', label: t('nav.home'), icon: HomeIcon, run: go('/') },
      ...LANDING_SECTIONS.map((section) => ({
        id: `section-${section}`,
        group: 'pages' as const,
        label: t(`nav.${section}`),
        // The section's id and its short header name find it too ("faq").
        keywords: `${section} ${t(`nav.short.${section}`)}`,
        icon: ArrowRightIcon,
        run: go(`/#${section}`),
      })),
      ...(authed
        ? sectionsFor(user.role).map((section) => ({
            id: `cabinet-${section.id}`,
            group: 'pages' as const,
            label: t(`workspace.sections.${section.id}`),
            keywords: t('nav.workspace'),
            icon: SECTION_ICONS[section.id],
            run: go(section.path),
          }))
        : [
            {
              id: 'login',
              group: 'pages' as const,
              label: t('nav.signIn'),
              icon: UserIcon,
              run: go('/login'),
            },
            {
              id: 'register',
              group: 'pages' as const,
              label: t('nav.register'),
              icon: UserIcon,
              run: go('/register'),
            },
          ]),
    ];

    const actions: Command[] = [
      {
        id: 'open-settings',
        group: 'actions',
        label: t('palette.actions.settings'),
        keywords: `${t('settings.appearance')} ${t('settings.language')} ${t('settings.motion')}`,
        icon: SettingsIcon,
        run: openSettings,
      },
      {
        id: 'toggle-motion',
        group: 'actions',
        label: motion === 'reduce' ? t('palette.actions.motionOff') : t('palette.actions.motionOn'),
        keywords: t('settings.reduceMotion'),
        icon: SettingsIcon,
        run: () => setMotionPreference(motion === 'reduce' ? 'system' : 'reduce'),
      },
      ...(authed
        ? [
            {
              id: 'sign-out',
              group: 'actions' as const,
              label: t('nav.signOut'),
              icon: SignOutIcon,
              run: signOut,
            },
          ]
        : []),
    ];

    const languages: Command[] = LANGUAGES.map((lng) => ({
      id: `lang-${lng}`,
      group: 'language',
      label: t(`language.${lng}`),
      keywords: `${lng} ${t('language.label')}`,
      lang: lng,
      current: lng === language,
      run: () => void i18n.changeLanguage(lng),
    }));

    const themes: Command[] = THEME_PREFERENCES.map((theme) => ({
      id: `theme-${theme}`,
      group: 'theme',
      label: t(`theme.${theme}`),
      keywords: t('theme.label'),
      icon: THEME_ICONS[theme],
      current: theme === preference,
      run: () => setPreference(theme),
    }));

    return [...pages, ...actions, ...languages, ...themes];
  }, [
    t,
    i18n,
    navigate,
    status,
    user,
    signOut,
    openSettings,
    preference,
    setPreference,
    motion,
    language,
  ]);
}

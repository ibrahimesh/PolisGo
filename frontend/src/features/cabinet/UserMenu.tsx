import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useRequestSignOut } from '../../auth/signOut';
import { Badge } from '../../components/ui/Badge';
import { ChevronDownIcon, HelpIcon, SignOutIcon, UserIcon } from '../../components/ui/icons';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { initials } from '../../lib/names';
import { usePopover } from './usePopover';

const itemClass =
  'flex min-h-10 items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-text transition-colors duration-150 hover:bg-surface-2';

export function UserMenu() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const signOut = useRequestSignOut();
  const popover = usePopover();
  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        {...popover.buttonProps}
        onClick={popover.toggle}
        // Starts with the visible name (WCAG 2.5.3): "Leyla Məmmədova, account menu".
        aria-label={`${user.fullName}, ${t('cabinet.accountMenu')}`}
        className="flex h-9 items-center gap-2 rounded-sm border border-line pr-2 pl-1 text-sm text-text transition-colors hover:bg-surface-2"
      >
        {/* Initials as generated content, not text: decoration that would
            otherwise count as visible text missing from the name. */}
        <span
          aria-hidden="true"
          data-initials={initials(user.fullName)}
          className="grid size-7 place-items-center rounded-sm bg-surface-2 text-sm font-medium after:content-[attr(data-initials)]"
        />
        <span className="hidden max-w-40 truncate font-medium md:inline">{user.fullName}</span>
        <ChevronDownIcon />
      </button>

      <div
        {...popover.panelProps}
        className="absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-sm border border-line-strong bg-surface"
      >
        <div className="space-y-2 border-b border-line px-4 py-4">
          <p className="text-sm text-muted">{t('cabinet.signedInAs')}</p>
          <p className="font-medium break-words">{user.fullName}</p>
          <p className="text-sm break-all text-muted">{user.email}</p>
          <Badge>{t(`roles.${user.role}`)}</Badge>
        </div>

        <div className="space-y-1 p-2">
          <Link to="/app/profile" className={itemClass}>
            <UserIcon />
            {t('workspace.sections.profile')}
          </Link>
          <Link to="/app/help" className={itemClass}>
            <HelpIcon />
            {t('workspace.sections.help')}
          </Link>
          <Link to="/" className={itemClass}>
            <span className="size-4" aria-hidden="true" />
            {t('cabinet.backToSite')}
          </Link>
        </div>

        {/* Below xl the header has no room for these; the menu carries them. */}
        <div
          role="group"
          aria-label={t('nav.settings')}
          className="flex flex-wrap gap-3 border-t border-line px-4 py-4 xl:hidden"
        >
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="border-t border-line p-2">
          <button type="button" onClick={signOut} className={`${itemClass} w-full`}>
            <SignOutIcon />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}

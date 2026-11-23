import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { ArrowLeftIcon } from '../../components/ui/icons';
import { ReferenceChip } from '../../components/ui/ReferenceChip';
import { ErrorGlyph } from './ErrorGlyph';
import type { ErrorKind } from './errorKind';

type Action = 'back' | 'home' | 'reload' | 'retry' | 'signIn';

const DEFAULT_ACTIONS: Record<ErrorKind, readonly Action[]> = {
  notFound: ['back', 'home'],
  forbidden: ['back', 'home'],
  server: ['reload', 'home'],
  sessionExpired: ['signIn', 'home'],
  offline: ['reload', 'back'],
  unreachable: ['reload', 'home'],
  maintenance: ['reload', 'home'],
};

interface ErrorPageProps {
  kind: ErrorKind;
  traceId?: string | undefined;
  // Replaces the kind's default text (e.g. the 403 names the role).
  body?: ReactNode;
  onRetry?: () => void;
  // Development only: the thrown error's message, never its stack.
  detail?: string | undefined;
  // Rendered without a shell (the route guard): "home" is the site, since
  // the workspace is the very thing that failed to open.
  standalone?: boolean;
}

// The designed page for anything that stops a screen: what happened in plain
// words, the server reference when there is one, and a way on. Inside the
// cabinet it uses the signed-in page scale (40px h1); on public pages the
// section scale. Production never shows stack traces or internals.
export function ErrorPage({
  kind,
  traceId,
  body,
  onRetry,
  detail,
  standalone = false,
}: ErrorPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const inCabinet = !standalone && location.pathname.startsWith('/app');
  const home = inCabinet ? '/app' : '/';
  const actions = DEFAULT_ACTIONS[kind]
    .map((action) => (action === 'reload' && onRetry ? 'retry' : action))
    // Back only when there is somewhere to go back to.
    .filter((action) => action !== 'back' || window.history.length > 1);
  const accent = t(`errorPages.${kind}.accent`, { defaultValue: '' });

  const buttons: Record<Action, ReactNode> = {
    back: (
      <Button key="back" variant="ghost" onClick={() => void navigate(-1)}>
        <ArrowLeftIcon />
        {t('errorPages.actions.back')}
      </Button>
    ),
    home: (
      <ButtonLink key="home" to={home} variant="secondary">
        {inCabinet ? t('errorPages.actions.workspace') : t('errorPages.actions.home')}
      </ButtonLink>
    ),
    reload: (
      <Button key="reload" onClick={() => window.location.reload()}>
        {t('errorPages.actions.reload')}
      </Button>
    ),
    retry: (
      <Button key="retry" onClick={onRetry}>
        {t('errorPages.actions.retry')}
      </Button>
    ),
    signIn: (
      <ButtonLink key="signIn" to="/login" state={{ from: location.pathname + location.search }}>
        {t('errorPages.actions.signIn')}
      </ButtonLink>
    ),
  };

  return (
    <section
      aria-labelledby="error-title"
      data-error-kind={kind}
      className={cx(
        'grid items-start gap-8 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-10',
        inCabinet ? 'py-8' : 'mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28',
      )}
    >
      <ErrorGlyph kind={kind} />
      <div className="max-w-2xl space-y-6">
        <p className="text-sm font-medium text-muted">{t(`errorPages.${kind}.label`)}</p>
        <h1
          id="error-title"
          tabIndex={-1}
          className={cx(
            'tracking-[-0.02em] outline-none',
            inCabinet ? 'text-xl sm:text-2xl' : 'text-2xl lg:text-3xl',
          )}
        >
          {t(`errorPages.${kind}.title`)}
          {accent && (
            <>
              {' '}
              <em className="text-accent">{accent}</em>
            </>
          )}
        </h1>
        <p className="text-lg text-muted">{body ?? t(`errorPages.${kind}.body`)}</p>
        {traceId && <ReferenceChip traceId={traceId} />}
        <div className="flex flex-wrap gap-3">{actions.map((action) => buttons[action])}</div>
        {import.meta.env.DEV && detail && (
          <details className="rounded-sm border border-line p-4 text-sm text-muted">
            <summary className="cursor-pointer">{t('errorPages.devDetail')}</summary>
            <p className="mt-2 break-words">{detail}</p>
          </details>
        )}
      </div>
    </section>
  );
}

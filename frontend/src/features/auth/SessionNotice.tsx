import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastProvider';

// Shown on /login and /register instead of the form while a stored session is
// being verified, or once one is active. The old behaviour (render the form,
// then silently redirect when /me resolved) let someone type credentials and
// land in a previous user's workspace.
export function SessionNotice() {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const { toast } = useToast();

  if (status === 'loading') {
    return (
      <div aria-busy="true" className="space-y-4">
        <p role="status" className="text-muted">
          {t('auth.checking')}
        </p>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) return null;

  return (
    <div role="status" className="space-y-6 rounded-sm border border-line p-6">
      <div className="space-y-2">
        <h2 className="text-2xl">{t('auth.alreadySignedIn.title')}</h2>
        <p className="text-muted">
          {t('auth.alreadySignedIn.body', { name: user.fullName, email: user.email })}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/app">{t('auth.alreadySignedIn.continue')}</ButtonLink>
        <Button
          variant="secondary"
          onClick={() => {
            logout();
            toast({ title: t('auth.signedOut'), tone: 'info' });
          }}
        >
          {t('auth.alreadySignedIn.signOut')}
        </Button>
      </div>
    </div>
  );
}

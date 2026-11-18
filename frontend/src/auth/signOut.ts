import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from './AuthContext';

// Sign-out is two steps: leave for the home page, then drop the session once
// that route has committed. Clearing first would re-render the protected
// route's guard while it is still mounted and bounce the user to /login. The
// intent travels in navigation state so that whichever layout renders "/"
// finishes the job, even though the cabinet layout unmounts on the way.
interface SignOutState {
  signOut?: boolean;
}

export function useRequestSignOut(): () => void {
  const navigate = useNavigate();
  return () => void navigate('/', { state: { signOut: true } satisfies SignOutState });
}

// Mounted once, in the public layout that renders "/".
export function useCompleteSignOut() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const requested = (location.state as SignOutState | null)?.signOut === true;
  // One sign-out per navigation: StrictMode (and any re-render before the
  // state is cleared) re-runs the effect, which showed the toast twice.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!requested || handled.current === location.key) return;
    handled.current = location.key;
    logout();
    toast({ title: t('auth.signedOut'), tone: 'info' });
    // Drop the flag so Back/Forward or a re-render can't sign out again.
    void navigate(location.pathname + location.hash, { replace: true, state: null });
  }, [requested, logout, toast, t, navigate, location.pathname, location.hash, location.key]);
}

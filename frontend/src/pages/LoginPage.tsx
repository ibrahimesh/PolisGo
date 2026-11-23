import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import type { LoginRedirectState } from '../auth/RequireAuth';
import { Button } from '../components/ui/Button';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { FormErrorSummary } from '../components/ui/FormErrorSummary';
import type { SummaryField } from '../components/ui/FormErrorSummary';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/ToastProvider';
import { applyServerFieldErrors, safeReturnPath } from '../features/auth/applyServerErrors';
import { AuthLayout } from '../features/auth/AuthLayout';
import { loginSchema } from '../features/auth/authSchemas';
import type { LoginInput, LoginValues } from '../features/auth/authSchemas';
import { PasswordField } from '../features/auth/PasswordField';
import { SessionNotice } from '../features/auth/SessionNotice';

const ID = { email: 'login-email', password: 'login-password' } as const;

export function LoginPage() {
  const { t } = useTranslation();
  const { status, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = safeReturnPath((location.state as LoginRedirectState | null)?.from);
  const [submitError, setSubmitError] = useState<unknown>(null);
  // Set while our own sign-in is in flight, so the "already signed in" notice
  // doesn't flash between success and navigation.
  const [signingIn, setSigningIn] = useState(false);

  const { register, handleSubmit, setError, setFocus, formState } = useForm<
    LoginInput,
    unknown,
    LoginValues
  >({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const fields: SummaryField<LoginInput>[] = [
    { name: 'email', id: ID.email, label: t('auth.fields.email') },
    { name: 'password', id: ID.password, label: t('auth.fields.password') },
  ];

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSigningIn(true);
    try {
      const user = await login(values);
      toast({ title: t('auth.login.success', { name: user.fullName }), tone: 'success' });
      await navigate(returnTo, { replace: true });
    } catch (error) {
      setSigningIn(false);
      const matched = applyServerFieldErrors(error, ['email', 'password'], setError);
      if (matched[0]) setFocus(matched[0]);
      else setSubmitError(error);
    }
  });

  const { errors, isSubmitting, submitCount } = formState;
  const showForm = signingIn || status === 'anonymous' || status === 'error';

  return (
    <AuthLayout
      label={t('auth.login.label')}
      lead={t('auth.login.titleLead')}
      accent={t('auth.login.titleAccent')}
      intro={t('auth.login.lead')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-accent underline underline-offset-4">
            {t('auth.login.registerLink')}
          </Link>
        </>
      }
    >
      {!showForm ? (
        <SessionNotice />
      ) : (
        <form
          noValidate
          aria-labelledby="auth-title"
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-6"
        >
          <FormErrorSummary errors={errors} fields={fields} show={submitCount > 0} />
          {submitError !== null && (
            <ErrorNotice
              error={submitError}
              overrides={{ 401: 'errors.invalidCredentials' }}
              shake
            />
          )}
          <Input
            id={ID.email}
            label={t('auth.fields.email')}
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <PasswordField
            id={ID.password}
            label={t('auth.fields.password')}
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
            {t('auth.login.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

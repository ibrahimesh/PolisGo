import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import type { LoginRedirectState } from '../auth/RequireAuth';
import { Button } from '../components/ui/Button';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/ToastProvider';
import { applyServerFieldErrors } from '../features/auth/applyServerErrors';
import { AuthLayout } from '../features/auth/AuthLayout';
import { loginSchema } from '../features/auth/authSchemas';
import type { LoginValues } from '../features/auth/authSchemas';
import { PasswordInput } from '../features/auth/PasswordInput';

export function LoginPage() {
  const { t } = useTranslation();
  const { status, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LoginRedirectState | null)?.from ?? '/app';
  const [submitError, setSubmitError] = useState<unknown>(null);

  const { register, handleSubmit, setError, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const user = await login(values);
      toast({ title: t('auth.login.success', { name: user.fullName }), tone: 'success' });
      await navigate(from, { replace: true });
    } catch (error) {
      if (!applyServerFieldErrors(error, ['email', 'password'], setError)) setSubmitError(error);
    }
  });

  const { errors, isSubmitting } = formState;

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
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        {submitError !== null && (
          <ErrorNotice error={submitError} overrides={{ 401: 'errors.invalidCredentials' }} />
        )}
        <Input
          label={t('auth.fields.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label={t('auth.fields.password')}
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

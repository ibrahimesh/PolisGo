import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/ToastProvider';
import { applyServerFieldErrors } from '../features/auth/applyServerErrors';
import { AuthLayout } from '../features/auth/AuthLayout';
import { createRegisterSchema } from '../features/auth/authSchemas';
import type { RegisterValues } from '../features/auth/authSchemas';
import { PasswordInput } from '../features/auth/PasswordInput';

const FIELDS = [
  'fullName',
  'email',
  'phone',
  'birthDate',
  'drivingLicenseDate',
  'password',
] as const satisfies readonly (keyof RegisterValues)[];

export function RegisterPage() {
  const { t } = useTranslation();
  const { status, register: registerAccount } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const schema = useMemo(() => createRegisterSchema(), []);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const { register, handleSubmit, setError, formState } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      birthDate: '',
      drivingLicenseDate: '',
      password: '',
    },
  });

  if (status === 'authenticated') return <Navigate to="/app" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const user = await registerAccount(values);
      toast({ title: t('auth.register.success', { name: user.fullName }), tone: 'success' });
      await navigate('/app', { replace: true });
    } catch (error) {
      if (!applyServerFieldErrors(error, FIELDS, setError)) setSubmitError(error);
    }
  });

  const { errors, isSubmitting } = formState;

  return (
    <AuthLayout
      label={t('auth.register.label')}
      lead={t('auth.register.titleLead')}
      accent={t('auth.register.titleAccent')}
      intro={t('auth.register.lead')}
      footer={
        <>
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="text-accent underline underline-offset-4">
            {t('auth.register.loginLink')}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        {submitError !== null && <ErrorNotice error={submitError} />}
        <Input
          label={t('auth.fields.fullName')}
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            label={t('auth.fields.email')}
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label={t('auth.fields.phone')}
            type="tel"
            autoComplete="tel"
            hint={t('auth.fields.phoneHint')}
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            label={t('auth.fields.birthDate')}
            type="date"
            autoComplete="bday"
            error={errors.birthDate?.message}
            {...register('birthDate', { deps: ['drivingLicenseDate'] })}
          />
          <Input
            label={t('auth.fields.licenceDate')}
            type="date"
            error={errors.drivingLicenseDate?.message}
            {...register('drivingLicenseDate')}
          />
        </div>
        <PasswordInput
          label={t('auth.fields.password')}
          autoComplete="new-password"
          hint={t('auth.fields.passwordHint')}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
          {t('auth.register.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

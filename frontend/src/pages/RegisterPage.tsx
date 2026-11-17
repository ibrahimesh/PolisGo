import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { FormErrorSummary } from '../components/ui/FormErrorSummary';
import type { SummaryField } from '../components/ui/FormErrorSummary';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/ToastProvider';
import { applyServerFieldErrors } from '../features/auth/applyServerErrors';
import { AuthLayout } from '../features/auth/AuthLayout';
import { birthDateBounds, createRegisterSchema } from '../features/auth/authSchemas';
import type { RegisterInput, RegisterValues } from '../features/auth/authSchemas';
import { PasswordField } from '../features/auth/PasswordField';
import { PhoneInput } from '../features/auth/PhoneInput';
import { SessionNotice } from '../features/auth/SessionNotice';
import { useLinkedValidation } from '../features/auth/useLinkedValidation';
import { todayIso } from '../lib/dates';

const FIELD_ORDER = [
  'fullName',
  'email',
  'phone',
  'birthDate',
  'drivingLicenseDate',
  'password',
  'confirmPassword',
] as const satisfies readonly (keyof RegisterInput)[];

const id = (field: (typeof FIELD_ORDER)[number]) => `register-${field}`;

export function RegisterPage() {
  const { t } = useTranslation();
  const { status, register: registerAccount } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const schema = useMemo(() => createRegisterSchema(), []);
  const birthBounds = useMemo(() => birthDateBounds(), []);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [registering, setRegistering] = useState(false);

  const { register, control, handleSubmit, setError, setFocus, trigger, getFieldState, formState } =
    useForm<RegisterInput, unknown, RegisterValues>({
      resolver: zodResolver(schema),
      mode: 'onTouched',
      defaultValues: {
        fullName: '',
        email: '',
        phone: '',
        birthDate: '',
        drivingLicenseDate: '',
        password: '',
        confirmPassword: '',
      },
    });
  const password = useWatch({ control, name: 'password' });
  useLinkedValidation(control, trigger, getFieldState, 'password', 'confirmPassword');
  useLinkedValidation(control, trigger, getFieldState, 'birthDate', 'drivingLicenseDate');

  const labels: Record<(typeof FIELD_ORDER)[number], string> = {
    fullName: t('auth.fields.fullName'),
    email: t('auth.fields.email'),
    phone: t('auth.fields.phone'),
    birthDate: t('auth.fields.birthDate'),
    drivingLicenseDate: t('auth.fields.licenceDate'),
    password: t('auth.fields.password'),
    confirmPassword: t('auth.fields.confirmPassword'),
  };
  const summaryFields: SummaryField<RegisterInput>[] = FIELD_ORDER.map((name) => ({
    name,
    id: id(name),
    label: labels[name],
  }));

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setRegistering(true);
    try {
      // Explicit payload: the confirmation never leaves the browser.
      const user = await registerAccount({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        birthDate: values.birthDate,
        drivingLicenseDate: values.drivingLicenseDate,
        password: values.password,
      });
      toast({ title: t('auth.register.success', { name: user.fullName }), tone: 'success' });
      await navigate('/app', { replace: true });
    } catch (error) {
      setRegistering(false);
      const matched = applyServerFieldErrors(error, FIELD_ORDER, setError);
      if (matched[0]) setFocus(matched[0]);
      else setSubmitError(error);
    }
  });

  const { errors, isSubmitting, submitCount } = formState;
  const showForm = registering || status === 'anonymous' || status === 'error';

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
      {!showForm ? (
        <SessionNotice />
      ) : (
        <form
          noValidate
          aria-labelledby="auth-title"
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-6"
        >
          <FormErrorSummary errors={errors} fields={summaryFields} show={submitCount > 0} />
          {submitError !== null && <ErrorNotice error={submitError} />}
          <Input
            id={id('fullName')}
            label={labels.fullName}
            autoComplete="name"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Input
              id={id('email')}
              label={labels.email}
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field, fieldState }) => (
                <PhoneInput
                  id={id('phone')}
                  label={labels.phone}
                  hint={t('auth.fields.phoneHint')}
                  error={fieldState.error?.message}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Input
              id={id('birthDate')}
              label={labels.birthDate}
              type="date"
              autoComplete="bday"
              min={birthBounds.min}
              max={birthBounds.max}
              error={errors.birthDate?.message}
              {...register('birthDate')}
            />
            <Input
              id={id('drivingLicenseDate')}
              label={labels.drivingLicenseDate}
              type="date"
              max={todayIso()}
              error={errors.drivingLicenseDate?.message}
              {...register('drivingLicenseDate')}
            />
          </div>
          <PasswordField
            id={id('password')}
            label={labels.password}
            autoComplete="new-password"
            policyValue={password}
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordField
            id={id('confirmPassword')}
            label={labels.confirmPassword}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
            {t('auth.register.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

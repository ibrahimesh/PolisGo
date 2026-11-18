import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { profileApi } from '../../api/endpoints';
import type { ProfileResponse } from '../../api/types';
import { ME_QUERY_KEY } from '../../auth/AuthProvider';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../components/ui/FormErrorSummary';
import { Input } from '../../components/ui/Input';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Skeleton } from '../../components/ui/Skeleton';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { useToast } from '../../components/ui/ToastProvider';
import { useFormatters } from '../../i18n/format';
import { useExclusive } from '../../lib/hooks';
import { applyServerFieldErrors } from '../auth/applyServerErrors';
import { PasswordField } from '../auth/PasswordField';
import { PhoneInput } from '../auth/PhoneInput';
import { useLinkedValidation } from '../auth/useLinkedValidation';
import { formatAzPhone, toNationalDigits } from '../auth/validation';
import { cabinetKeys, useProfile } from '../cabinet/queries';
import { createProfileSchema, passwordSchema } from './profileSchemas';
import type { PasswordInput, ProfileInput, ProfileValues } from './profileSchemas';

export function ProfilePage() {
  const { t } = useTranslation();
  const profile = useProfile();

  return (
    <div className="space-y-12">
      <PageHeader title={t('profile.title')} description={t('profile.lead')} />
      {profile.isPending ? (
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only" role="status">
            {t('common.loading')}
          </span>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full max-w-2xl" />
        </div>
      ) : profile.isError ? (
        <ErrorNotice
          error={profile.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void profile.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <>
          {/* Keyed so the form resets to the saved values after an update. */}
          <DetailsForm key={profile.dataUpdatedAt} profile={profile.data} />
          <PasswordForm />
          <Preferences />
        </>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-6 border-t border-line pt-10 first-of-type:border-t-0 first-of-type:pt-0 lg:grid-cols-12"
    >
      <div className="space-y-2 lg:col-span-4">
        <h2 id={id} className="text-xl">
          {title}
        </h2>
        {lead && <p className="text-sm text-muted">{lead}</p>}
      </div>
      <div className="max-w-2xl lg:col-span-8">{children}</div>
    </section>
  );
}

const DETAIL_FIELDS = ['fullName', 'phone'] as const;

function DetailsForm({ profile }: { profile: ProfileResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const exclusive = useExclusive();
  const hasPhone = profile.phone !== null;
  const schema = useMemo(() => createProfileSchema(hasPhone), [hasPhone]);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const { register, control, handleSubmit, setError, setFocus, formState } = useForm<
    ProfileInput,
    unknown,
    ProfileValues
  >({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      fullName: profile.fullName,
      phone: profile.phone ? formatAzPhone(toNationalDigits(profile.phone)) : '',
    },
  });

  const labels = { fullName: t('auth.fields.fullName'), phone: t('auth.fields.phone') };
  const summary: SummaryField<ProfileInput>[] = DETAIL_FIELDS.filter(
    (f) => f !== 'phone' || hasPhone,
  ).map((name) => ({ name, id: `profile-${name}`, label: labels[name] }));

  const onSubmit = handleSubmit((values) =>
    exclusive(async () => {
      setSubmitError(null);
      try {
        await profileApi.update(values);
        // The header and greeting read the name from /api/auth/me.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: cabinetKeys.profile() }),
          queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
        ]);
        toast({ title: t('profile.saved'), tone: 'success' });
      } catch (error) {
        const matched = applyServerFieldErrors(error, DETAIL_FIELDS, setError);
        if (matched[0]) setFocus(matched[0]);
        else setSubmitError(error);
      }
    }),
  );

  const { errors, isSubmitting, isDirty, submitCount } = formState;

  return (
    <Section id="details-title" title={t('profile.details')} lead={t('profile.detailsLead')}>
      <form
        noValidate
        aria-labelledby="details-title"
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-6"
      >
        <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
        {submitError !== null && <ErrorNotice error={submitError} />}
        <Input
          id="profile-fullName"
          label={labels.fullName}
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        {hasPhone && (
          <Controller
            control={control}
            name="phone"
            render={({ field, fieldState }) => (
              <PhoneInput
                id="profile-phone"
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
        )}
        {/* Not editable here: the login, and the data the premium is priced from. */}
        <dl className="divide-y divide-line border-y border-line">
          <ReadOnly label={t('auth.fields.email')} value={profile.email} />
          {profile.birthDate && (
            <ReadOnly label={t('auth.fields.birthDate')} value={format.date(profile.birthDate)} />
          )}
          {profile.drivingLicenseDate && (
            <ReadOnly
              label={t('auth.fields.licenceDate')}
              value={format.date(profile.drivingLicenseDate)}
            />
          )}
        </dl>
        <p className="text-sm text-muted">{t('profile.readOnlyNote')}</p>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          {t('profile.save')}
        </Button>
      </form>
    </Section>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="break-all tabular">{value}</dd>
    </div>
  );
}

const PASSWORD_FIELDS = ['currentPassword', 'newPassword', 'confirmPassword'] as const;

function PasswordForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const exclusive = useExclusive();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    reset,
    trigger,
    getFieldState,
    formState,
  } = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control, name: 'newPassword' });
  useLinkedValidation(control, trigger, getFieldState, 'newPassword', 'confirmPassword');

  const labels = {
    currentPassword: t('profile.currentPassword'),
    newPassword: t('profile.newPassword'),
    confirmPassword: t('auth.fields.confirmPassword'),
  };
  const summary: SummaryField<PasswordInput>[] = PASSWORD_FIELDS.map((name) => ({
    name,
    id: `password-${name}`,
    label: labels[name],
  }));

  const onSubmit = handleSubmit((values) =>
    exclusive(async () => {
      setSubmitError(null);
      try {
        // The confirmation never leaves the browser.
        await profileApi.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
        reset();
        toast({ title: t('profile.passwordChanged'), tone: 'success' });
      } catch (error) {
        const matched = applyServerFieldErrors(error, PASSWORD_FIELDS, setError);
        if (matched[0]) setFocus(matched[0]);
        else setSubmitError(error);
      }
    }),
  );

  const { errors, isSubmitting, submitCount } = formState;

  return (
    <Section id="password-title" title={t('profile.password')} lead={t('profile.passwordLead')}>
      <form
        noValidate
        aria-labelledby="password-title"
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-6"
      >
        <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
        {submitError !== null && <ErrorNotice error={submitError} />}
        <PasswordField
          id="password-currentPassword"
          label={labels.currentPassword}
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <PasswordField
          id="password-newPassword"
          label={labels.newPassword}
          autoComplete="new-password"
          policyValue={newPassword}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <PasswordField
          id="password-confirmPassword"
          label={labels.confirmPassword}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" loading={isSubmitting}>
          {t('profile.changePassword')}
        </Button>
      </form>
    </Section>
  );
}

function Preferences() {
  const { t } = useTranslation();
  return (
    <Section
      id="preferences-title"
      title={t('profile.preferences')}
      lead={t('profile.preferencesLead')}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('language.label')}</p>
          <LanguageSwitcher />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('theme.label')}</p>
          <ThemeToggle />
        </div>
      </div>
    </Section>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../../../api/endpoints';
import { isApiError } from '../../../api/errors';
import { STAFF_ROLES } from '../../../api/types';
import type { StaffMemberResponse, StaffRole } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../../components/ui/FormErrorSummary';
import { AlertIcon } from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/ToastProvider';
import { firstFieldMessageKey } from '../../../i18n/apiErrors';
import { useExclusive } from '../../../lib/hooks';
import { applyServerFieldErrors } from '../../auth/applyServerErrors';
import { PasswordField } from '../../auth/PasswordField';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { createStaffSchema } from './staffSchema';
import type { CreateStaffInput, CreateStaffValues } from './staffSchema';

const FIELDS = ['fullName', 'email', 'password', 'role'] as const;
const fieldId = (name: (typeof FIELDS)[number]) =>
  name === 'role' ? 'staff-role-Agent' : `staff-${name}`;

export function CreateStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const [serverError, setServerError] = useState<unknown>(null);

  const { register, control, handleSubmit, setError, setFocus, reset, formState } = useForm<
    CreateStaffInput,
    unknown,
    CreateStaffValues
  >({
    resolver: zodResolver(createStaffSchema),
    mode: 'onTouched',
    // Radios can't take RHF's focus; the invalid handler focuses in field order.
    shouldFocusError: false,
    defaultValues: { fullName: '', email: '', password: '' },
  });
  const { errors, isSubmitting, submitCount } = formState;
  const labels = {
    fullName: t('auth.fields.fullName'),
    email: t('auth.fields.email'),
    password: t('admin.staff.initialPassword'),
    role: t('admin.staff.role'),
  };
  const summary: SummaryField<CreateStaffInput>[] = FIELDS.map((name) => ({
    name,
    id: fieldId(name),
    label: labels[name],
  }));

  const close = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const submit = handleSubmit(
    (values) =>
      exclusive(async () => {
        setServerError(null);
        try {
          const created = await usersApi.createStaff(values);
          await invalidate();
          toast.toast({
            tone: 'success',
            title: t('admin.staff.createdToast', { name: created.fullName }),
          });
          close();
        } catch (error) {
          // A taken email is a 409, but it belongs to the email field.
          if (isApiError(error) && error.status === 409) {
            setError('email', { type: 'server', message: 'errors.emailTaken' });
            setFocus('email');
            return;
          }
          const matched = applyServerFieldErrors(error, FIELDS, setError);
          if (matched[0] && matched[0] !== 'role') setFocus(matched[0]);
          else if (matched[0]) document.getElementById(fieldId('role'))?.focus();
          else setServerError(error);
        }
      }),
    (invalid) => {
      const first = FIELDS.find((field) => invalid[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
    },
  );

  const role = useWatch({ control, name: 'role' });
  const password = useWatch({ control, name: 'password' });

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('admin.staff.createTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-staff-form" loading={isSubmitting}>
            {t('admin.staff.create')}
          </Button>
        </>
      }
    >
      <form
        id="create-staff-form"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="space-y-6 text-text"
      >
        <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
        {serverError !== null && (
          <ErrorNotice error={serverError} overrides={{ 400: firstFieldMessageKey(serverError) }} />
        )}
        <Input
          id={fieldId('fullName')}
          label={labels.fullName}
          autoComplete="off"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          id={fieldId('email')}
          label={labels.email}
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          id={fieldId('password')}
          label={labels.password}
          autoComplete="new-password"
          hint={t('admin.staff.passwordHint')}
          policyValue={password}
          error={errors.password?.message}
          {...register('password')}
        />
        <fieldset
          aria-describedby={errors.role ? 'staff-role-error' : undefined}
          className="space-y-3"
        >
          <legend className="mb-3 text-sm font-medium">{labels.role}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {STAFF_ROLES.map((option) => (
              <label
                key={option}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                  role === option
                    ? 'border-accent bg-surface-2'
                    : 'border-line-strong hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  id={`staff-role-${option}`}
                  value={option}
                  className="size-4 shrink-0 accent-accent"
                  {...register('role')}
                />
                <span className="font-medium">{t(`roles.${option}`)}</span>
              </label>
            ))}
          </div>
          {errors.role?.message && (
            <p id="staff-role-error" className="flex items-start gap-1.5 text-sm text-danger">
              <span className="mt-0.5 shrink-0">
                <AlertIcon />
              </span>
              {t(errors.role.message)}
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

export type StaffAction =
  | { kind: 'deactivate'; member: StaffMemberResponse }
  | { kind: 'reactivate'; member: StaffMemberResponse }
  | { kind: 'role'; member: StaffMemberResponse };

// One confirm dialog for the three account changes; each says what follows.
export function StaffActionDialog({
  action,
  onClose,
}: {
  action: StaffAction | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const member = action?.member;
  const nextRole = role ?? STAFF_ROLES.find((r) => r !== member?.role) ?? 'Agent';

  const close = () => {
    setError(null);
    setRole(null);
    onClose();
  };

  const confirm = () =>
    exclusive(async () => {
      if (!action || !member) return;
      setBusy(true);
      setError(null);
      try {
        if (action.kind === 'deactivate') await usersApi.deactivate(member.id);
        if (action.kind === 'reactivate') await usersApi.reactivate(member.id);
        if (action.kind === 'role') await usersApi.changeRole(member.id, { role: nextRole });
        await invalidate();
        toast.toast({
          tone: 'success',
          title: t(`admin.staff.toast.${action.kind}`, {
            name: member.fullName,
            role: t(`roles.${nextRole}`),
          }),
        });
        close();
      } catch (caught) {
        setError(caught);
      } finally {
        setBusy(false);
      }
    });

  const title = action
    ? t(`admin.staff.confirm.${action.kind}Title`, { name: member?.fullName })
    : '';

  return (
    <Modal
      open={action !== null}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} onClick={() => void confirm()}>
            {action ? t(`admin.staff.confirm.${action.kind}Button`) : ''}
          </Button>
        </>
      }
    >
      {action && member && (
        <>
          {error !== null && <ErrorNotice error={error} />}
          {action.kind === 'role' && (
            <fieldset className="space-y-3 text-text">
              <legend className="mb-3 text-sm font-medium">
                {t('admin.staff.confirm.newRole', { role: t(`roles.${member.role}`) })}
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {STAFF_ROLES.filter((r) => r !== member.role).map((option) => (
                  <label
                    key={option}
                    className={cx(
                      'flex cursor-pointer items-center gap-3 rounded-sm border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                      nextRole === option
                        ? 'border-accent bg-surface-2'
                        : 'border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="radio"
                      name="new-role"
                      value={option}
                      checked={nextRole === option}
                      onChange={() => setRole(option)}
                      className="size-4 shrink-0 accent-accent"
                    />
                    <span className="font-medium">{t(`roles.${option}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p>
            {t(`admin.staff.confirm.${action.kind}Body`, {
              name: member.fullName,
              email: member.email,
            })}
          </p>
          {action.kind === 'role' && member.role === 'Agent' && member.customerCount > 0 && (
            <p>{t('admin.staff.confirm.releasesCustomers', { count: member.customerCount })}</p>
          )}
          {action.kind === 'role' && member.role === 'Adjuster' && member.openClaimCount > 0 && (
            <p>{t('admin.staff.confirm.keepsClaims', { count: member.openClaimCount })}</p>
          )}
        </>
      )}
    </Modal>
  );
}

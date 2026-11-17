import { useId, useState } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../components/ui/cx';
import { CheckIcon, EyeIcon, EyeOffIcon } from '../../components/ui/icons';
import { Input } from '../../components/ui/Input';
import { PASSWORD_RULES, passwordStrength } from './validation';

type PasswordFieldProps = Omit<ComponentProps<typeof Input>, 'type' | 'trailing'> & {
  // When set, shows the live policy checklist and strength meter for this value.
  policyValue?: string;
};

const STRENGTH_KEYS = ['', 'weak', 'fair', 'good', 'strong'] as const;
const STRENGTH_COLOR = ['', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success'] as const;

export function PasswordField({ policyValue, ...props }: PasswordFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const rulesId = useId();

  const toggle = (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
      aria-pressed={visible}
      className="grid size-10 place-items-center rounded-sm text-muted hover:text-text"
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );

  if (policyValue === undefined) {
    return <Input {...props} type={visible ? 'text' : 'password'} trailing={toggle} />;
  }

  const strength = passwordStrength(policyValue);

  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={toggle}
      describedById={rulesId}
      below={
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cx(
                    'h-1 rounded-full transition-colors duration-200',
                    strength >= step ? STRENGTH_COLOR[strength] : 'bg-line',
                  )}
                />
              ))}
            </div>
            <span className="min-w-20 text-right text-sm text-muted">
              {strength > 0 && t(`auth.strength.${STRENGTH_KEYS[strength]}`)}
            </span>
          </div>
          <ul
            id={rulesId}
            aria-label={t('auth.passwordRules.title')}
            className="grid gap-1 sm:grid-cols-2"
          >
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(policyValue);
              return (
                <li
                  key={rule.id}
                  className={cx(
                    'flex items-center gap-2 text-sm',
                    met ? 'text-success' : 'text-muted',
                  )}
                >
                  <span aria-hidden="true" className="grid size-4 place-items-center">
                    {met ? <CheckIcon /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                  {t(`auth.passwordRules.${rule.id}`)}
                  <span className="sr-only">
                    {met ? t('auth.passwordRules.met') : t('auth.passwordRules.notMet')}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      }
    />
  );
}

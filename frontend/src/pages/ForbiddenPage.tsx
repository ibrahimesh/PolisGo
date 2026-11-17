import { useTranslation } from 'react-i18next';
import type { UserRole } from '../api/types';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export function ForbiddenPage({ role }: { role: UserRole }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-8">
      <EmptyState
        headingLevel="h1"
        label={t('forbidden.label')}
        title={t('forbidden.title')}
        body={t('forbidden.body', { role: t(`roles.${role}`) })}
        action={
          <ButtonLink to="/app" variant="secondary">
            {t('forbidden.back')}
          </ButtonLink>
        }
      />
    </div>
  );
}

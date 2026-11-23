import { useTranslation } from 'react-i18next';
import type { UserRole } from '../api/types';
import { ErrorPage } from './errors/ErrorPage';

export function ForbiddenPage({ role }: { role: UserRole }) {
  const { t } = useTranslation();
  return <ErrorPage kind="forbidden" body={t('forbidden.body', { role: t(`roles.${role}`) })} />;
}

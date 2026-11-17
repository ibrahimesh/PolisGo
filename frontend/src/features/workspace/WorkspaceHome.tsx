import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { AccentHeading } from '../../components/layout/Section';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Label } from '../../components/ui/Label';

export function WorkspaceHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const role = t(`roles.${user.role}`);

  return (
    <div className="space-y-12">
      <AccentHeading
        as="h1"
        label={t('workspace.label')}
        lead={t('workspace.greetingLead')}
        accent={user.fullName}
      >
        <p className="text-muted">{t('workspace.lead', { role })}</p>
      </AccentHeading>

      {/* Straight from GET /api/auth/me. */}
      <Card
        variant="paper"
        as="section"
        aria-labelledby="profile-title"
        className="max-w-2xl p-6 sm:p-8"
      >
        <div className="flex items-center justify-between">
          <h2 id="profile-title">
            <Label className="text-paper-muted">{t('workspace.profile')}</Label>
          </h2>
          <Badge tone="paper">{role}</Badge>
        </div>
        <dl className="mt-6 divide-y divide-paper-line">
          {[
            ['workspace.email', user.email],
            ['workspace.role', role],
            ['workspace.userId', user.id],
          ].map(([key = '', value]) => (
            <div key={key} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="label-mono text-paper-muted">{t(key)}</dt>
              <dd className="font-mono text-sm break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <EmptyState title={t('workspace.comingSoonTitle')} body={t('workspace.comingSoonBody')} />
    </div>
  );
}

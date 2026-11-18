import { useTranslation } from 'react-i18next';
import type { PolicyStatus } from '../../api/types';
import { Badge } from '../../components/ui/Badge';

const TONE = {
  Active: 'success',
  Draft: 'warning',
  Expired: 'neutral',
  Cancelled: 'danger',
} as const satisfies Record<PolicyStatus, string>;

// Colour plus a word: the status never rests on colour alone.
export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONE[status]}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {t(`policyStatus.${status}`)}
    </Badge>
  );
}

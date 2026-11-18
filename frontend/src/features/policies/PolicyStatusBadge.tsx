import { useTranslation } from 'react-i18next';
import type { PolicyStatus } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { cx } from '../../components/ui/cx';

const TONE = {
  Active: 'success',
  Draft: 'warning',
  Expired: 'neutral',
  Cancelled: 'danger',
} as const satisfies Record<PolicyStatus, string>;

// On the ivory data card the theme's status colours lack contrast, so the
// badge switches to paper ink there; the word carries the meaning either way.
export function PolicyStatusBadge({
  status,
  onPaper = false,
}: {
  status: PolicyStatus;
  onPaper?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Badge tone={onPaper ? 'paper' : TONE[status]}>
      <span
        aria-hidden="true"
        className={cx('size-1.5 shrink-0 rounded-full', onPaper ? 'bg-paper-ink' : 'bg-current')}
      />
      {t(`policyStatus.${status}`)}
    </Badge>
  );
}

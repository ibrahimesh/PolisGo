import { useTranslation } from 'react-i18next';
import type { ClaimStatus } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { cx } from '../../components/ui/cx';

// Waiting is neutral, in progress is a warning, a payout or approval is
// success, a rejection is danger; withdrawn is closed and quiet.
const TONE = {
  Submitted: 'neutral',
  UnderReview: 'warning',
  Approved: 'success',
  Paid: 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
} as const satisfies Record<ClaimStatus, string>;

export function ClaimStatusBadge({
  status,
  onPaper = false,
}: {
  status: ClaimStatus;
  onPaper?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Badge tone={onPaper ? 'paper' : TONE[status]}>
      <span
        aria-hidden="true"
        className={cx('size-1.5 shrink-0 rounded-full', onPaper ? 'bg-paper-ink' : 'bg-current')}
      />
      {t(`claimStatus.${status}`)}
    </Badge>
  );
}

import { useTranslation } from 'react-i18next';
import type { ErrorSource, ErrorStatus } from '../../../api/types';
import { Badge } from '../../../components/ui/Badge';
import { AlertIcon } from '../../../components/ui/icons';

// Word first, colour second: each badge reads without its tone.

export function SourceBadge({ source }: { source: ErrorSource }) {
  const { t } = useTranslation();
  return <Badge tone="neutral">{t(`admin.system.sources.${source}`)}</Badge>;
}

const STATUS_TONES = { New: 'warning', Resolved: 'success', Ignored: 'neutral' } as const;

export function ErrorStatusBadge({ status }: { status: ErrorStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONES[status]}>{t(`admin.system.statuses.${status}`)}</Badge>;
}

export function RegressedBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="danger">
      <AlertIcon />
      {t('admin.system.regressed')}
    </Badge>
  );
}

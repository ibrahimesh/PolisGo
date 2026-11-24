import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';
import { isApiError } from '../../../api/errors';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { Skeleton } from '../../../components/ui/Skeleton';
import { asReference } from './errorParams';
import { useErrorLookup } from './queries';
import { ReferenceLookup } from './ReferenceLookup';

// /app/admin/system/lookup/:reference: resolves a Reference (or trace id)
// and replaces itself with the error's page, the occurrence marked. A miss
// says so and offers the box again.
export function LookupPage() {
  const { t } = useTranslation();
  const { reference = '' } = useParams();
  const code = asReference(reference) ?? reference.slice(0, 16);
  const lookup = useErrorLookup(reference);

  if (lookup.isSuccess) {
    const { group, occurrence } = lookup.data;
    return (
      <Navigate
        replace
        to={`/app/admin/system/errors/${group.id}?occurrence=${occurrence.id}&ref=${occurrence.referenceCode}`}
      />
    );
  }
  if (lookup.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <p role="status" className="text-muted">
          {t('admin.system.lookup.searching', { code })}
        </p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const missing =
    isApiError(lookup.error) && (lookup.error.status === 404 || lookup.error.status === 400);
  return (
    <div className="space-y-10">
      {missing ? (
        <EmptyState
          headingLevel="h2"
          title={t('admin.system.lookup.notFoundTitle', { code })}
          body={t('admin.system.lookup.notFoundBody')}
          action={
            <Link
              to="/app/admin/system"
              className="text-sm font-medium underline decoration-line-strong underline-offset-4 hover:decoration-current"
            >
              {t('admin.system.lookup.back')}
            </Link>
          }
        />
      ) : (
        <ErrorNotice error={lookup.error} />
      )}
      <ReferenceLookup focus />
    </div>
  );
}

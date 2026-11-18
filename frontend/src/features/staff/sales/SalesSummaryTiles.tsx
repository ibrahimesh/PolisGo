import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useFormatters } from '../../../i18n/format';
import { useStaffOverview } from '../queries';

// The sales block of GET /api/staff/overview: the same policies as the list
// below, so a tile and the list behind it agree.
export function SalesSummaryTiles() {
  const { t } = useTranslation();
  const format = useFormatters();
  const overview = useStaffOverview();

  if (overview.isPending) {
    return (
      <div
        aria-busy="true"
        className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4"
      >
        <span className="sr-only" role="status">
          {t('common.loading')}
        </span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 bg-bg p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }
  if (overview.isError) return <ErrorNotice error={overview.error} />;
  const sales = overview.data.sales;
  if (!sales) return null;

  const active = sales.policiesByStatus.find((entry) => entry.status === 'Active')?.count ?? 0;
  const tiles = [
    {
      id: 'written',
      label: t('staff.sales.tiles.written'),
      value: format.money(sales.premiumWritten),
    },
    {
      id: 'recent',
      label: t('staff.sales.tiles.recent'),
      value: format.money(sales.premiumLast30Days),
      note: t('staff.sales.tiles.soldRecently', { count: sales.policiesSoldLast30Days }),
    },
    { id: 'active', label: t('staff.sales.tiles.active'), value: format.integer(active) },
    {
      id: 'customers',
      label: t('staff.sales.tiles.customers'),
      value: format.integer(sales.customers),
      note: t('staff.sales.tiles.openClaims', { count: sales.openClaims }),
    },
  ];

  return (
    <section aria-labelledby="sales-summary-title">
      <h2 id="sales-summary-title" className="sr-only">
        {t('staff.sales.summary')}
      </h2>
      <dl className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.id} className="space-y-1 bg-bg p-5">
            <dt className="text-sm font-medium text-muted">{tile.label}</dt>
            <dd className="font-serif text-2xl tabular">{tile.value}</dd>
            {tile.note && <dd className="text-sm text-muted">{tile.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

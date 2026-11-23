import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { AlertIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useFormatters } from '../../i18n/format';
import { usePolicyTypes } from '../landing/usePolicyTypes';
import { ProductBadge } from '../policies/ProductIcon';
import { useProductName } from '../policies/useProductName';

// The catalogue as the API serves it (GET /api/policy-types). Read-only:
// rates are seeded with the database, not edited here.
export function PolicyTypesPage() {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const types = usePolicyTypes();

  return (
    <div className="space-y-8">
      <PageHeader title={t('admin.policyTypes.title')} description={t('admin.policyTypes.lead')} />

      <p className="flex max-w-3xl items-start gap-3 rounded-sm border border-warning/60 px-4 py-3">
        <span className="mt-0.5 shrink-0 text-warning">
          <AlertIcon />
        </span>
        {t('admin.policyTypes.illustrative')}
      </p>

      {types.isPending ? (
        <div aria-busy="true">
          <span className="sr-only" role="status">
            {t('common.loading')}
          </span>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : types.isError ? (
        <ErrorNotice
          error={types.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void types.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line md:hidden">
            {types.data.map((type) => (
              <li key={type.code} className="flex gap-4 py-4">
                <ProductBadge code={type.code} />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {product.name(type.code)} <span className="text-muted">· {type.code}</span>
                  </p>
                  <p className="text-sm text-muted">{product.hint(type.code)}</p>
                  <p className="font-serif text-xl tabular">
                    {format.money(type.baseRate, type.currency)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <Caption>{t('admin.policyTypes.caption')}</Caption>
              <THead>
                <Tr className="border-line">
                  <Th>{t('admin.policyTypes.columns.product')}</Th>
                  <Th>{t('admin.policyTypes.columns.code')}</Th>
                  <Th>{t('admin.policyTypes.columns.cover')}</Th>
                  <Th className="text-right">{t('admin.policyTypes.columns.baseRate')}</Th>
                </Tr>
              </THead>
              <TBody>
                {types.data.map((type) => (
                  <Tr key={type.code} className="border-line">
                    <Td className="font-medium">
                      <span className="flex items-center gap-3">
                        <ProductBadge code={type.code} />
                        {product.name(type.code)}
                      </span>
                    </Td>
                    <Td className="tabular">{type.code}</Td>
                    <Td className="text-sm text-muted">{product.hint(type.code)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {format.money(type.baseRate, type.currency)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <p className="max-w-3xl text-sm text-muted">{t('admin.policyTypes.howPriced')}</p>
        </>
      )}
    </div>
  );
}

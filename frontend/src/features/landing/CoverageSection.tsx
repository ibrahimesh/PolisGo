import { useTranslation } from 'react-i18next';
import { Frame } from '../../components/layout/Section';
import { Reveal } from '../../components/layout/Reveal';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { CheckIcon, DashIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { COVERAGE_BY_CODE, COVERAGE_ROWS } from './coverage';
import { SectionHeader } from './SectionHeader';
import { usePolicyTypes } from './usePolicyTypes';

export function CoverageSection() {
  const { t, i18n } = useTranslation();
  const format = useFormatters();
  const types = usePolicyTypes();

  // Translated product name when we have one for the code; the API's own
  // (English) catalogue name otherwise, so a new product still reads sensibly.
  const productName = (code: string, fallback: string) =>
    i18n.exists(`calculator.products.${code}`) ? t(`calculator.products.${code}`) : fallback;

  return (
    <Frame as="section" id="coverage" labelledBy="coverage-title">
      <SectionHeader
        id="coverage-title"
        lead={t('landing.coverage.titleLead')}
        accent={t('landing.coverage.titleAccent')}
        intro={t('landing.coverage.lead')}
      />
      <Reveal className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        {types.isPending && (
          <div aria-busy="true" className="space-y-4">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {types.isError && <ErrorNotice error={types.error} title={t('errors.title')} />}
        {types.data && (
          // relative: sr-only cell text is absolutely positioned and would
          // otherwise escape the scroll clip and widen the page on phones.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left tabular">
              <caption className="sr-only">{t('landing.coverage.caption')}</caption>
              <thead>
                <tr className="border-y border-line-strong">
                  <th
                    scope="col"
                    className="w-2/5 py-6 pr-6 align-bottom text-sm font-medium text-muted"
                  >
                    {t('landing.coverage.rowHeader')}
                  </th>
                  {types.data.map((type) => {
                    const meta = COVERAGE_BY_CODE[type.code];
                    return (
                      <th key={type.id} scope="col" className="py-6 pr-6 align-bottom font-normal">
                        <span className="block font-serif text-xl">
                          {productName(type.code, type.name)}
                        </span>
                        <span className="mt-2 block text-sm text-muted">
                          {t('landing.coverage.fromRate', {
                            amount: format.amount(type.baseRate),
                            currency: type.currency,
                          })}
                        </span>
                        {meta && (
                          <span className="mt-1 block text-sm text-muted">
                            {meta.mandatory
                              ? t('landing.coverage.mandatory')
                              : t('landing.coverage.voluntary')}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {COVERAGE_ROWS.map((row) => (
                  <tr key={row} className="border-b border-line">
                    <th scope="row" className="py-4 pr-6 font-normal">
                      {t(`landing.coverage.rows.${row}`)}
                    </th>
                    {types.data.map((type) => {
                      const covered = COVERAGE_BY_CODE[type.code]?.covers.includes(row) ?? false;
                      return (
                        <td key={type.id} className="py-4 pr-6">
                          <span className={covered ? 'text-accent' : 'text-muted'}>
                            {covered ? <CheckIcon /> : <DashIcon />}
                          </span>
                          <span className="sr-only">
                            {covered
                              ? t('landing.coverage.included')
                              : t('landing.coverage.notIncluded')}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>
    </Frame>
  );
}

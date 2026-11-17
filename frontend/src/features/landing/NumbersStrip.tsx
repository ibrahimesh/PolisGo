import { useTranslation } from 'react-i18next';
import { Reveal } from '../../components/layout/Reveal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { usePolicyTypes } from './usePolicyTypes';

// The first two figures come from the live catalogue; the rest are the
// pricing engine's fixed rules (Tariff.cs), which the calculator applies.
export function NumbersStrip() {
  const { t } = useTranslation();
  const format = useFormatters();
  const types = usePolicyTypes();

  const lowest = types.data?.length
    ? types.data.reduce((min, type) => (type.baseRate < min.baseRate ? type : min))
    : undefined;

  const items = [
    {
      key: 'products',
      value: types.data ? String(types.data.length) : undefined,
      label: t('landing.numbers.products'),
    },
    {
      key: 'fromRate',
      value: lowest ? format.amount(lowest.baseRate) : undefined,
      label: t('landing.numbers.fromRate', { currency: lowest?.currency ?? 'AZN' }),
    },
    { key: 'factors', value: '6', label: t('landing.numbers.factors') },
    {
      key: 'cap',
      // One × for the whole range keeps it on a single line.
      value: `×${format.factorPlain(0.5)}–${format.factorPlain(3)}`,
      label: t('landing.numbers.cap'),
    },
    { key: 'shortTerm', value: '+10%', label: t('landing.numbers.shortTerm') },
  ];

  return (
    <section aria-labelledby="numbers-title" className="border-b border-line">
      <div className="mx-auto max-w-7xl">
        <h2 id="numbers-title" className="sr-only">
          {t('landing.numbers.title')}
        </h2>
        <Reveal>
          <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => (
              <div
                key={item.key}
                className="flex flex-col-reverse gap-2 border-b border-line px-4 py-8 odd:border-r sm:px-6 md:border-r md:odd:border-r lg:border-b-0 lg:px-8 lg:last:border-r-0"
              >
                <dt className="text-sm text-muted">{item.label}</dt>
                <dd className="font-serif text-xl whitespace-nowrap tabular sm:text-2xl">
                  {item.value ?? <Skeleton className="h-12 w-24" />}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

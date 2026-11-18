import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PremiumBreakdown } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cx } from '../../components/ui/cx';
import { Label } from '../../components/ui/Label';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Caption, Table, TBody, Td, TFoot, Th, THead, Tr } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { useFormatters } from '../../i18n/format';
import { useTweenedValues } from '../../lib/hooks';
import { FactorDiagram } from './FactorDiagram';
import { detectRiskCap, effectOf, FACTOR_KEYS } from './factors';
import type { Effect } from './factors';

interface QuoteResultProps {
  breakdown: PremiumBreakdown | undefined;
  productLabel: string;
  termMonths: number;
  // Shown while the debounce is pending or a request is in flight.
  updating: boolean;
  // The form currently holds invalid input, so the figure on screen is stale.
  stale: boolean;
  // The purchase wizard prices from stored data, so its figure is exact:
  // it replaces the "indicative" label and note.
  label?: string;
  note?: string;
}

export function QuoteResult({
  breakdown,
  productLabel,
  termMonths,
  updating,
  stale,
  label,
  note,
}: QuoteResultProps) {
  const { t } = useTranslation();
  const resultLabel = label ?? t('calculator.resultLabel');
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <Card
      variant="paper"
      as="section"
      aria-labelledby="quote-result-label"
      aria-busy={updating}
      className="p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id="quote-result-label">
          <Label className="text-paper-muted">{resultLabel}</Label>
        </span>
        <div className="flex items-center gap-2">
          {/* visibility, not an opacity fade: a half-faded label fails contrast,
              and hidden text must leave the accessibility tree too. */}
          <span className={cx('text-sm text-paper-muted', !updating && 'invisible')}>
            {t('calculator.updating')}…
          </span>
          <Badge tone="paper">{productLabel}</Badge>
        </div>
      </div>

      {breakdown ? (
        <ResultBody
          breakdown={breakdown}
          termMonths={termMonths}
          stale={stale}
          label={resultLabel}
          note={note ?? t('calculator.estimate')}
          onExplain={() => setExplainOpen(true)}
        />
      ) : (
        <ResultSkeleton />
      )}

      <Modal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        title={t('calculator.modal.title')}
        footer={
          <Button variant="secondary" onClick={() => setExplainOpen(false)}>
            {t('calculator.modal.close')}
          </Button>
        }
      >
        <p>{t('calculator.modal.intro')}</p>
        <p>{t('calculator.modal.risk')}</p>
        <p>{t('calculator.modal.term')}</p>
        <p>{t('calculator.modal.rounding')}</p>
      </Modal>
    </Card>
  );
}

function ResultBody({
  breakdown,
  termMonths,
  stale,
  label,
  note,
  onExplain,
}: {
  breakdown: PremiumBreakdown;
  termMonths: number;
  stale: boolean;
  label: string;
  note: string;
  onExplain: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const [price = breakdown.premium] = useTweenedValues([breakdown.premium], 320);
  const cap = detectRiskCap(breakdown);

  return (
    <div className={cx('transition-opacity duration-200', stale && 'opacity-45')}>
      {/* Price and notes share a row; the diagram gets the full card width
          below so its axis labels stay legible on every screen size. */}
      <div className="mt-6 grid items-end gap-6 sm:grid-cols-2 sm:gap-10">
        <div>
          {/* The animated figure is decorative; screen readers get the final value once. */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {label}: {format.amount(breakdown.premium)} {breakdown.currency}
          </p>
          <p aria-hidden="true" className="flex items-baseline gap-3">
            <span className="font-serif text-3xl leading-none tracking-[-0.03em] tabular sm:text-4xl">
              {format.amount(price)}
            </span>
            <span className="text-lg text-paper-muted">{breakdown.currency}</span>
          </p>
          <p className="mt-3 text-paper-muted">
            {t('calculator.resultFor', { count: termMonths })}
          </p>
        </div>

        <div className="space-y-3 sm:border-l sm:border-paper-line sm:pl-6">
          {cap && (
            <div className="space-y-2">
              <Badge tone="paper">{t('calculator.capApplied')}</Badge>
              <p className="text-sm text-paper-muted">
                {t('calculator.capHint', {
                  raw: format.factorPlain(cap.raw),
                  capped: format.factorPlain(cap.capped),
                })}
              </p>
            </div>
          )}
          <p className="text-sm text-paper-muted">{note}</p>
          <button
            type="button"
            onClick={onExplain}
            className="text-sm text-paper-accent underline decoration-paper-accent/40 underline-offset-4 hover:decoration-paper-accent"
          >
            {t('calculator.howCalculated')}
          </button>
        </div>
      </div>

      <figure className="mx-auto mt-8 w-full max-w-lg border-t border-paper-line pt-6">
        <FactorDiagram breakdown={breakdown} />
      </figure>

      <Tabs
        className="mt-8"
        tone="paper"
        label={t('calculator.tabsLabel')}
        items={[
          {
            id: 'breakdown',
            label: t('calculator.tabs.breakdown'),
            content: <BreakdownTable breakdown={breakdown} />,
          },
          {
            id: 'formula',
            label: t('calculator.tabs.formula'),
            content: <Formula breakdown={breakdown} />,
          },
        ]}
      />
    </div>
  );
}

const EFFECT_GLYPH: Record<Effect, string> = { raises: '↑', lowers: '↓', neutral: '—' };

function BreakdownTable({ breakdown }: { breakdown: PremiumBreakdown }) {
  const { t } = useTranslation();
  const format = useFormatters();

  return (
    <Table>
      <Caption>{t('calculator.table.caption')}</Caption>
      <THead>
        <Tr>
          <Th>{t('calculator.table.factor')}</Th>
          <Th className="text-right">{t('calculator.table.value')}</Th>
          <Th className="text-right">{t('calculator.table.effect')}</Th>
        </Tr>
      </THead>
      <TBody>
        <Tr>
          <Th scope="row">{t('calculator.factor.baseRate')}</Th>
          <Td className="text-right">
            {format.amount(breakdown.baseRate)} {breakdown.currency}
          </Td>
          <Td />
        </Tr>
        {FACTOR_KEYS.map((key) => {
          const effect = effectOf(breakdown[key]);
          return (
            <Tr key={key}>
              <Th scope="row">{t(`calculator.factor.${key}`)}</Th>
              <Td className="text-right tabular">{format.factor(breakdown[key])}</Td>
              <Td className="text-right text-paper-muted">
                <span aria-hidden="true">{EFFECT_GLYPH[effect]} </span>
                {t(`calculator.effect.${effect}`)}
              </Td>
            </Tr>
          );
        })}
      </TBody>
      <TFoot>
        <Tr className="border-t border-paper-ink/40">
          <Th scope="row">{t('calculator.factor.totalFactor')}</Th>
          <Td className="text-right tabular">{format.factor(breakdown.totalFactor)}</Td>
          <Td />
        </Tr>
        <Tr>
          <Th scope="row" className="font-semibold">
            {t('calculator.factor.premium')}
          </Th>
          <Td className="text-right font-semibold">
            {format.amount(breakdown.premium)} {breakdown.currency}
          </Td>
          <Td />
        </Tr>
      </TFoot>
    </Table>
  );
}

function Formula({ breakdown }: { breakdown: PremiumBreakdown }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const cap = detectRiskCap(breakdown);

  const terms = cap
    ? [`${format.factorPlain(cap.capped)}*`, format.factorPlain(breakdown.termFactor)]
    : FACTOR_KEYS.map((key) => format.factorPlain(breakdown[key]));

  return (
    <figure className="space-y-3">
      <figcaption>
        <Label className="text-paper-muted">{t('calculator.formulaCaption')}</Label>
      </figcaption>
      <p className="text-lg leading-8 break-words tabular">
        {format.amount(breakdown.baseRate)}
        {terms.map((term, i) => (
          <span key={i}>
            <span className="px-1.5 text-paper-muted">×</span>
            {term}
          </span>
        ))}
        <span className="px-1.5 text-paper-muted">=</span>
        <strong className="font-semibold">
          {format.amount(breakdown.premium)} {breakdown.currency}
        </strong>
      </p>
      {cap && <p className="text-sm text-paper-muted">* {t('calculator.capApplied')}</p>}
    </figure>
  );
}

function ResultSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="space-y-4 text-paper-ink">
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-8 h-3 w-56" />
        <Skeleton className="h-3 w-44" />
      </div>
      <Skeleton className="aspect-[4/3] w-full text-paper-ink" />
    </div>
  );
}

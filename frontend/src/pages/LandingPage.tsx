import { useTranslation } from 'react-i18next';
import { AccentHeading, Frame } from '../components/layout/Section';
import { ButtonLink } from '../components/ui/Button';
import { buttonClasses } from '../components/ui/styles';
import { ArrowRightIcon } from '../components/ui/icons';
import { Label } from '../components/ui/Label';
import { QuoteCalculator } from '../features/quote/QuoteCalculator';

const FACTS = ['products', 'currency', 'pricing', 'roles'] as const;
const STEPS = ['factors', 'cap', 'issue'] as const;

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <>
      <Frame>
        <section
          aria-labelledby="hero-title"
          className="grid lg:grid-cols-3 lg:divide-x lg:divide-line"
        >
          <div className="px-6 pt-16 pb-14 sm:px-8 lg:col-span-2 lg:pt-24 lg:pb-20">
            <AccentHeading
              as="h1"
              id="hero-title"
              size="display"
              lead={t('landing.heroTitleLead')}
              accent={t('landing.heroTitleAccent')}
            >
              <p className="max-w-xl text-lg leading-relaxed text-muted">{t('landing.heroLead')}</p>
            </AccentHeading>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="#calculator" className={buttonClasses('primary', 'lg')}>
                {t('landing.ctaCalculate')}
                <ArrowRightIcon />
              </a>
              <ButtonLink to="/register" variant="secondary" size="lg">
                {t('landing.ctaRegister')}
              </ButtonLink>
            </div>
          </div>

          <aside
            aria-label={t('landing.factsLabel')}
            className="flex flex-col border-t border-line lg:border-t-0"
          >
            <dl className="divide-y divide-line">
              {FACTS.map((fact) => (
                <div
                  key={fact}
                  className="flex items-baseline justify-between gap-6 px-6 py-4 sm:px-8"
                >
                  <dt>
                    <Label>{t(`landing.facts.${fact}`)}</Label>
                  </dt>
                  <dd className="text-right text-sm">{t(`landing.facts.${fact}Value`)}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>
      </Frame>

      <Frame>
        <section id="calculator" aria-labelledby="calculator-title" className="scroll-mt-20">
          <div className="grid border-b border-line lg:grid-cols-3 lg:divide-x lg:divide-line">
            <div className="px-6 py-12 sm:px-8 lg:col-span-2 lg:py-16">
              <AccentHeading
                id="calculator-title"
                lead={t('landing.calculatorTitleLead')}
                accent={t('landing.calculatorTitleAccent')}
              />
            </div>
            <p className="flex items-end px-6 pb-12 leading-relaxed text-muted sm:px-8 lg:py-16">
              {t('landing.calculatorLead')}
            </p>
          </div>
          <QuoteCalculator />
        </section>
      </Frame>

      <Frame>
        <section id="method" aria-labelledby="method-title" className="scroll-mt-20">
          <div className="border-b border-line px-6 py-12 sm:px-8 lg:py-16">
            <AccentHeading
              id="method-title"
              lead={t('landing.methodTitleLead')}
              accent={t('landing.methodTitleAccent')}
            />
          </div>
          <ol className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {STEPS.map((step, i) => (
              <li key={step} className="space-y-4 px-6 py-10 sm:px-8 lg:py-14">
                <Label as="p" className="text-accent">
                  {String(i + 1).padStart(2, '0')}
                </Label>
                <h3 className="text-2xl">{t(`landing.steps.${step}Title`)}</h3>
                <p className="leading-relaxed text-muted">{t(`landing.steps.${step}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>
      </Frame>
    </>
  );
}

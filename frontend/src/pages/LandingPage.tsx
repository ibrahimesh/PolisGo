import { useTranslation } from 'react-i18next';
import { AccentHeading } from '../components/layout/Section';
import { ButtonLink } from '../components/ui/Button';
import { ArrowRightIcon } from '../components/ui/icons';
import { buttonClasses } from '../components/ui/styles';
import { ClaimsSection } from '../features/landing/ClaimsSection';
import { CoverageSection } from '../features/landing/CoverageSection';
import { FaqSection } from '../features/landing/FaqSection';
import { NumbersStrip } from '../features/landing/NumbersStrip';
import { PricingSection } from '../features/landing/PricingSection';
import { QuoteCalculator } from '../features/quote/QuoteCalculator';

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <>
      {/* Hero: an off-centre headline, then the live calculator itself — the
          product is the hero, not an illustration of it. */}
      <section aria-labelledby="hero-title" className="border-b border-line">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-16 pb-12 sm:px-6 lg:grid-cols-12 lg:px-8 lg:pt-24 lg:pb-16">
          <AccentHeading
            as="h1"
            id="hero-title"
            size="display"
            lead={t('landing.heroTitleLead')}
            accent={t('landing.heroTitleAccent')}
            className="lg:col-span-8"
          />
          <div className="flex flex-col justify-end gap-8 lg:col-span-4">
            <p className="max-w-md text-lg text-muted">{t('landing.heroLead')}</p>
            <div className="flex flex-wrap gap-4">
              <a href="#calculator" className={buttonClasses('primary', 'lg')}>
                {t('landing.ctaCalculate')}
                <ArrowRightIcon />
              </a>
              <ButtonLink to="/register" variant="secondary" size="lg">
                {t('landing.ctaRegister')}
              </ButtonLink>
            </div>
          </div>
        </div>
        <div
          id="calculator"
          role="region"
          aria-label={t('landing.calculatorTitle')}
          className="mx-auto max-w-7xl scroll-mt-16 border-t border-line"
        >
          <QuoteCalculator />
        </div>
      </section>

      <NumbersStrip />
      <PricingSection />
      <CoverageSection />
      <ClaimsSection />
      <FaqSection />
    </>
  );
}

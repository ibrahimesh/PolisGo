import { useTranslation } from 'react-i18next';
import { Frame } from '../../components/layout/Section';
import { Reveal } from '../../components/layout/Reveal';
import { SectionHeader } from './SectionHeader';

const STEPS = ['base', 'risk', 'cap', 'term', 'rounding'] as const;

export function PricingSection() {
  const { t } = useTranslation();

  return (
    <Frame as="section" id="pricing" labelledBy="pricing-title">
      <SectionHeader
        id="pricing-title"
        lead={t('landing.pricing.titleLead')}
        accent={t('landing.pricing.titleAccent')}
        intro={t('landing.pricing.lead')}
      />
      <Reveal>
        {/* The calculation reads top to bottom, like the formula it is. */}
        <ol
          aria-label={t('landing.pricing.stepsLabel')}
          className="border-t border-line lg:ml-[calc(100%/12*4)]"
        >
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="grid gap-2 border-b border-line px-4 py-8 last:border-b-0 sm:px-6 md:grid-cols-12 md:gap-6 lg:px-8"
            >
              <span
                aria-hidden="true"
                className="font-serif text-xl text-muted tabular md:col-span-1"
              >
                {index + 1}
              </span>
              <h3 className="font-sans text-lg font-medium tracking-normal md:col-span-4">
                {t(`landing.pricing.steps.${step}.title`)}
              </h3>
              <p className="text-muted md:col-span-7">{t(`landing.pricing.steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Frame>
  );
}

import { useTranslation } from 'react-i18next';
import { Frame } from '../../components/layout/Section';
import { Reveal } from '../../components/layout/Reveal';
import { SectionHeader } from './SectionHeader';

// Mirrors the API's claim states: Submitted → UnderReview → Approved or
// Rejected → Paid.
const STEPS = ['submit', 'review', 'decision', 'payout'] as const;

export function ClaimsSection() {
  const { t } = useTranslation();

  return (
    <Frame as="section" id="claims" labelledBy="claims-title">
      <SectionHeader
        id="claims-title"
        lead={t('landing.claims.titleLead')}
        accent={t('landing.claims.titleAccent')}
        intro={t('landing.claims.lead')}
      />
      <Reveal>
        <ol className="grid border-t border-line md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="relative space-y-4 border-b border-line px-4 py-12 sm:px-6 md:border-r md:even:border-r-0 lg:border-b-0 lg:px-8 lg:last:border-r-0 lg:even:border-r"
            >
              {/* The timeline rail: a hairline with a node on each step. */}
              <span
                aria-hidden="true"
                className="absolute top-0 left-4 block size-2 -translate-y-1/2 rounded-full bg-accent sm:left-6 lg:left-8"
              />
              <span aria-hidden="true" className="block font-serif text-2xl text-muted tabular">
                {index + 1}
              </span>
              <h3 className="font-sans text-lg font-medium tracking-normal">
                {t(`landing.claims.steps.${step}.title`)}
              </h3>
              <p className="text-muted">{t(`landing.claims.steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Frame>
  );
}

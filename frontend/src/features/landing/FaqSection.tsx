import { useTranslation } from 'react-i18next';
import { Frame } from '../../components/layout/Section';
import { Reveal } from '../../components/layout/Reveal';
import { ChevronDownIcon } from '../../components/ui/icons';
import { SectionHeader } from './SectionHeader';

const QUESTIONS = ['final', 'differ', 'cap', 'term', 'claim', 'licensed'] as const;

// Native <details>/<summary>: keyboard, screen-reader state and find-in-page
// work without any ARIA, and every answer is in the DOM for search engines.
export function FaqSection() {
  const { t } = useTranslation();

  return (
    <Frame as="section" id="faq" labelledBy="faq-title">
      <SectionHeader
        id="faq-title"
        lead={t('landing.faq.titleLead')}
        accent={t('landing.faq.titleAccent')}
      />
      <Reveal className="border-t border-line lg:ml-[calc(100%/12*4)]">
        {QUESTIONS.map((question) => (
          <details key={question} className="group border-b border-line last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-4 py-6 text-lg font-medium sm:px-6 lg:px-8 [&::-webkit-details-marker]:hidden">
              {t(`landing.faq.items.${question}.q`)}
              <span className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180">
                <ChevronDownIcon />
              </span>
            </summary>
            <p className="max-w-2xl px-4 pb-8 text-muted sm:px-6 lg:px-8">
              {t(`landing.faq.items.${question}.a`)}
            </p>
          </details>
        ))}
      </Reveal>
    </Frame>
  );
}

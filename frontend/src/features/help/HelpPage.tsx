import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../../components/layout/PageHeader';
import { ChevronDownIcon } from '../../components/ui/icons';

// Grouped questions about the cabinet. Native <details>/<summary>: keyboard,
// screen-reader state and find-in-page work with no script, and every answer
// stays in the DOM.
const GROUPS = {
  buying: ['price', 'exact', 'dates', 'payment', 'renew'],
  policies: ['certificate', 'expired', 'cancel', 'reminders'],
  account: ['details', 'password', 'preferences', 'claims', 'licensed'],
} as const;

export function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-12">
      <PageHeader title={t('help.title')} description={t('help.lead')} />

      {Object.entries(GROUPS).map(([group, questions]) => (
        <section
          key={group}
          aria-labelledby={`help-${group}`}
          className="grid gap-6 lg:grid-cols-12"
        >
          <h2 id={`help-${group}`} className="text-xl lg:col-span-4">
            {t(`help.groups.${group}`)}
          </h2>
          <div className="border-t border-line lg:col-span-8">
            {questions.map((question) => (
              <details key={question} className="group border-b border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
                  {t(`help.items.${question}.q`)}
                  <span className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180">
                    <ChevronDownIcon />
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 text-muted">{t(`help.items.${question}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="border-t border-line pt-8 text-muted">
        {t('help.more')}{' '}
        <Link to="/#faq" className="text-accent underline underline-offset-4">
          {t('help.moreLink')}
        </Link>
      </p>
    </div>
  );
}

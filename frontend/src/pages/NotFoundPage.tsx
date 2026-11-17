import { useTranslation } from 'react-i18next';
import { AccentHeading } from '../components/layout/Section';
import { ButtonLink } from '../components/ui/Button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="border-b border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-24 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-32">
        <p
          className="font-serif text-3xl text-muted tabular lg:col-span-3 lg:text-4xl"
          aria-hidden="true"
        >
          404
        </p>
        <div className="space-y-8 lg:col-span-8 lg:col-start-5">
          <AccentHeading
            as="h1"
            size="section"
            lead={t('notFound.titleLead')}
            accent={t('notFound.titleAccent')}
          >
            <p className="max-w-md text-lg text-muted">{t('notFound.body')}</p>
          </AccentHeading>
          <ButtonLink to="/" variant="secondary">
            {t('notFound.home')}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { FramesLineArt } from '../components/layout/LineArt';
import { AccentHeading, Frame } from '../components/layout/Section';
import { ButtonLink } from '../components/ui/Button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Frame>
      <div className="grid min-h-[60dvh] items-center lg:grid-cols-3 lg:divide-x lg:divide-line">
        <div className="space-y-8 px-6 py-20 sm:px-8 lg:col-span-2">
          <AccentHeading
            as="h1"
            size="display"
            label={t('notFound.label')}
            lead={t('notFound.titleLead')}
            accent={t('notFound.titleAccent')}
          >
            <p className="max-w-md text-lg text-muted">{t('notFound.body')}</p>
          </AccentHeading>
          <ButtonLink to="/" variant="secondary">
            {t('notFound.home')}
          </ButtonLink>
        </div>
        <div className="hidden h-full items-center justify-center p-12 lg:flex">
          <FramesLineArt className="w-full max-w-60" />
        </div>
      </div>
    </Frame>
  );
}

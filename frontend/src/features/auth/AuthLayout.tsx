import type { ReactNode } from 'react';
import { FramesLineArt } from '../../components/layout/LineArt';
import { AccentHeading, Frame } from '../../components/layout/Section';

interface AuthLayoutProps {
  label: string;
  lead: string;
  accent: string;
  intro: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ label, lead, accent, intro, footer, children }: AuthLayoutProps) {
  return (
    <Frame>
      <div className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-3 lg:divide-x lg:divide-line">
        <div className="flex flex-col justify-between gap-10 border-b border-line px-6 py-12 sm:px-8 lg:border-b-0 lg:py-16">
          <AccentHeading as="h1" id="auth-title" label={label} lead={lead} accent={accent}>
            <p className="max-w-sm leading-relaxed text-muted">{intro}</p>
          </AccentHeading>
          <FramesLineArt className="hidden size-40 lg:block" />
        </div>
        <div className="px-6 py-12 sm:px-8 lg:col-span-2 lg:py-16">
          <div className="max-w-lg space-y-8">
            {children}
            <div className="border-t border-line pt-6 text-sm text-muted">{footer}</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

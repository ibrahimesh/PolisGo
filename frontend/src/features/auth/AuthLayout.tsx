import type { ReactNode } from 'react';
import { AccentHeading } from '../../components/layout/Section';

interface AuthLayoutProps {
  // Kept for the document outline; not rendered as an eyebrow label.
  label: string;
  lead: string;
  accent: string;
  intro: string;
  footer: ReactNode;
  children: ReactNode;
}

// Asymmetric editorial split: a large serif statement on the left, the form
// on a hairline-ruled column to the right.
export function AuthLayout({ lead, accent, intro, footer, children }: AuthLayoutProps) {
  return (
    <div className="border-b border-line">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-0 lg:px-8 lg:py-24">
        <div className="lg:col-span-5 lg:pr-12">
          <AccentHeading as="h1" id="auth-title" size="section" lead={lead} accent={accent}>
            <p className="max-w-md text-lg text-muted">{intro}</p>
          </AccentHeading>
        </div>
        <div className="lg:col-span-6 lg:col-start-7 lg:border-l lg:border-line lg:pl-12">
          <div className="max-w-xl space-y-8">
            {children}
            <div className="border-t border-line pt-6 text-muted">{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { AccentHeading } from '../../components/layout/Section';

interface SectionHeaderProps {
  id: string;
  lead: string;
  accent: string;
  intro?: ReactNode;
}

// Asymmetric section opener: the serif heading takes seven columns, the
// supporting sentence sits offset in the last four, aligned to its baseline.
export function SectionHeader({ id, lead, accent, intro }: SectionHeaderProps) {
  return (
    <div className="grid gap-6 px-4 pt-16 pb-12 sm:px-6 lg:grid-cols-12 lg:px-8 lg:pt-24">
      <AccentHeading id={id} lead={lead} accent={accent} className="lg:col-span-7" />
      {intro && (
        <p className="max-w-md self-end text-lg text-muted lg:col-span-4 lg:col-start-9">{intro}</p>
      )}
    </div>
  );
}

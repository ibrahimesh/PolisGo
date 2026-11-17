import { cx } from './cx';

// Class recipes shared by several components (kept out of .tsx files so
// React Fast Refresh can hot-swap the components themselves).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 ease-institutional select-none disabled:cursor-not-allowed disabled:opacity-50';

// The accent fill is reserved for the one primary action in view.
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80',
  secondary: 'border border-line-strong text-text hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
};

// Heights on the 8pt grid: 36 / 48 / 56.
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-12 px-6 text-base',
  lg: 'h-14 px-8 text-base',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export const controlClasses =
  'h-12 w-full rounded-sm border border-line-strong bg-surface px-4 text-base text-text tabular transition-colors duration-150 placeholder:text-muted hover:border-text/50 aria-invalid:border-danger disabled:opacity-50';

export function describedBy(
  id: string,
  { hint, error }: { hint?: unknown; error?: string | undefined },
): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

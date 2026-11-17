import { cx } from './cx';

// Class recipes shared by several components (kept out of .tsx files so
// React Fast Refresh can hot-swap the components themselves).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium tracking-[-0.005em] whitespace-nowrap transition-[background-color,border-color,color,opacity] duration-150 ease-institutional select-none disabled:cursor-not-allowed disabled:opacity-50';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80',
  secondary: 'border border-line-strong text-text hover:bg-surface-2 hover:border-text/40',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-11 px-5 text-[0.9375rem]',
  lg: 'h-13 px-7 text-base',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export const controlClasses =
  'h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-[0.9375rem] text-text tabular transition-colors duration-150 placeholder:text-muted/70 hover:border-text/40 aria-invalid:border-danger disabled:opacity-50';

export function describedBy(
  id: string,
  { hint, error }: { hint?: unknown; error?: string | undefined },
): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

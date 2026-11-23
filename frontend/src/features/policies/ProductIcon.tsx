import { cx } from '../../components/ui/cx';

// Product marks for the catalogue, drawn on a 24px grid with the icon
// family's 1.5px stroke. MTPL (liability to others) is two vehicles; CASCO
// (damage to your own) is one vehicle with an impact mark. A code added
// later gets the generic document mark instead of nothing.
const PATHS: Record<string, string[]> = {
  MTPL: [
    'M1.75 13.5h9.5v4.25h-9.5Z',
    'M3 13.5l1.25-3.25h5l1.25 3.25',
    'M3.5 17.75v1.75M9.5 17.75v1.75',
    'M12.75 9.5h9.5v4.25h-9.5Z',
    'M14 9.5l1.25-3.25h5l1.25 3.25',
    'M14.5 13.75v1.75M20.5 13.75v1.75',
  ],
  CASCO: [
    'M3.5 13h14v5h-14Z',
    'M5.5 13l1.75-4.5h6.5L15.5 13',
    'M6 18v2M15 18v2',
    'M6.5 15.5H8M13 15.5h1.5',
    'M19.5 2.5v2.5M22.25 5.75h-2.5M21.5 3.5l-1.25 1.25',
  ],
};
const FALLBACK = ['M6 2.75h8.5l3.5 3.5v15h-12Z', 'M14.5 2.75v3.5H18M9 11h6M9 15h6'];

export function ProductIcon({ code, className }: { code: string; className?: string }) {
  const paths = PATHS[code] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-product-icon={code}
      className={cx('shrink-0', className)}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// The product mark in a hairline square, accent stroke: readable on the
// page background in both themes (accent on bg is 7.3:1 dark, 6.6:1 light).
export function ProductBadge({ code }: { code: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm border border-line-strong text-accent">
      <ProductIcon code={code} />
    </span>
  );
}

import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from './cx';

// Thin wrappers over semantic table elements. Hairline rows, mono headers,
// tabular numerals. `tone` on the parent context is expressed via classes.

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    // relative contains absolutely positioned sr-only cell text in the scroll clip.
    <div className="relative w-full overflow-x-auto">
      <table className={cx('w-full border-collapse text-base tabular', className)} {...rest} />
    </div>
  );
}

export function Caption({ className, ...rest }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cx('sr-only', className)} {...rest} />;
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TFoot(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot {...props} />;
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx('border-b border-current/12 last:border-b-0', className)} {...rest} />;
}

// Column headers use the mono label voice; row headers read as normal text.
export function Th({ className, scope = 'col', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cx(
        scope === 'row'
          ? 'py-3 pr-4 text-left font-normal'
          : 'py-3 pr-4 text-left text-sm font-medium opacity-80',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx('py-3 pr-4 align-middle', className)} {...rest} />;
}

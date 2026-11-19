import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui/cx';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { niceMax, niceTicks } from './chartScale';

export interface BarDatum {
  key: string;
  // Short axis label ("Mar") and the full one for tooltips and the table.
  label: string;
  fullLabel: string;
  value: number;
}

const HEIGHT = 224;
const PAD = { top: 16, right: 8, bottom: 32 };
// About one 14px digit; the axis gutter fits its longest label.
const CHAR_WIDTH = 8.5;
const MIN_LABEL_GAP = 44;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// One series over time, one hue (the accent): no legend, the title names it.
// Drawn at the container's real width so its text stays on the type scale.
// Hover or the arrow keys show each value; the same numbers are a table.
export function BarChart({
  title,
  data,
  format,
  axisFormat = format,
  integer = false,
}: {
  title: string;
  data: readonly BarDatum[];
  // Tooltips and the table: the full value ("1,240.00 AZN").
  format: (value: number) => string;
  // The axis: short numbers; the title carries the unit.
  axisFormat?: (value: number) => string;
  // Counts: no half-step gridline.
  integer?: boolean;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [containerRef, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = niceTicks(top, integer);
  const left = 12 + CHAR_WIDTH * Math.max(...ticks.map((tick) => axisFormat(tick).length));
  const plotWidth = Math.max(0, width - left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const band = data.length > 0 ? plotWidth / data.length : 0;
  const barWidth = Math.max(2, Math.min(40, band * 0.6));
  const every = Math.max(1, Math.ceil(MIN_LABEL_GAP / Math.max(band, 1)));
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const shown = active === null ? null : data[active];

  const onKey = (event: KeyboardEvent) => {
    if (data.length === 0) return;
    const last = data.length - 1;
    const next: Record<string, number> = {
      ArrowRight: Math.min(last, (active ?? -1) + 1),
      ArrowLeft: Math.max(0, (active ?? 1) - 1),
      Home: 0,
      End: last,
    };
    if (event.key in next) {
      event.preventDefault();
      setActive(next[event.key] ?? null);
    }
  };

  return (
    <figure className="space-y-3">
      <figcaption id={titleId} className="font-sans text-base font-medium">
        {title}
      </figcaption>
      <div ref={containerRef} className="relative">
        {width > 0 && (
          // The chart is one tab stop; the arrow keys walk the bars.
          <svg
            width={width}
            height={HEIGHT}
            role="group"
            aria-labelledby={titleId}
            aria-describedby={`${titleId}-help`}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onMouseLeave={() => setActive(null)}
            className="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-line"
                  strokeWidth={1}
                />
                <text
                  x={left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted text-sm tabular"
                >
                  {axisFormat(tick)}
                </text>
              </g>
            ))}
            {data.map((d, index) => {
              const x = left + index * band + (band - barWidth) / 2;
              const barTop = y(d.value);
              const height = Math.max(0, PAD.top + plotHeight - barTop);
              return (
                <g key={d.key} onMouseEnter={() => setActive(index)}>
                  {/* A hit area the full band wide and tall, bigger than the bar. */}
                  <rect
                    x={left + index * band}
                    y={PAD.top}
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                  />
                  {height > 0 && (
                    <path
                      d={`M${x},${barTop + Math.min(2, height)} q0,-2 2,-2 h${barWidth - 4} q2,0 2,2 V${PAD.top + plotHeight} H${x} Z`}
                      className={cx(
                        'fill-accent transition-opacity',
                        active !== null && active !== index && 'opacity-40',
                      )}
                    />
                  )}
                  {index % every === 0 && (
                    <text
                      x={left + index * band + band / 2}
                      y={HEIGHT - 10}
                      textAnchor="middle"
                      className="fill-muted text-sm"
                    >
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {shown && active !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 rounded-sm border border-line bg-surface px-3 py-2 text-sm whitespace-nowrap shadow-[0_8px_24px_-12px_rgb(0_0_0/0.5)]"
            style={{
              left: Math.min(
                Math.max(0, left + active * band + band / 2 - 70),
                Math.max(0, width - 140),
              ),
            }}
          >
            <span className="block text-muted">{shown.fullLabel}</span>
            <span className="font-medium tabular">{format(shown.value)}</span>
          </div>
        )}
        <p id={`${titleId}-help`} className="sr-only">
          {t('admin.dashboard.chartHelp')}
        </p>
        <p aria-live="polite" className="sr-only">
          {shown ? `${shown.fullLabel}: ${format(shown.value)}` : ''}
        </p>
      </div>
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 hover:text-text">
          {t('admin.dashboard.showTable')}
        </summary>
        <div className="mt-3">
          <Table>
            <Caption>{title}</Caption>
            <THead>
              <Tr className="border-line">
                <Th>{t('admin.dashboard.period')}</Th>
                <Th className="text-right">{t('admin.dashboard.value')}</Th>
              </Tr>
            </THead>
            <TBody>
              {data.map((d) => (
                <Tr key={d.key} className="border-line">
                  <Td>{d.fullLabel}</Td>
                  <Td className="text-right tabular">{format(d.value)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </details>
    </figure>
  );
}

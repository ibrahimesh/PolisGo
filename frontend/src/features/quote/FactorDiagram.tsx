import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { PremiumBreakdown } from '../../api/types';
import { useFormatters } from '../../i18n/format';
import { useTweenedValues } from '../../lib/hooks';
import { FACTOR_KEYS } from './factors';

const CENTER = 200;
const RADIUS = 140;
// Largest multiplier in the tariff is ×1.60; leave headroom so it isn't on the rim.
const SCALE_MAX = 1.7;
const LABEL_AT = SCALE_MAX + 0.24;
const RINGS = [0.5, 1, 1.5] as const;
const LINE_EM = 1.15;

// Font sizes are SVG user units, scaled with the drawing: at its desktop
// width (~512px for a 560-unit viewBox) 16/17 units render at ~14.5/15.5px.
// On phones the drawing is ~55% size, which would put labels under 14px, so
// they are hidden there; the breakdown table right below lists every factor.
const LABEL_CLASS = 'fill-paper-muted font-sans text-[16px] font-medium max-sm:hidden';
const VALUE_CLASS = 'fill-paper-ink font-sans text-[17px] tabular max-sm:hidden';

function polar(value: number, index: number, count: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const r = (Math.min(Math.max(value, 0), SCALE_MAX) / SCALE_MAX) * RADIUS;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle), angle };
}

// Wireframe radial plot: one axis per pricing factor, dashed ring at ×1.00.
// Purely visual — the breakdown table carries the same data for assistive tech.
export function FactorDiagram({ breakdown }: { breakdown: PremiumBreakdown }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const titleId = useId();
  const descId = useId();

  const values = useTweenedValues(FACTOR_KEYS.map((key) => breakdown[key]));
  const count = FACTOR_KEYS.length;
  const points = values.map((value, i) => polar(value, i, count));

  // The neutral-ring caption sits mid-edge between the first two axes, where
  // no axis line or data point can run through it.
  const a = polar(1, 0, count);
  const b = polar(1, 1, count);

  return (
    <svg
      viewBox="-80 -44 560 488"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      className="h-auto w-full text-paper-ink"
    >
      <title id={titleId}>{t('calculator.diagramTitle')}</title>
      <desc id={descId}>{t('calculator.diagramDesc')}</desc>

      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={FACTOR_KEYS.map((_, i) => {
            const p = polar(ring, i, count);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity={ring === 1 ? 0.45 : 0.14}
          strokeDasharray={ring === 1 ? '3 4' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {FACTOR_KEYS.map((key, i) => {
        const end = polar(SCALE_MAX, i, count);
        return (
          <line
            key={key}
            x1={CENTER}
            y1={CENTER}
            x2={end.x}
            y2={end.y}
            stroke="currentColor"
            strokeOpacity={0.14}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      <text
        x={(a.x + b.x) / 2 + 6}
        y={(a.y + b.y) / 2 - 6}
        className="fill-paper-muted font-sans text-[16px] max-sm:hidden"
      >
        {format.factor(1)}
      </text>

      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        className="fill-paper-accent/8 stroke-paper-accent"
        strokeWidth={1.25}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {points.map((p, i) => (
        <circle
          key={FACTOR_KEYS[i]}
          cx={p.x}
          cy={p.y}
          r={3}
          className="fill-paper stroke-paper-accent"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {FACTOR_KEYS.map((key, i) => {
        const { x, y, angle } = polar(LABEL_AT, i, count);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
        // One word per line keeps long RU/AZ names inside the drawing.
        const lines = t(`calculator.factor.${key}`).split(' ');
        const total = lines.length + 1;
        const firstDy =
          sin < -0.5
            ? -(total - 1) * LINE_EM - 0.3
            : sin > 0.5
              ? 0.9
              : -((total - 1) * LINE_EM) / 2 + 0.35;

        return (
          <text key={key} x={x} y={y} textAnchor={anchor}>
            {lines.map((line, li) => (
              <tspan
                key={li}
                x={x}
                dy={`${li === 0 ? firstDy : LINE_EM}em`}
                className={LABEL_CLASS}
              >
                {line}
              </tspan>
            ))}
            <tspan x={x} dy={`${LINE_EM + 0.1}em`} className={VALUE_CLASS}>
              {format.factor(breakdown[key])}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

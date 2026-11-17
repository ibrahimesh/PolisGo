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
const RINGS = [0.5, 1, 1.5] as const;

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

  return (
    <svg
      viewBox="-80 -6 560 412"
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
        x={CENTER + 4}
        y={CENTER - (1 / SCALE_MAX) * RADIUS - 4}
        className="fill-paper-muted font-mono text-[9px] tracking-[0.08em]"
      >
        ×1.00
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
        const { x, y, angle } = polar(SCALE_MAX + 0.24, i, count);
        const cos = Math.cos(angle);
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
        const dy = Math.sin(angle) < -0.5 ? -12 : Math.sin(angle) > 0.5 ? 6 : -4;
        return (
          <text key={key} x={x} y={y + dy} textAnchor={anchor}>
            <tspan className="fill-paper-muted font-mono text-[10px] tracking-[0.08em] uppercase">
              {t(`calculator.factor.${key}`)}
            </tspan>
            <tspan x={x} dy={15} className="fill-paper-ink font-mono text-[12px] tabular">
              {format.factor(breakdown[key])}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

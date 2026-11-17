import { cx } from '../ui/cx';

// Wireframe "risk surface": a receding grid with one plotted curve. Pure
// decoration in hairlines; hidden from assistive tech.
export function SurfaceLineArt({ className }: { className?: string }) {
  const horizon = 40;
  const vanishX = 200;
  const rows = [70, 92, 120, 156, 202, 260];
  const columns = [-260, -160, -80, 0, 80, 160, 260, 380, 520, 660];

  return (
    <svg
      viewBox="0 0 400 280"
      aria-hidden="true"
      className={cx('text-line-strong', className)}
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="currentColor" fill="none" vectorEffect="non-scaling-stroke">
        <line x1="0" y1={horizon} x2="400" y2={horizon} strokeOpacity=".7" />
        {rows.map((y) => (
          <line key={y} x1="0" y1={y} x2="400" y2={y} strokeOpacity=".55" />
        ))}
        {columns.map((x) => (
          <line key={x} x1={vanishX} y1={horizon} x2={x} y2="280" strokeOpacity=".55" />
        ))}
      </g>
      <path
        d="M24 224 C 90 210, 120 150, 168 132 S 250 96, 300 84 S 360 70, 384 64"
        fill="none"
        className="stroke-accent"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      {[
        [24, 224],
        [168, 132],
        [300, 84],
      ].map(([cx, cy]) => (
        <circle
          key={cx}
          cx={cx}
          cy={cy}
          r="3"
          className="fill-bg stroke-accent"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

// Concentric frames used behind error pages.
export function FramesLineArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" className={cx('text-line-strong', className)}>
      <g fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke">
        {[0, 24, 48, 72, 96].map((inset) => (
          <rect
            key={inset}
            x={inset + 0.5}
            y={inset + 0.5}
            width={239 - inset * 2}
            height={239 - inset * 2}
          />
        ))}
        <path d="M0.5 239.5 239.5 0.5M0.5 0.5 239.5 239.5" strokeOpacity=".5" />
      </g>
    </svg>
  );
}

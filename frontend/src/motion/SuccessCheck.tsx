// A check drawn into a hairline square once the purchase or claim is done:
// the frame fades in, then the two strokes of the check grow from where a
// pen would start them (scaleX on each stroke, so only transform and opacity
// animate). Decorative; the page's heading says what happened.
export function SuccessCheck() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      data-testid="success-check"
      className="success-check shrink-0 text-success"
    >
      <rect className="success-check-frame" x="0.75" y="0.75" width="46.5" height="46.5" rx="2" />
      {/* Short stroke: from (14,25) down-right to (21,32), 45°. */}
      <g transform="translate(14 25) rotate(45)">
        <path className="success-check-a" d="M0 0h9.9" />
      </g>
      {/* Long stroke: from (21,32) up-right to (35,17), about -47°. */}
      <g transform="translate(21 32) rotate(-47)">
        <path className="success-check-b" d="M0 0h20.5" />
      </g>
    </svg>
  );
}

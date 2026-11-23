import type { ReactNode } from 'react';
import type { ErrorKind } from './errorKind';

// Small line drawings for the error pages, in the wordmark's language: a
// hairline "document" frame with one accent element that settles into place
// once (transform and opacity only, 150–400ms, nothing loops). Under reduced
// motion the global rule ends every animation at its final frame.
const FRAME = 'M20 14h40l16 16v52H20Z';
const FOLD = 'M60 14v16h16';

function Glyph({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width="96"
      height="96"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-glyph={label}
      className="glyph shrink-0 text-muted"
    >
      <g className="glyph-frame">
        <path d={FRAME} />
        <path d={FOLD} />
      </g>
      <g className="text-accent">{children}</g>
    </svg>
  );
}

export function ErrorGlyph({ kind }: { kind: ErrorKind }) {
  switch (kind) {
    case 'notFound':
      // A magnifier slides in over an empty page.
      return (
        <Glyph label={kind}>
          <g className="glyph-slide">
            <circle cx="50" cy="54" r="12" />
            <path d="M59 63l12 12" />
          </g>
        </Glyph>
      );
    case 'forbidden':
      // A lock drops onto the page.
      return (
        <Glyph label={kind}>
          <g className="glyph-drop">
            <rect x="36" y="50" width="24" height="18" rx="1" />
            <path d="M41 50v-6a7 7 0 0 1 14 0v6M48 57v4" />
          </g>
        </Glyph>
      );
    case 'server':
      // The page cracks: two strokes appear one after the other.
      return (
        <Glyph label={kind}>
          <path className="glyph-fade" d="M34 38l10 12-6 6 12 14" />
          <path className="glyph-fade glyph-delay" d="M56 40l-4 10 8 4-4 12" />
        </Glyph>
      );
    case 'sessionExpired':
      // A clock hand turns to the hour.
      return (
        <Glyph label={kind}>
          <circle cx="48" cy="54" r="16" />
          <path className="glyph-turn" d="M48 54V44" />
          <path d="M48 54l7 4" />
        </Glyph>
      );
    case 'offline':
      // Signal arcs fade in, then a slash crosses them.
      return (
        <Glyph label={kind}>
          <path className="glyph-fade" d="M34 52a20 20 0 0 1 28 0" />
          <path className="glyph-fade glyph-delay" d="M40 58a11 11 0 0 1 16 0" />
          <path d="M48 64h.01" />
          <path className="glyph-fade glyph-delay-2" d="M32 70l32-30" />
        </Glyph>
      );
    case 'unreachable':
      // A plug and a socket arrive and stop short of each other.
      return (
        <Glyph label={kind}>
          <g className="glyph-slide-left">
            <path d="M28 56h8M36 50h6v12h-6ZM42 53h3M42 59h3" />
          </g>
          <g className="glyph-slide">
            <path d="M68 56h-8M54 50h6v12h-6Z" />
          </g>
        </Glyph>
      );
    case 'maintenance':
      // A wrench turns into place.
      return (
        <Glyph label={kind}>
          <path
            className="glyph-turn"
            d="M58 40a8 8 0 0 0-10 10L36 62l4 4 12-12a8 8 0 0 0 10-10l-5 5-4-1-1-4Z"
          />
        </Glyph>
      );
  }
}

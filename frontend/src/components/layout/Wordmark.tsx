// Original mark: a framed square cut by a diagonal and a vertical — a policy
// "document" reduced to hairlines. Deliberately not shield- or crest-shaped.
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6 text-accent" aria-hidden="true">
        <rect
          x="2.75"
          y="2.75"
          width="18.5"
          height="18.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M2.75 21.25 21.25 2.75M12 2.75v18.5"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <span className="font-serif text-lg tracking-[-0.02em]">
        Polis<em className="text-accent">Go</em>
      </span>
    </span>
  );
}

// Original mark: a framed square cut by a diagonal and a vertical — a policy
// "document" reduced to hairlines. Deliberately not shield- or crest-shaped.
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="size-6 text-accent" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" fill="none" stroke="currentColor" />
        <path d="M2.5 21.5 21.5 2.5M12 2.5v19" stroke="currentColor" fill="none" />
      </svg>
      <span className="font-serif text-[1.375rem] leading-none tracking-[-0.02em]">
        Polis<em className="text-accent">Go</em>
      </span>
    </span>
  );
}

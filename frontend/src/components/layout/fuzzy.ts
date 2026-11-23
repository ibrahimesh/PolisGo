// Small fuzzy matcher for the command palette: the query's characters must
// appear in order (a subsequence), case- and accent-insensitively. Matches at
// word starts and runs of consecutive characters score higher, so "cov"
// ranks "Coverage" above "Recovery", and "ar" finds "Audit log" via "a…r".

export interface FuzzyMatch {
  score: number;
  // Indexes into the original text, for highlighting.
  indexes: number[];
}

// Lower-case and strip combining marks so "e" finds "ə"/"é" as well;
// Azerbaijani ı/İ fold to i. Keeps one output char per input char.
function fold(char: string): string {
  const lower = char.toLocaleLowerCase();
  if (lower === 'ı' || lower === 'i̇') return 'i';
  if (lower === 'ə') return 'e';
  const base = lower.normalize('NFD').charAt(0);
  return base || lower;
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text.charAt(index - 1);
  return /[\s\-–—/(·.,]/.test(previous);
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = Array.from(query.trim())
    .map(fold)
    .filter((c) => c.trim() !== '');
  if (needle.length === 0) return { score: 0, indexes: [] };
  const chars = Array.from(text);
  const folded = chars.map(fold);

  // Greedy from each possible start, keep the best-scoring alignment.
  let best: FuzzyMatch | null = null;
  for (let start = 0; start < folded.length; start++) {
    if (folded[start] !== needle[0]) continue;
    const indexes = [start];
    let cursor = start + 1;
    for (let n = 1; n < needle.length && indexes.length === n; n++) {
      // Prefer the next word start that matches, else the next character.
      let found = -1;
      for (let i = cursor; i < folded.length; i++) {
        if (folded[i] !== needle[n]) continue;
        if (i === cursor || isWordStart(text, i)) {
          found = i;
          break;
        }
        if (found < 0) found = i;
      }
      if (found < 0) break;
      indexes.push(found);
      cursor = found + 1;
    }
    if (indexes.length !== needle.length) continue;

    let score = 0;
    indexes.forEach((index, i) => {
      score += 1;
      if (isWordStart(text, index)) score += 3;
      if (i > 0 && index === (indexes[i - 1] ?? -2) + 1) score += 2;
    });
    // A match that starts earlier, and a shorter text, read as closer.
    score -= start * 0.05 + chars.length * 0.01;
    if (!best || score > best.score) best = { score, indexes };
  }
  return best;
}

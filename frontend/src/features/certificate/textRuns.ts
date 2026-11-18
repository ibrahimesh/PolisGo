// Fontsource ships each typeface split by Unicode subset (latin, latin-ext,
// cyrillic), as browsers load them via unicode-range. A PDF has no such
// fallback, so text is cut into runs, each drawn with the first face that has
// the glyph. "Məmmədova" becomes M | ə | mm | ə | dova across two files.

export interface GlyphSource {
  hasGlyph(codePoint: number): boolean;
}

export interface TextRun<F> {
  face: F;
  text: string;
}

export function splitRuns<F extends GlyphSource>(text: string, faces: readonly F[]): TextRun<F>[] {
  const fallback = faces[0];
  if (!fallback) throw new Error('splitRuns needs at least one face.');

  const runs: TextRun<F>[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    // Spaces and punctuation stay in the current run instead of switching.
    const current = runs.at(-1);
    const face =
      current && current.face.hasGlyph(codePoint)
        ? current.face
        : (faces.find((f) => f.hasGlyph(codePoint)) ?? fallback);
    if (current && current.face === face) current.text += char;
    else runs.push({ face, text: char });
  }
  return runs;
}

// Which subsets a set of strings needs, so only those font files are fetched.
export type Subset = 'latin' | 'latin-ext' | 'cyrillic';

// Cyrillic letters (U+0400–04FF), plus the numero sign (U+2116), which Fontsource ships only in
// the Cyrillic file although Azerbaijani uses it too.
const CYRILLIC = /[Ѐ-ӿ№]/u;
// Latin Extended A/B (U+0100–024F), ə (U+0259), Latin Extended Additional
// (U+1E00–1EFF) and currency signs (U+20A0–20C0, ₼);
// ı (U+0131) is left out because the base Latin file has it.
const LATIN_EXT = /[Ā-İĲ-ɏəḀ-ỿ₠-⃀]/u;

export function subsetsFor(texts: readonly string[]): Subset[] {
  const all = texts.join(' ');
  const subsets: Subset[] = ['latin'];
  if (LATIN_EXT.test(all)) subsets.push('latin-ext');
  if (CYRILLIC.test(all)) subsets.push('cyrillic');
  return subsets;
}

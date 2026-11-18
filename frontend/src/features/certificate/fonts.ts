import interLatin500 from '@fontsource/inter-tight/files/inter-tight-latin-500-normal.woff?url';
import interLatin400 from '@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff?url';
import interCyrillic500 from '@fontsource/inter-tight/files/inter-tight-cyrillic-500-normal.woff?url';
import interCyrillic400 from '@fontsource/inter-tight/files/inter-tight-cyrillic-400-normal.woff?url';
import interExt500 from '@fontsource/inter-tight/files/inter-tight-latin-ext-500-normal.woff?url';
import interExt400 from '@fontsource/inter-tight/files/inter-tight-latin-ext-400-normal.woff?url';
import serifLatinItalic from '@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff?url';
import serifLatin from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff?url';
import serifCyrillicItalic from '@fontsource/source-serif-4/files/source-serif-4-cyrillic-400-italic.woff?url';
import serifCyrillic from '@fontsource/source-serif-4/files/source-serif-4-cyrillic-400-normal.woff?url';
import serifExtItalic from '@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-italic.woff?url';
import serifExt from '@fontsource/source-serif-4/files/source-serif-4-latin-ext-400-normal.woff?url';
import type { FaceKey, FontFiles } from './certificatePdf';
import type { Subset } from './textRuns';

// Static (non-variable) WOFF files: fontkit embeds their outlines directly.
// Only URLs live in this chunk; the files are fetched for the subsets a
// certificate actually uses (about 20–40 KB each).
export const FONT_URLS: Record<FaceKey, Record<Subset, string>> = {
  sans: { latin: interLatin400, 'latin-ext': interExt400, cyrillic: interCyrillic400 },
  sansMedium: { latin: interLatin500, 'latin-ext': interExt500, cyrillic: interCyrillic500 },
  serif: { latin: serifLatin, 'latin-ext': serifExt, cyrillic: serifCyrillic },
  serifItalic: {
    latin: serifLatinItalic,
    'latin-ext': serifExtItalic,
    cyrillic: serifCyrillicItalic,
  },
};

export async function loadFonts(subsets: readonly Subset[]): Promise<FontFiles> {
  const entries = await Promise.all(
    (Object.keys(FONT_URLS) as FaceKey[]).map(async (face) => {
      const files = await Promise.all(
        subsets.map(async (subset) => {
          const response = await fetch(FONT_URLS[face][subset]);
          if (!response.ok) throw new Error(`Font ${face}/${subset}: HTTP ${response.status}`);
          return [subset, new Uint8Array(await response.arrayBuffer())] as const;
        }),
      );
      return [face, Object.fromEntries(files)] as const;
    }),
  );
  return Object.fromEntries(entries) as FontFiles;
}

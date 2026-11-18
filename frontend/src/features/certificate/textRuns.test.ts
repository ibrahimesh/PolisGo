import { splitRuns, subsetsFor } from './textRuns';

// Stand-ins for the three Fontsource subset files.
const latin = {
  name: 'latin',
  hasGlyph: (cp: number) => cp <= 0xff || cp === 0x131 || cp === 0x2014,
};
const ext = { name: 'ext', hasGlyph: (cp: number) => (cp >= 0x100 && cp <= 0x24f) || cp === 0x259 };
const cyr = { name: 'cyr', hasGlyph: (cp: number) => cp >= 0x400 && cp <= 0x4ff };
const faces = [latin, ext, cyr];

const render = (text: string) =>
  splitRuns(text, faces).map((run) => `${run.face.name}:${run.text}`);

describe('splitRuns', () => {
  it('cuts Azerbaijani names where the subset changes', () => {
    expect(render('Məmmədova')).toEqual(['latin:M', 'ext:ə', 'latin:mm', 'ext:ə', 'latin:dova']);
  });

  it('keeps Azerbaijani letters that live in the base Latin file there', () => {
    // ı (U+0131) and ç are in the Latin file; only ğ needs latin-ext.
    expect(render('Sığorta çox')).toEqual(['latin:Sı', 'ext:ğ', 'latin:orta çox']);
  });

  it('never draws a character with a face that lacks it, spaces included', () => {
    expect(render('Иван Петров, 10-AA')).toEqual([
      'cyr:Иван',
      'latin: ',
      'cyr:Петров',
      'latin:, 10-AA',
    ]);
  });

  it('keeps a shared character in the running face instead of switching', () => {
    const cyrWithSpace = { name: 'cyr', hasGlyph: (cp: number) => cyr.hasGlyph(cp) || cp === 0x20 };
    const runs = splitRuns('Иван Петров', [latin, ext, cyrWithSpace]).map((r) => r.text);
    expect(runs).toEqual(['Иван Петров']);
  });

  it('falls back to the first face for glyphs no file has', () => {
    expect(render('✓')).toEqual(['latin:✓']);
  });
});

describe('subsetsFor', () => {
  it('loads only the subsets the text needs', () => {
    expect(subsetsFor(['Certificate of insurance', '1 200,00 AZN'])).toEqual(['latin']);
    expect(subsetsFor(['Sığorta şəhadətnaməsi'])).toEqual(['latin', 'latin-ext']);
    expect(subsetsFor(['Страховой сертификат'])).toEqual(['latin', 'cyrillic']);
  });
});

import * as fontkitModule from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { splitRuns } from './textRuns';
import type { GlyphSource, Subset } from './textRuns';

// The certificate is drawn with pdf-lib (MIT) and the app's own typefaces —
// Inter Tight and Source Serif 4 (OFL, via Fontsource) — so it reads as the
// same institution as the screen. Everything here is language-agnostic: the
// caller passes translated, formatted strings.

// The package's types declare named exports, but its ES build has only a
// default export; accept either shape.
const fontkit: typeof fontkitModule =
  (fontkitModule as unknown as { default?: typeof fontkitModule }).default ?? fontkitModule;

export type FaceKey = 'sans' | 'sansMedium' | 'serif' | 'serifItalic';
export type FontFiles = Record<FaceKey, Partial<Record<Subset, Uint8Array>>>;

export interface Row {
  label: string;
  value: string;
}

export interface CertificateContent {
  language: string;
  titleLead: string;
  titleAccent: string;
  product: string;
  productHint: string;
  numberLabel: string;
  policyNumber: string;
  status: string;
  sections: { heading: string; rows: Row[] }[];
  coverage: { heading: string; items: string[] };
  pricing: { heading: string; rows: Row[]; total: Row } | null;
  notes: string[];
  footer: string;
  documentTitle: string;
}

// Paper card colours from DESIGN.md; ivory, never pure white.
const PAPER = rgb(0xee / 255, 0xec / 255, 0xe6 / 255);
const INK = rgb(0x14 / 255, 0x16 / 255, 0x1f / 255);
const MUTED = rgb(0x47 / 255, 0x4a / 255, 0x57 / 255);
const ACCENT = rgb(0x34 / 255, 0x3a / 255, 0x96 / 255);
// paper-line (ink at 14%) flattened onto the paper.
const LINE = rgb(0xcf / 255, 0xce / 255, 0xca / 255);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

interface Face extends GlyphSource {
  font: PDFFont;
}

// Draws strings across subset files, measuring and wrapping by runs.
class Writer {
  private readonly page: PDFPage;
  private readonly faces: Record<FaceKey, Face[]>;

  constructor(page: PDFPage, faces: Record<FaceKey, Face[]>) {
    this.page = page;
    this.faces = faces;
  }

  width(text: string, key: FaceKey, size: number): number {
    return splitRuns(text, this.faces[key]).reduce(
      (sum, run) => sum + run.face.font.widthOfTextAtSize(run.text, size),
      0,
    );
  }

  draw(text: string, x: number, y: number, key: FaceKey, size: number, color: RGB = INK) {
    let cursor = x;
    for (const run of splitRuns(text, this.faces[key])) {
      this.page.drawText(run.text, { x: cursor, y, size, font: run.face.font, color });
      cursor += run.face.font.widthOfTextAtSize(run.text, size);
    }
    return cursor;
  }

  wrap(text: string, key: FaceKey, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && this.width(candidate, key, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  hairline(y: number, from = MARGIN, to = A4[0] - MARGIN) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness: 0.75, color: LINE });
  }
}

export async function buildCertificatePdf(
  content: CertificateContent,
  files: FontFiles,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(content.documentTitle);
  doc.setSubject(content.policyNumber);
  doc.setAuthor('PolisGo');
  doc.setCreator('PolisGo');
  doc.setLanguage(content.language);

  const faces = {} as Record<FaceKey, Face[]>;
  for (const key of Object.keys(files) as FaceKey[]) {
    faces[key] = [];
    for (const bytes of Object.values(files[key])) {
      // fontkit reads the cmap for coverage; pdf-lib embeds only used glyphs.
      const metrics = fontkit.create(bytes);
      const font = await doc.embedFont(bytes, { subset: true });
      faces[key].push({ font, hasGlyph: (cp) => metrics.hasGlyphForCodePoint(cp) });
    }
  }

  const page = doc.addPage(A4);
  const [width, height] = A4;
  const w = new Writer(page, faces);
  const contentWidth = width - MARGIN * 2;

  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });

  // Masthead: the wordmark's framed square with its diagonal and vertical.
  let y = height - MARGIN;
  const mark = 18;
  page.drawRectangle({
    x: MARGIN,
    y: y - mark,
    width: mark,
    height: mark,
    borderColor: ACCENT,
    borderWidth: 1.1,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - mark },
    end: { x: MARGIN + mark, y },
    thickness: 1.1,
    color: ACCENT,
  });
  page.drawLine({
    start: { x: MARGIN + mark / 2, y: y - mark },
    end: { x: MARGIN + mark / 2, y },
    thickness: 1.1,
    color: ACCENT,
  });
  const brandX = w.draw('Polis', MARGIN + mark + 8, y - 14, 'serif', 15);
  w.draw('Go', brandX, y - 14, 'serifItalic', 15, ACCENT);

  const numberLine = `${content.numberLabel} ${content.policyNumber}`;
  w.draw(numberLine, width - MARGIN - w.width(numberLine, 'sans', 9), y - 13, 'sans', 9, MUTED);

  // Title: serif lead, italic accent — the landing headline pattern.
  y -= 72;
  const leadEnd = w.draw(`${content.titleLead} `, MARGIN, y, 'serif', 30);
  w.draw(content.titleAccent, leadEnd, y, 'serifItalic', 30, ACCENT);

  y -= 26;
  const productEnd = w.draw(content.product, MARGIN, y, 'sansMedium', 12);
  w.draw(` · ${content.productHint}`, productEnd, y, 'sans', 12, MUTED);

  // Policy number and status.
  y -= 40;
  w.hairline(y + 22);
  w.draw(content.policyNumber, MARGIN, y - 4, 'serif', 22);
  const statusWidth = w.width(content.status, 'sansMedium', 10) + 16;
  const statusX = width - MARGIN - statusWidth;
  page.drawRectangle({
    x: statusX,
    y: y - 8,
    width: statusWidth,
    height: 20,
    borderColor: INK,
    borderWidth: 0.75,
  });
  w.draw(content.status, statusX + 8, y - 2, 'sansMedium', 10);
  y -= 26;
  w.hairline(y);

  // Sections in two columns, rows as label-over-value pairs.
  const columnWidth = (contentWidth - 24) / 2;
  y -= 28;
  for (let i = 0; i < content.sections.length; i += 2) {
    const pair = content.sections.slice(i, i + 2);
    let lowest = y;
    pair.forEach((section, column) => {
      const x = MARGIN + column * (columnWidth + 24);
      let cy = y;
      w.draw(section.heading, x, cy, 'sansMedium', 10, ACCENT);
      cy -= 18;
      for (const row of section.rows) {
        w.draw(row.label, x, cy, 'sans', 8.5, MUTED);
        cy -= 13;
        for (const line of w.wrap(row.value, 'sans', 11, columnWidth)) {
          w.draw(line, x, cy, 'sans', 11);
          cy -= 14;
        }
        cy -= 6;
      }
      lowest = Math.min(lowest, cy);
    });
    y = lowest - 12;
  }

  // Coverage (left) and the premium breakdown (right), side by side so the
  // whole certificate fits one page.
  w.hairline(y + 10);
  y -= 14;
  const top = y;
  w.draw(content.coverage.heading, MARGIN, y, 'sansMedium', 10, ACCENT);
  y -= 18;
  for (const item of content.coverage.items) {
    w.draw('•', MARGIN, y, 'sans', 11, ACCENT);
    for (const line of w.wrap(item, 'sans', 11, columnWidth - 14)) {
      w.draw(line, MARGIN + 14, y, 'sans', 11);
      y -= 15;
    }
  }

  if (content.pricing) {
    const left = MARGIN + columnWidth + 24;
    const right = width - MARGIN;
    let py = top;
    w.draw(content.pricing.heading, left, py, 'sansMedium', 10, ACCENT);
    py -= 18;
    for (const row of content.pricing.rows) {
      w.draw(row.label, left, py, 'sans', 10, MUTED);
      w.draw(row.value, right - w.width(row.value, 'sans', 10), py, 'sans', 10);
      py -= 15;
    }
    w.hairline(py + 9, left, right);
    py -= 10;
    w.draw(content.pricing.total.label, left, py, 'sansMedium', 11);
    const total = content.pricing.total.value;
    w.draw(total, right - w.width(total, 'serif', 16), py, 'serif', 16);
  }

  // Notes and footer sit at the bottom of the page.
  let ny = MARGIN + 34;
  const notes = content.notes.flatMap((note) => w.wrap(note, 'sans', 8.5, contentWidth));
  ny += notes.length * 12;
  w.hairline(ny + 8);
  for (const line of notes) {
    w.draw(line, MARGIN, ny - 6, 'sans', 8.5, MUTED);
    ny -= 12;
  }
  w.hairline(MARGIN + 18);
  w.draw(content.footer, MARGIN, MARGIN + 4, 'sans', 8.5, MUTED);

  return doc.save();
}

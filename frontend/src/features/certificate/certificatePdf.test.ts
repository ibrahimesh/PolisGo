/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as fontkitModule from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import type { PolicyDetailResponse } from '../../api/types';
import i18n, { LANGUAGES } from '../../i18n';
import type { Language } from '../../i18n';
import { createNumberFormatter, formatDateTime, formatIsoDate } from '../../i18n/format';
import { buildCertificatePdf } from './certificatePdf';
import type { FaceKey, FontFiles } from './certificatePdf';
import { certificateContent } from './certificateContent';
import { subsetsFor, splitRuns } from './textRuns';
import type { Subset } from './textRuns';

const fontkit =
  (fontkitModule as unknown as { default?: typeof fontkitModule }).default ?? fontkitModule;

// The same files fonts.ts points the browser at, read from node_modules.
const FILES: Record<FaceKey, string> = {
  sans: '@fontsource/inter-tight/files/inter-tight-{subset}-400-normal.woff',
  sansMedium: '@fontsource/inter-tight/files/inter-tight-{subset}-500-normal.woff',
  serif: '@fontsource/source-serif-4/files/source-serif-4-{subset}-400-normal.woff',
  serifItalic: '@fontsource/source-serif-4/files/source-serif-4-{subset}-400-italic.woff',
};

function fontFiles(subsets: readonly Subset[]): FontFiles {
  const result = {} as FontFiles;
  for (const [face, pattern] of Object.entries(FILES) as [FaceKey, string][]) {
    result[face] = Object.fromEntries(
      subsets.map((subset) => [
        subset,
        new Uint8Array(readFileSync(resolve('node_modules', pattern.replace('{subset}', subset)))),
      ]),
    );
  }
  return result;
}

const detail: PolicyDetailResponse = {
  policy: {
    id: '11111111-1111-4111-8111-111111111111',
    policyNumber: 'PG-2026-Q9PM6TGU',
    customerId: '22222222-2222-4222-8222-222222222222',
    vehicleId: '33333333-3333-4333-8333-333333333333',
    policyTypeId: '44444444-4444-4444-8444-444444444444',
    policyTypeCode: 'MTPL',
    agentId: null,
    startDate: '2026-11-18',
    endDate: '2027-11-17',
    premium: 49.16,
    currency: 'AZN',
    status: 'Active',
    createdAt: '2026-11-18T09:00:00Z',
    vehicle: {
      id: '33333333-3333-4333-8333-333333333333',
      make: 'Toyota',
      model: 'Corolla',
      year: 2019,
      plateNumber: '10-AA-123',
    },
    customerName: 'Leyla Məmmədova',
  },
  holderName: 'Leyla Məmmədova',
  vehicle: {
    id: '33333333-3333-4333-8333-333333333333',
    customerId: '22222222-2222-4222-8222-222222222222',
    make: 'Toyota',
    model: 'Corolla',
    year: 2019,
    engineCapacityCc: 1800,
    plateNumber: '10-AA-123',
    vin: '1HGBH41JXMN109186',
  },
  pricing: {
    baseRate: 50,
    engineFactor: 1.15,
    driverAgeFactor: 1,
    experienceFactor: 0.95,
    vehicleAgeFactor: 1,
    bonusMalusFactor: 0.9,
    termFactor: 1,
    totalFactor: 0.9833,
    premium: 49.16,
    currency: 'AZN',
  },
  payments: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      amount: 49.16,
      currency: 'AZN',
      method: 'Online',
      status: 'Completed',
      paidAt: '2026-11-18T09:05:00Z',
      reference: 'FAKE-1A2B3C4D5E6F7A8B',
    },
  ],
  history: [],
};

function contentFor(lang: Language, holderName = detail.holderName) {
  const money = createNumberFormatter(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const factor = createNumberFormatter(lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const integer = createNumberFormatter(lang, { maximumFractionDigits: 0 });
  return certificateContent(
    { ...detail, holderName },
    i18n.getFixedT(lang),
    {
      date: (d) => formatIsoDate(lang, d),
      dateTime: (d) => formatDateTime(lang, d),
      money: (v, c = 'AZN') => `${money(v)} ${c}`,
      factor: (v) => `×${factor(v)}`,
      integer,
    },
    lang,
    formatDateTime(lang, '2026-11-18T10:00:00'),
  );
}

describe.each(LANGUAGES)('certificate in %s', (lang) => {
  const content = contentFor(lang);
  const strings = [JSON.stringify(content)];
  const subsets = subsetsFor(strings);
  const files = fontFiles(subsets);

  it('has a glyph for every character it prints, in every face', () => {
    const collect = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (value && typeof value === 'object') return Object.values(value).flatMap(collect);
      return [];
    };
    const text = collect(content);
    for (const face of Object.keys(files) as FaceKey[]) {
      const faces = Object.values(files[face]).map((bytes) => {
        const font = fontkit.create(bytes);
        return { hasGlyph: (cp: number) => font.hasGlyphForCodePoint(cp) };
      });
      for (const line of text) {
        for (const run of splitRuns(line.replace(/\s/g, ''), faces)) {
          // Array.from walks code points, which is what the font maps.
          const missing = Array.from(run.text).filter(
            (ch) => !run.face.hasGlyph(ch.codePointAt(0) ?? 0),
          );
          expect(missing, `${face}: "${line}"`).toEqual([]);
        }
      }
    }
  });

  it('builds a one-page A4 PDF titled in the language', async () => {
    const bytes = await buildCertificatePdf(content, files);
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe(
      i18n.getFixedT(lang)('certificate.documentTitle', { number: 'PG-2026-Q9PM6TGU' }),
    );
    const [width, height] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});

it('loads only the subsets the names and the language need', () => {
  expect(subsetsFor([JSON.stringify(contentFor('en', 'Leyla Mammadova'))])).toEqual(['latin']);
  // An Azerbaijani name needs latin-ext even on an English certificate.
  expect(subsetsFor([JSON.stringify(contentFor('en'))])).toEqual(['latin', 'latin-ext']);
  expect(subsetsFor([JSON.stringify(contentFor('az'))])).toContain('latin-ext');
  expect(subsetsFor([JSON.stringify(contentFor('ru'))])).toContain('cyrillic');
  // The numero sign lives in the Cyrillic file.
  expect(subsetsFor([JSON.stringify(contentFor('az'))])).toContain('cyrillic');
});

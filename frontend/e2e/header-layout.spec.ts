import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openSession, registerSession, seedPreferences } from './helpers';

// 390 is the phone layout: the search button shrinks to its icon there.
const WIDTHS = [390, 1024, 1280, 1366, 1440] as const;
const LANGS = ['en', 'ru', 'az'] as const;

// Every visible link, button and kbd in the header sits on one line (its
// text's line boxes share a single top), inside the viewport, and no two
// items overlap. Run where the header would be most crowded.
async function expectSingleLineHeader(page: Page, label: string) {
  const report = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return { error: 'no header' };
    const items = [...header.querySelectorAll<HTMLElement>('a, button, kbd')].filter(
      (el) => el.getClientRects().length > 0 && !el.closest('[hidden]'),
    );
    const multiLine: string[] = [];
    for (const el of items) {
      // Line boxes of the visible text only (icons and sr-only names aside).
      const tops = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim() || node.parentElement?.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0) tops.add(Math.round(rect.top));
        }
      }
      if (tops.size > 1) multiLine.push(el.textContent.trim());
    }
    // Top-level items only (a kbd inside its button isn't a neighbour).
    const rects = items
      .filter((el) => !items.some((other) => other !== el && other.contains(el)))
      .map((el) => {
        const { left, right } = el.getBoundingClientRect();
        return { text: el.textContent.trim(), left, right };
      })
      .sort((a, b) => a.left - b.left);
    const overlaps: string[] = [];
    rects.slice(1).forEach((next, i) => {
      const prev = rects[i];
      if (prev.right > next.left + 0.5) overlaps.push(`${prev.text} / ${next.text}`);
    });
    const outside = rects.filter((r) => r.right > window.innerWidth).map((r) => r.text);
    return {
      multiLine,
      overlaps,
      outside,
      height: Math.round(header.getBoundingClientRect().height),
    };
  });
  expect(report, label).toEqual({ multiLine: [], overlaps: [], outside: [], height: 65 });
}

test.describe('Header layout', () => {
  for (const lang of LANGS) {
    test(`public header stays on one line in ${lang}`, async ({ page }) => {
      await seedPreferences(page, { lang });
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectSingleLineHeader(page, `${lang} ${width} signed out`);
      }
    });

    test(`signed-in headers stay on one line in ${lang}`, async ({ page }) => {
      await seedPreferences(page, { lang });
      const { session } = await registerSession(page);
      await openSession(page, session);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectSingleLineHeader(page, `${lang} ${width} signed in`);
        await page.goto('/app');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectSingleLineHeader(page, `${lang} ${width} cabinet`);
      }
    });
  }

  test('secondary sections sit under More until there is room', async ({ page }) => {
    await seedPreferences(page, { lang: 'ru' });
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    const nav = page.getByRole('banner').getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Вопросы' })).toBeHidden();
    const more = nav.getByRole('button', { name: 'Ещё' });
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toBeFocused();
    await more.click();
    await nav.getByRole('link', { name: 'Вопросы' }).click();
    await expect(page).toHaveURL(/#faq$/);
    await expect(more).toHaveAttribute('aria-expanded', 'false');

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(more).toBeHidden();
    await expect(nav.getByRole('link', { name: 'Вопросы' })).toBeVisible();
  });
});

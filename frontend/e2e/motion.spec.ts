import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseSetting, seedPreferences, waitForPremium } from './helpers';

// Motion rules (DESIGN.md): transform and opacity only, 150–400ms, page
// transitions through the View Transitions API, nothing under reduced motion.

// Counts document.startViewTransition calls and the kind of each.
async function spyOnViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __vt: string[] }).__vt = calls;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: () => Promise<void> | void) => {
      const transition = original(update);
      calls.push(document.documentElement.dataset.vt ?? '');
      return transition;
    }) as typeof document.startViewTransition;
  });
}

const vtCalls = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __vt: string[] }).__vt]);

// Every CSS animation running now: its duration and the properties it moves.
async function runningAnimations(page: Page) {
  return page.evaluate(() =>
    document.getAnimations().map((animation) => {
      const timing = animation.effect?.getComputedTiming();
      const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      const properties = new Set<string>();
      for (const frame of keyframes) {
        for (const key of Object.keys(frame)) {
          if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key))
            properties.add(key);
        }
      }
      return {
        name: (animation as CSSAnimation).animationName || animation.constructor.name,
        duration: Number(timing?.duration ?? 0),
        infinite: timing?.iterations === Infinity,
        properties: [...properties],
        css: animation instanceof CSSAnimation,
      };
    }),
  );
}

test.describe('Motion', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('a new page runs a view transition; a hash or filter change does not', async ({ page }) => {
    await spyOnViewTransitions(page);
    await page.goto('/');
    await waitForPremium(page);
    await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await vtCalls(page)).toEqual(['page']);

    await page.getByRole('banner').getByRole('link', { name: 'Coverage' }).click();
    await expect(page).toHaveURL(/#coverage$/);
    // /login → / is a new pathname; the hash itself adds nothing more.
    expect(await vtCalls(page)).toEqual(['page', 'page']);
  });

  test('a theme change crossfades', async ({ page }) => {
    await spyOnViewTransitions(page);
    await page.goto('/');
    await chooseSetting(page, 'Light');
    expect(await vtCalls(page)).toContain('theme');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('animations move only transform and opacity, within 150–400ms', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@polisgo.test');
    await page.getByLabel('Password', { exact: true }).fill('Wrong-password-1');
    // Catch the error's animation and the page's while they run.
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    const seen = await runningAnimations(page);
    await page.getByRole('contentinfo').getByRole('button', { name: 'Settings' }).click();
    seen.push(...(await runningAnimations(page)));
    expect(seen.length).toBeGreaterThan(0);
    for (const animation of seen.filter((a) => a.css)) {
      expect(animation.properties, animation.name).toEqual(
        expect.arrayContaining(
          animation.properties.filter((p) => ['transform', 'opacity'].includes(p)),
        ),
      );
      for (const property of animation.properties) {
        expect(['transform', 'opacity'], `${animation.name} animates ${property}`).toContain(
          property,
        );
      }
      if (!animation.infinite) {
        expect(animation.duration, animation.name).toBeGreaterThanOrEqual(150);
        expect(animation.duration, animation.name).toBeLessThanOrEqual(400);
      }
    }
  });

  test('the focus ring draws in on keyboard focus', async ({ page }) => {
    await page.goto('/login');
    const submit = page.getByRole('button', { name: 'Sign in' });
    await submit.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await expect
      .poll(() => submit.evaluate((el) => getComputedStyle(el, '::after').opacity))
      .toBe('1');
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('no view transitions and no running animations', async ({ page }) => {
      await spyOnViewTransitions(page);
      await page.goto('/');
      await waitForPremium(page);
      await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(await vtCalls(page)).toEqual([]);
      const running = (await runningAnimations(page)).filter((a) => a.duration > 1);
      expect(running).toEqual([]);
    });
  });

  test('the Reduce motion setting turns motion off without the OS setting', async ({ page }) => {
    await spyOnViewTransitions(page);
    await page.goto('/');
    await waitForPremium(page);
    await page.getByRole('contentinfo').getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('checkbox', { name: 'Reduce motion' }).check();
    await page.keyboard.press('Escape');
    await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await vtCalls(page)).toEqual([]);
    const duration = await page
      .getByRole('banner')
      .getByRole('link', { name: 'Open an account' })
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(duration).toBeLessThan(0.001);
  });
});

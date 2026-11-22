import { expect, test } from '@playwright/test';
import {
  cabinetApi,
  displayDate,
  expectNoHorizontalScroll,
  isoToday,
  openSession,
  registerSession,
  seedPreferences,
} from './helpers';

// DateField in the real app: typed as DD.MM.YYYY in every language, pasted
// dates, invalid dates, its own localized calendar, and min/max explained.
// The mobile project reruns this at 390px.

test.describe('DateField', () => {
  test('types, pastes and rejects dates on the register form', async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
    await page.goto('/register');
    const birth = page.getByRole('textbox', { name: 'Date of birth' });

    await birth.pressSequentially('14031992');
    await expect(birth).toHaveValue('14.03.1992');

    // A pasted ISO date is read as a date, not as eight digits.
    await birth.fill('');
    await birth.focus();
    await page.keyboard.insertText('1992-03-14');
    await expect(birth).toHaveValue('14.03.1992');

    // An impossible date is shown, and explained once the field is left.
    await birth.fill('');
    await birth.pressSequentially('31021992');
    await birth.blur();
    await expect(birth).toHaveAttribute('aria-invalid', 'true');
    await expect(birth).toHaveAccessibleDescription('Enter a valid date.');
    await expectNoHorizontalScroll(page);
  });

  test('the calendar follows the page language and works from the keyboard', async ({ page }) => {
    await seedPreferences(page, { lang: 'az' });
    await page.goto('/register');
    const birth = page.getByRole('textbox', { name: 'Doğum tarixi' });
    await birth.fill('1992-03-14');

    await page.getByRole('button', { name: 'Təqvimi aç' }).first().click();
    const calendar = page.getByRole('dialog', { name: 'Tarix seçin' });
    await expect(calendar).toBeVisible();
    // Azerbaijani month names, whatever the browser's own language is.
    await expect(calendar.getByRole('combobox', { name: 'Ay' })).toHaveValue('3');
    await expect(
      calendar.getByRole('combobox', { name: 'Ay' }).locator('option:checked'),
    ).toHaveText('Mart');
    await expect(calendar.getByRole('button', { name: '14 mart 1992, şənbə' })).toBeFocused();

    // Right a day, down a week, then Enter.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(calendar.getByRole('button', { name: '22 mart 1992, bazar' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(calendar).toBeHidden();
    await expect(birth).toHaveValue('22.03.1992');
    await expect(page.getByRole('button', { name: 'Təqvimi aç' }).first()).toBeFocused();
    await expectNoHorizontalScroll(page);
  });

  test('the incident date says which days the cover allows, and refuses others', async ({
    page,
  }) => {
    const { session } = await registerSession(page);
    // Cover from today: the only allowed incident day is today.
    const { vehicle } = await cabinetApi(page, session).activePolicy(12, 'MTPL', 0);
    await seedPreferences(page, { lang: 'en' });
    await openSession(page, session);
    await page.goto('/app/claims/new');
    await page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    const date = page.getByRole('textbox', { name: 'Date of the incident' });
    await expect(date).toHaveAccessibleDescription(
      `Must be within the cover period: from ${displayDate(isoToday())} to today.`.replace(
        /from (\d{2})\.(\d{2})\.(\d{4})/,
        (_, d: string, m: string, y: string) => `from ${formatEnglish(`${y}-${m}-${d}`)}`,
      ),
    );

    // Yesterday is in the calendar, crossed out and refused.
    await page.getByRole('button', { name: 'Open calendar' }).click();
    const calendar = page.getByRole('dialog', { name: 'Choose a date' });
    const yesterday = calendar.locator(`[data-day="${isoToday(-1)}"]`);
    await expect(yesterday).toHaveAttribute('aria-disabled', 'true');
    // Playwright won't click an aria-disabled element; a user still can.
    await yesterday.dispatchEvent('click');
    await expect(calendar).toBeVisible();
    await page.keyboard.press('Escape');

    // Typed anyway: the form explains it on Continue.
    await date.fill(displayDate(isoToday(-1)));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(date).toBeFocused();
    await expect(date).toHaveAccessibleDescription(
      "The incident date must be within the policy's period of cover.",
    );
  });
});

// The wizard's hint uses the app's own date format (useFormatters().date).
function formatEnglish(iso: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;
}

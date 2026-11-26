import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { project, signIn } from './session';

const expected = process.env.DESK_VISUAL_STATE === 'vorher'
  ? 'Dieser Wert oder diese Zuordnung ist bereits vorhanden.'
  : 'Diese Kostenstelle ist bereits einem Projekt zugeordnet.';

for (const theme of ['light', 'dark'] as const) {
  for (const [device, viewport] of Object.entries({
    desktop: { width: 1440, height: 950 },
    smartphone: { width: 390, height: 844 },
  })) {
    test(`${device} ${theme}: belegte Kostenstelle`, async ({ page }) => {
      await mkdir('build/cost-center-visuals', { recursive: true });
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(new Date('2028-05-17T10:00:00+02:00'));
      await page.addInitScript((selected) => localStorage.setItem('desk-theme', selected), theme);
      await signIn(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (device === 'smartphone') await page.getByRole('button', { name: 'Menü', exact: true }).click();
      await project(page, 'Büroinstallation Westflügel');
      const costCenter = page.getByLabel('Kostenstelle', { exact: true });
      const notes = page.getByLabel('Projektnotiz');
      await costCenter.fill('K-102');
      await notes.fill('Abstimmung mit dem Kontor steht aus.');
      await page.getByRole('button', { name: 'Projektdaten speichern', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText(expected);
      await expect(costCenter).toHaveValue('K-102');
      await expect(notes).toHaveValue('Abstimmung mit dem Kontor steht aus.');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: `build/cost-center-visuals/${device}-${theme}.png`,
        animations: 'disabled',
        fullPage: true,
      });
    });
  }
}

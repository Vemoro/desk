import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { signIn } from './session';

for (const theme of ['light', 'dark'] as const) {
  for (const [device, viewport] of Object.entries({
    desktop: { width: 1440, height: 950 },
    smartphone: { width: 390, height: 844 },
  })) {
    test(`${device} ${theme}: Formular wartet auf Antwort`, async ({ page }) => {
      await mkdir('build/form-submit-visuals', { recursive: true });
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(new Date('2028-05-17T10:00:00+02:00'));
      await page.addInitScript((selected) => localStorage.setItem('desk-theme', selected), theme);
      await signIn(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (device === 'smartphone') await page.getByRole('button', { name: 'Menü', exact: true }).click();
      await page.getByRole('navigation', { name: 'Hauptnavigation' })
        .getByRole('button', { name: 'Projektlager', exact: true }).click();
      await page.getByText('Lagerort anlegen', { exact: true }).click();
      const field = page.getByLabel('Lagerort', { exact: true }).first();
      await field.fill('Musterlager West');
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route('**/api/v1/locations', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await held;
        return route.fulfill({ status: 409, json: { error: 'Simulierter Konflikt.' } });
      });
      try {
        await page.getByRole('button', { name: 'Lagerort speichern', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Wird gespeichert …', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Wird gespeichert …', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `build/form-submit-visuals/${device}-${theme}.png`, animations: 'disabled' });
      } finally {
        release();
      }
      await expect(page.getByRole('alert')).toHaveText('Simulierter Konflikt.');
    });
  }
}

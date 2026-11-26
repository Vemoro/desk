import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const [workspace, address, version] = process.argv.slice(2);
const { chromium } = createRequire(join(workspace, 'package.json'))('playwright');
const screenshots = join(workspace, 'build', 'oidc-visuals');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [device, width, height] of [['desktop', 1440, 960], ['smartphone', 390, 844]]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, locale: 'de-DE' });
      const page = await context.newPage();
      await page.addInitScript(value => localStorage.setItem('desk-theme', value), theme);
      if (version === 'nachher') {
        // This render supplies only public feature availability. Real HTTPS
        // sign-in is exercised separately in the isolated Pocket ID pilot.
        await page.route('**/api/auth/oidc', route => route.fulfill({ json: { enabled: true } }));
      }
      await page.goto(address);
      await page.getByRole('heading', { name: 'Anmelden', exact: true }).waitFor();
      await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
      const oidc = page.getByRole('button', { name: 'Mit Organisationskonto anmelden', exact: true });
      await oidc.waitFor({ state: version === 'nachher' ? 'visible' : 'hidden' });
      await page.screenshot({ path: join(screenshots, device + '-' + theme + '.png'), animations: 'disabled' });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

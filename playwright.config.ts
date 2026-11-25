import { defineConfig,devices } from '@playwright/test';

const baseURL=process.env.DESK_E2E_URL ?? 'http://localhost:4173';
export default defineConfig({
  testDir:'./e2e',
  use:{baseURL,locale:'de-DE',timezoneId:'Europe/Berlin',trace:'retain-on-failure'},
  workers:1,
  webServer: process.env.DESK_E2E_URL ? undefined : {
    command:'bun run dev --port 4173 --strictPort',url:baseURL,
    env:{DESK_ORIGIN:baseURL},reuseExistingServer:!process.env.CI,
  },
  projects:[
    {name:'core',testMatch:['core.spec.ts','movement-retry.spec.ts','reservation-retry.spec.ts','warehouse-checkouts.spec.ts','movement-location.spec.ts','booking-labels.spec.ts','warehouse-location-acceptance.spec.ts','stock-search.spec.ts','available-stock-filter.spec.ts','navigation.spec.ts','refresh-after-save.spec.ts','load-order.spec.ts','passkeys.spec.ts','account-password.spec.ts','project-history.spec.ts','weekly-planning.spec.ts','zammad-connection-check.spec.ts','zammad-unlink.spec.ts','confirmation-dialogs.spec.ts','contact-duplicates.spec.ts','contact-projects.spec.ts'],use:{...devices['Desktop Chrome']}},
    {name:'screenshots',testMatch:'screenshots.spec.ts',use:{...devices['Desktop Chrome']}},
    {name:'runtime-image',testMatch:'runtime-image.spec.ts',outputDir:'test-results/runtime-image',use:{...devices['Desktop Chrome'],trace:'off'}},
  ],
});

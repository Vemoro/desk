import { defineConfig,devices } from '@playwright/test';

const baseURL=process.env.DESK_E2E_URL ?? 'http://127.0.0.1:4173';
export default defineConfig({
  testDir:'./e2e',
  use:{baseURL,locale:'de-DE',timezoneId:'Europe/Berlin',trace:'retain-on-failure'},
  workers:1,
  webServer: process.env.DESK_E2E_URL ? undefined : {
    command:'bun run dev --port 4173 --strictPort',url:baseURL,
    env:{DESK_ORIGIN:baseURL},reuseExistingServer:!process.env.CI,
  },
  projects:[
    {name:'core',testMatch:['core.spec.ts','movement-search.spec.ts','movement-date-filter.spec.ts','movement-project-links.spec.ts','warehouse-checkouts.spec.ts','movement-location.spec.ts','warehouse-movement-filters.spec.ts','receipt-reference.spec.ts'],use:{...devices['Desktop Chrome']}},
    {name:'screenshots',testMatch:'screenshots.spec.ts',use:{...devices['Desktop Chrome']}},
  ],
});

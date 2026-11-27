import { defineConfig,devices } from '@playwright/test';

const baseURL=process.env.DESK_E2E_URL ?? 'http://localhost:4173';
const screenshotSpec='**/screenshots.spec.ts';
const runtimeImageSpec='**/runtime-image.spec.ts';

export default defineConfig({
  testDir:'./e2e',
  use:{baseURL,locale:'de-DE',timezoneId:'Europe/Berlin',trace:'retain-on-failure'},
  workers:1,
  webServer: process.env.DESK_E2E_URL ? undefined : {
    command:'bun run dev --port 4173 --strictPort',url:baseURL,
    env:{DESK_ORIGIN:baseURL},reuseExistingServer:!process.env.CI,
  },
  projects:[
    {
      name:'core',
      testMatch:'**/*.spec.ts',
      testIgnore:[screenshotSpec,runtimeImageSpec],
      use:{...devices['Desktop Chrome']},
    },
    {name:'screenshots',testMatch:screenshotSpec,use:{...devices['Desktop Chrome']}},
    {name:'runtime-image',testMatch:runtimeImageSpec,outputDir:'test-results/runtime-image',use:{...devices['Desktop Chrome'],trace:'off'}},
  ],
});

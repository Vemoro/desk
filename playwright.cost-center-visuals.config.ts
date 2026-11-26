import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  projects: [{ name: 'cost-center-visuals', testMatch: 'cost-center-visuals.spec.ts', use: { ...devices['Desktop Chrome'] } }],
});

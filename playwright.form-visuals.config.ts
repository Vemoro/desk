import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  projects: [{ name: 'form-submit-visuals', testMatch: 'form-submit-visuals.spec.ts', use: { ...devices['Desktop Chrome'] } }],
});

import { test } from '@playwright/test';
import globalSetup from './global-setup';

/**
 * The same sign-in and seed as global-setup.ts, as a test: the root playwright.config.ts runs it as the
 * setup project that the exports project depends on (a project cannot have its own globalSetup).
 */
test('sign in and seed the application with a kit', async () => {
  await globalSetup();
});

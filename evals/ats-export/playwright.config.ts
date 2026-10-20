import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Web download E2E. Expects `next dev` on 8793 with the local D1 migrated and the
 * Browser Run binding remote (see e2e/README in the write-up). Trace and video
 * are on, and the HTML report is the artifact.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: process.env.E2E_REPORT_DIR ?? join(__dirname, '..', '..', 'verify', 'e2e-report'), open: 'never' }]],
  outputDir: process.env.E2E_OUTPUT_DIR ?? join(__dirname, '..', '..', 'verify', 'e2e-output'),
  use: {
    baseURL: 'http://localhost:8793',
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    storageState: join(tmpdir(), 'ua-e2e-storage.json'),
  },
});

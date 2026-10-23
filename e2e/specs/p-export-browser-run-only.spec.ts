import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';

/**
 * Downloads render only through Browser Run (src/lib/utils/server-export.ts); the in-browser export is gone.
 *
 * Browser Run's quickAction does not run in local dev (see wrangler.jsonc), so every PDF render on this preview
 * really fails: /api/exports answers 503 RENDER_UNAVAILABLE. That is the forced failure, unmocked. DOCX renders
 * without Browser Run, so it really succeeds. Where a spec needs a PDF render to succeed (the retry), the browser's
 * request to /api/exports is answered with a served file, the way the deployed renderer answers it.
 */

const RETRY_ERROR = "The PDF didn't build. Try again in a moment.";
const FAKE_PDF = Buffer.from('%PDF-1.4\n% served by the spec in place of Browser Run\n%%EOF\n');

/** Answer the next /api/exports calls as the deployed renderer would: a signed link, then the file. */
async function serveExports(page: Page, body: Buffer, fileName: string): Promise<void> {
  await page.route('**/api/exports', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ file: { url: '/__spec-served/file', fileName } }),
  }));
  await page.route('**/__spec-served/file', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body }));
}

async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error('download has no file');
  return readFile(path);
}

test('(p1) a CV PDF that fails to render says so, downloads nothing, and Try again delivers the server file', async ({ browser, request }, testInfo) => {
  const { context, page } = await signedInPage(browser, request, 'export1');
  await generateKitThroughUi(page);
  await page.getByRole('tab', { name: 'CV', exact: true }).click();

  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));
  const exportResponse = page.waitForResponse((response) => response.url().endsWith('/api/exports'));
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const failed = await exportResponse;
  expect(failed.status(), 'Browser Run cannot render locally, so the real export fails').toBe(503);
  expect((await failed.json()).code).toBe('RENDER_UNAVAILABLE');

  const toast = page.getByRole('alert').filter({ hasText: RETRY_ERROR });
  await expect(toast).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cv-pdf-failure-toast.png') });
  expect(downloads, 'no browser-made PDF stands in for the server file').toHaveLength(0);

  await serveExports(page, FAKE_PDF, 'Tomas_Brandt_Northwind_Foods_CV.pdf');
  const downloaded = page.waitForEvent('download');
  await toast.getByRole('button', { name: 'Try again' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Tomas_Brandt_Northwind_Foods_CV.pdf');
  expect((await bytesOf(download)).equals(FAKE_PDF), 'the file is the one the server sent').toBe(true);
  await expect(page.getByText('PDF downloaded.')).toBeVisible();
  await context.close();
});

test('(p2) the cover letter: PDF fails with a retry, DOCX renders on the server without Browser Run', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'export2');
  await generateKitThroughUi(page);
  await page.getByRole('tab', { name: 'Cover letter', exact: true }).click();

  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('menuitem', { name: 'PDF' }).click();
  const toast = page.getByRole('alert').filter({ hasText: RETRY_ERROR });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Try again' })).toBeVisible();

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('menuitem', { name: 'DOCX' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/Cover_Letter\.docx$/);
  // A DOCX is a zip.
  expect((await bytesOf(download)).subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByText('DOCX downloaded.')).toBeVisible();
  await context.close();
});

test('(p3) Download all delivers what rendered and names what did not', async ({ browser, request }, testInfo) => {
  const { context, page } = await signedInPage(browser, request, 'export3');
  await generateKitThroughUi(page);

  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.getByRole('button', { name: 'Download all' }).click();
  // The CV PDF and the letter PDF need Browser Run; the letter's DOCX is in the same step, so the letter counts as failed.
  // Both emails are plain text and always arrive.
  const toast = page.getByRole('alert').filter({ hasText: 'Downloaded 2 files.' });
  await expect(toast).toContainText("The CV and cover letter didn't build. Download them from their tabs.", { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath('download-all-partial-toast.png') });
  const names = downloads.map((download) => download.suggestedFilename());
  expect(names).toHaveLength(2);
  expect(names.some((name) => /Application_Email\.txt$/.test(name)), names.join(', ')).toBe(true);
  expect(names.some((name) => /Follow_Up_Email\.txt$/.test(name)), names.join(', ')).toBe(true);
  await context.close();
});

test('(p4) an empty file from the server is never handed over', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'export4');
  await generateKitThroughUi(page);
  await page.getByRole('tab', { name: 'CV', exact: true }).click();

  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await serveExports(page, Buffer.alloc(0), 'Tomas_Brandt_Northwind_Foods_CV.pdf');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await expect(page.getByRole('alert').filter({ hasText: RETRY_ERROR })).toBeVisible();
  expect(downloads).toHaveLength(0);
  await context.close();
});

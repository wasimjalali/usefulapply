import { readFile } from 'node:fs/promises';
import { expect, request as pwRequest, test, type Page } from '@playwright/test';
import { US_LETTER, US_ONE_PAGE } from '../fixtures';
import { checkCvDocx, checkLetterDocx } from '../lib/docx-checks';
import { checkCvPdf } from '../lib/cv-checks';
import { checkLetterPdf } from '../lib/letter-checks';
import { pdftotext } from '../lib/poppler';
import { squash } from '../lib/expect';
import { APPLICATION_ID, E2E_PERSONAL } from './seed';
import { ORIGIN, signedInContext } from './auth';

async function openApplication(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Senior Backend Engineer', { exact: false }).first().click();
  // Opening an application loads its chat and resets the tab once. Switch tabs after that settles.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(6000);
}

test.describe.configure({ mode: 'serial' });

test.describe('web downloads use the server renderer', () => {

  test('CV tab: Download PDF and Download Word', async ({ page }, info) => {
    await openApplication(page);
    // The CV holds a date of birth and a nationality and Premium ATS is a US template: the picker says what it leaves out.
    await page.getByRole('button', { name: 'Templates' }).click();
    await expect(page.getByText('US templates leave out your photo and personal details.')).toBeVisible();
    await page.screenshot({ path: info.outputPath('cv-tab-picker-note.png') });
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.screenshot({ path: info.outputPath('cv-tab.png') });

    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const pdf = await pdfDownload;
    expect(pdf.suggestedFilename()).toBe('Jordan_Ellis_CV.pdf');
    const pdfPath = info.outputPath('downloaded-cv.pdf');
    await pdf.saveAs(pdfPath);
    const report = await checkCvPdf(new Uint8Array(await readFile(pdfPath)), {
      fixture: 'us-one-page', templateId: 'premium-ats', source: { ...US_ONE_PAGE, personal: { ...US_ONE_PAGE.personal, ...E2E_PERSONAL } }, expectPhoto: false, expectedPages: 1,
    });
    expect(report.failures, 'the downloaded PDF passes every ATS check').toEqual([]);

    // Preview PDF: the server's PDF with its real page breaks, in a modal that traps focus, closes on Escape and gives focus back.
    const previewButton = page.getByRole('button', { name: 'Preview PDF' });
    await previewButton.click();
    const cvDialog = page.getByRole('dialog', { name: 'CV preview' });
    await expect(cvDialog).toBeVisible({ timeout: 60_000 });
    await expect(cvDialog.locator('iframe[title="CV preview"]')).toBeVisible();
    await expect(cvDialog.getByRole('button', { name: 'Close preview' })).toBeFocused();
    await page.screenshot({ path: info.outputPath('cv-preview.png') });
    await page.keyboard.press('Escape');
    await expect(cvDialog).toHaveCount(0);
    await expect(previewButton).toBeFocused();

    const wordDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Word' }).click();
    const word = await wordDownload;
    expect(word.suggestedFilename()).toBe('Jordan_Ellis_CV.docx');
    const docxPath = info.outputPath('downloaded-cv.docx');
    await word.saveAs(docxPath);
    const docx = await checkCvDocx(new Uint8Array(await readFile(docxPath)), { fixture: 'us-one-page', templateId: 'premium-ats', source: { ...US_ONE_PAGE, personal: { ...US_ONE_PAGE.personal, ...E2E_PERSONAL } }, expectPhoto: false });
    expect(docx.failures, 'the downloaded DOCX passes every check').toEqual([]);
  });

  test('Cover letter tab: preview layout, Download PDF and DOCX', async ({ page }, info) => {
    await openApplication(page);
    await page.getByText('Cover letter', { exact: true }).first().click();
    await page.screenshot({ path: info.outputPath('letter-tab.png') });

    const previewLayout = page.getByRole('button', { name: 'Preview layout' });
    await previewLayout.click();
    const dialog = page.getByRole('dialog', { name: 'Cover letter layout' });
    await expect(dialog.locator('iframe[title="Cover letter layout"]')).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('button', { name: 'Close preview' })).toBeFocused();
    await page.screenshot({ path: info.outputPath('letter-preview.png') });
    // Tab never reaches the app behind the dialog (it is inert), Escape closes the dialog, focus returns to the button that opened it.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      const inDialog = await page.evaluate(() => {
        const active = document.activeElement;
        return !active || active === document.body || Boolean(active.closest('[role="dialog"]'));
      });
      expect(inDialog, `Tab ${i + 1} stays in the dialog`).toBe(true);
    }
    await page.locator('[role="dialog"] button[aria-label="Close preview"]').focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(previewLayout).toBeFocused();

    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'PDF' }).click();
    const pdf = await pdfDownload;
    expect(pdf.suggestedFilename()).toBe('Jordan_Ellis_Cover_Letter.pdf');
    const pdfPath = info.outputPath('downloaded-letter.pdf');
    await pdf.saveAs(pdfPath);
    const report = await checkLetterPdf(new Uint8Array(await readFile(pdfPath)), 'web-letter', 'us', US_LETTER);
    expect(report.failures, 'the downloaded letter is laid out as a US business letter').toEqual([]);

    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const docxDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'DOCX' }).click();
    const docx = await docxDownload;
    expect(docx.suggestedFilename()).toBe('Jordan_Ellis_Cover_Letter.docx');
    const docxPath = info.outputPath('downloaded-letter.docx');
    await docx.saveAs(docxPath);
    const docxReport = await checkLetterDocx(
      new Uint8Array(await readFile(docxPath)),
      'web-letter.docx',
      [US_LETTER.sender.name, US_LETTER.subject, US_LETTER.salutation, US_LETTER.paragraphs[0], US_LETTER.signatureName],
      null,
    );
    expect(docxReport.failures).toEqual([]);
  });

  test('Cover letter tab: an edited letter exports the edited text, not the stale layout', async ({ page }, info) => {
    await openApplication(page);
    await page.getByText('Cover letter', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edited = 'P.S. This line was typed in the browser before the download.';
    const body = page.getByPlaceholder('Cover letter content...');
    await body.fill(`${await body.inputValue()}\n\n${edited}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'PDF' }).click();
    const pdf = await pdfDownload;
    const pdfPath = info.outputPath('downloaded-edited-letter.pdf');
    await pdf.saveAs(pdfPath);
    const text = await pdftotext(new Uint8Array(await readFile(pdfPath)), 'reading-order');
    expect(squash(text), 'the PDF carries the edit').toContain(squash(edited));
    expect(squash(text), 'and the original paragraphs').toContain(squash(US_LETTER.paragraphs[0]));

    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const docxDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'DOCX' }).click();
    const docx = await docxDownload;
    const docxPath = info.outputPath('downloaded-edited-letter.docx');
    await docx.saveAs(docxPath);
    const docxReport = await checkLetterDocx(new Uint8Array(await readFile(docxPath)), 'edited-letter.docx', [edited, US_LETTER.paragraphs[0]], null);
    expect(docxReport.failures, 'the DOCX carries the edit').toEqual([]);
  });

  test('when the server cannot render, nothing downloads and the error offers a retry', async ({ page }, info) => {
    // There is no in-browser export any more: a failed render is an error the user can retry, never a stand-in file.
    await page.route('**/api/exports', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable', code: 'RENDER_UNAVAILABLE' }) }));
    await openApplication(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const toast = page.getByRole('alert').filter({ hasText: "The PDF didn't build. Try again in a moment." });
    await expect(toast).toBeVisible();
    await page.screenshot({ path: info.outputPath('render-failure-toast.png') });
    expect(downloads).toEqual([]);

    // Try again reaches the real renderer once it answers.
    await page.unroute('**/api/exports');
    const download = page.waitForEvent('download');
    await toast.getByRole('button', { name: 'Try again' }).click();
    expect((await download).suggestedFilename()).toBe('Jordan_Ellis_CV.pdf');
  });

  test('signed links: plain HTTP works, tampering and other users do not', async ({ page }) => {
    const create = await page.request.post('/api/exports', {
      data: { applicationId: APPLICATION_ID, format: 'cv_pdf', templateId: 'executive' },
      headers: { origin: ORIGIN },
    });
    expect(create.status()).toBe(200);
    const body = await create.json();
    const file = body.file as { url: string; cached: boolean; fileName: string; expiresAt: string };
    expect(file.fileName).toBe('Jordan_Ellis_CV.pdf');
    expect(new Date(file.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);

    // A second identical request is served from the cache.
    const again = await page.request.post('/api/exports', { data: { applicationId: APPLICATION_ID, format: 'cv_pdf', templateId: 'executive' }, headers: { origin: ORIGIN } });
    expect((await again.json()).file.cached).toBe(true);

    // No cookies at all: an agent's plain HTTP client.
    const anonymous = await pwRequest.newContext({ baseURL: ORIGIN, storageState: { cookies: [], origins: [] } });
    const served = await anonymous.get(file.url);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('application/pdf');
    expect(served.headers()['cache-control']).toBe('private, no-store');
    expect(served.headers()['referrer-policy']).toBe('no-referrer');
    expect(served.headers()['x-content-type-options']).toBe('nosniff');
    expect((await served.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const tampered = file.url.replace(/sig=(.)/, (_m, c) => `sig=${c === 'A' ? 'B' : 'A'}`);
    expect((await anonymous.get(tampered)).status()).toBe(404);
    expect((await anonymous.get(file.url.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) + 99999}`))).status()).toBe(404);
    expect((await anonymous.get(file.url.split('?')[0])).status()).toBe(404);

    // Another signed-in user cannot export this application.
    const other = await signedInContext('e2e-other@example.test', 'Other User');
    const foreign = await other.post('/api/exports', { data: { applicationId: APPLICATION_ID, format: 'cv_pdf' }, headers: { origin: ORIGIN } });
    expect(foreign.status()).toBe(404);
    // And unauthenticated requests are refused.
    expect((await anonymous.post('/api/exports', { data: { applicationId: APPLICATION_ID, format: 'cv_pdf' }, headers: { origin: ORIGIN } })).status()).toBe(401);
    await anonymous.dispose();
    await other.dispose();
  });
});

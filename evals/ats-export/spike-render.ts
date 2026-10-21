/**
 * Spike 0b: render the server-side HTML of two templates through Browser Run
 * and report what comes back. Run with the eval render worker up on 8793:
 *   npx tsx evals/ats-export/spike-render.ts
 */
import { join } from 'node:path';
import { renderCvHtml } from '../../src/lib/services/export/cv-html';
import { applyPdfMetadata, renderHtmlToPdf } from '../../src/lib/services/export/pdf';
import { getPrintSpec } from '../../src/lib/cv-templates/print-spec';
import { renderLetterHtml, letterPaper } from '../../src/lib/services/export/letter-html';
import { DE_TWO_PAGE, US_ONE_PAGE, US_LETTER, DIN_LETTER } from './fixtures';
import { loadFontFromDisk, workerBinding, writeOut, REPO_ROOT, type RenderTiming } from './lib/render';

async function main() {
  const out = process.env.SPIKE_OUT ?? join(REPO_ROOT, 'verify', 'feature-mcp-renderer-ats', 'spike');
  const timings: RenderTiming[] = [];
  const browser = workerBinding(timings);
  for (const [templateId, data] of [
    ['premium-ats', US_ONE_PAGE],
    ['german-ats', DE_TWO_PAGE],
  ] as const) {
    const { html } = await renderCvHtml({ data, templateId, loadFont: loadFontFromDisk });
    await writeOut(out, `${templateId}.html`, html);
    const raw = await renderHtmlToPdf(browser, html, getPrintSpec(templateId).paper);
    const pdf = await applyPdfMetadata(raw, {
      title: `${data.personal.fullName} - CV`,
      author: data.personal.fullName,
      subject: 'Curriculum vitae',
      language: templateId.startsWith('german') ? 'de-DE' : 'en-US',
    });
    await writeOut(out, `${templateId}.pdf`, pdf);
    console.log(templateId, 'html bytes', html.length, 'raw pdf bytes', raw.length, 'final', pdf.length, timings[timings.length - 1]);
  }
  for (const [name, letter, layout] of [
    ['letter-us', US_LETTER, 'us'],
    ['letter-din', DIN_LETTER, 'din'],
  ] as const) {
    const { html } = await renderLetterHtml({
      input: { kind: 'structured', letter },
      layout,
      loadFont: loadFontFromDisk,
      title: 'Cover letter',
      language: letter.language,
    });
    const raw = await renderHtmlToPdf(browser, html, letterPaper(layout));
    await writeOut(out, `${name}.pdf`, raw);
    console.log(name, raw.length, timings[timings.length - 1]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

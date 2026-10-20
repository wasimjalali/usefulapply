/**
 * The export renders the templates with src/lib/services/export/static-markup.ts
 * because react-dom/server cannot be imported in a Next route handler. This
 * compares its HTML with react-dom/server's for every template and fixture, in
 * print and screen mode, so the two cannot drift apart.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/markup-parity.ts
 */
import { createElement } from 'react';
import { renderToStaticMarkup as reference } from 'react-dom/server';
import { CvTemplateSwitch } from '../../src/components/cv-templates/render';
import { renderToStaticMarkup as mine } from '../../src/lib/services/export/static-markup';
import { renderLetterHtml } from '../../src/lib/services/export/letter-html';
import { CV_FIXTURES, DIN_LETTER, TEMPLATE_IDS, US_LETTER } from './fixtures';
import { loadFontFromDisk } from './lib/render';

/** React writes void elements with a closing slash and escapes apostrophes. Neither changes the page. */
function normalize(html: string): string {
  return html.replace(/\s*\/>/g, '>').replace(/&#x27;/g, "'");
}

async function main() {
  let compared = 0;
  const problems: string[] = [];
  for (const fixture of CV_FIXTURES) {
    for (const templateId of TEMPLATE_IDS) {
      for (const mode of ['print', 'screen'] as const) {
        const element = createElement(CvTemplateSwitch, { data: fixture.data, templateId, mode });
        const a = normalize(reference(element));
        const b = normalize(mine(element));
        compared++;
        if (a !== b) {
          let i = 0;
          while (i < a.length && a[i] === b[i]) i++;
          problems.push(`${fixture.name}/${templateId}/${mode}: first difference at ${i}: react-dom "${a.slice(i, i + 60)}" vs ours "${b.slice(i, i + 60)}"`);
        }
      }
    }
  }
  // Letters go through the same function; render once to prove it runs on the real components.
  for (const letter of [US_LETTER, DIN_LETTER]) {
    const out = await renderLetterHtml({ input: { kind: 'structured', letter }, layout: letter.market === 'dach' ? 'din' : 'us', loadFont: loadFontFromDisk, title: 't', language: letter.language });
    compared++;
    if (!out.html.includes(letter.signatureName)) problems.push('letter html is missing the signature');
  }
  console.log(`${compared} renders compared, ${problems.length} differ`);
  for (const problem of problems.slice(0, 10)) console.log(problem);
  process.exit(problems.length === 0 ? 0 : 1);
}

main();

import { renderToStaticMarkup } from 'react-dom/server';
import { fontFaceCssInline, type FontFileLoader } from '@/lib/cv-templates/fonts';
import { EXPORT_CSP, escapeHtml } from './cv-html';
import { PRINT_BASE_CSS } from './print-css';
import type { ExportAnswer } from './types';

/**
 * The screening answers document: the same content as the TXT and the old
 * browser PDF, as a real text PDF. Numbered question, then the answer.
 */

export function answersTitle(company: string, de: boolean): string {
  const base = de ? 'Screening-Antworten' : 'Screening answers';
  return company ? `${base}: ${company}` : base;
}

export function answersPlainText(answers: ExportAnswer[]): string {
  return answers.map((item, index) => `${index + 1}. ${item.question}\n${item.answer}`).join('\n\n');
}

export async function renderAnswersHtml(args: {
  answers: ExportAnswer[];
  company: string;
  de: boolean;
  paper: 'a4' | 'letter';
  loadFont: FontFileLoader;
}): Promise<{ html: string; text: string }> {
  const title = answersTitle(args.company, args.de);
  const markup = renderToStaticMarkup(
    <>
      <h1 className="title">{title}</h1>
      {args.answers.map((item, index) => (
        <div className="item" key={index}>
          <p className="q">{index + 1}. {item.question}</p>
          <p className="a">{item.answer}</p>
        </div>
      ))}
    </>,
  );
  const text = `${title}\n\n${answersPlainText(args.answers)}`;
  const fonts = await fontFaceCssInline(args.loadFont, text);
  const page = args.paper === 'a4' ? '@page{size:A4;margin:20mm 20mm 18mm 25mm}' : '@page{size:Letter;margin:1in}';
  const style = `${page}
body{font-family:'Arimo','Arial',sans-serif;font-size:11pt;line-height:1.4;color:#111}
.title{font-family:'Gelasio','Georgia',serif;font-weight:700;font-size:15pt;margin-bottom:1.2em}
.item{margin-bottom:1.1em;break-inside:avoid}
.q{font-weight:700;margin-bottom:0.2em}
.a{white-space:pre-line}`;
  const html = `<!doctype html><html lang="${args.de ? 'de' : 'en'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}"><title>${escapeHtml(title)}</title><style>${fonts}\n${PRINT_BASE_CSS}\n${style}</style></head><body>${markup}</body></html>`;
  return { html, text };
}

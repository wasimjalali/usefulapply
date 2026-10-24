import assert from 'node:assert/strict';
import test from 'node:test';

import { exportDisplayFileName, exportFileName } from './filenames';
import { exportCacheHash, type ResolvedExport } from './resolve';

// Ways this could fail, written before the code:
// - the company is dropped, or glued on the wrong side of the German prefix/suffix words
// - a company with & / " ' or an umlaut leaves unsafe characters or double underscores in the ASCII name
// - a CJK company becomes "_" or "Applicant" instead of being left out
// - a long company pushes the name out, or the file passes 80 characters, or the cut splits a code point
// - the cut ends on "_" or "-"
// - an empty or whitespace company changes today's name
// - emails and screening answers pick up the company
// - the display name loses the company's own letters, or keeps separators like "/"
// - the cache key ignores the company, so a renamed export is served under its old name

test('file name: English CV and letter carry name and company', () => {
  assert.equal(exportFileName('cv_pdf', 'Wasim Jalali', 'en', 'VEGA Grieshaber KG'), 'Wasim_Jalali_VEGA_Grieshaber_KG_CV.pdf');
  assert.equal(exportFileName('cover_letter_pdf', 'Wasim Jalali', 'en', 'VEGA Grieshaber KG'), 'Wasim_Jalali_VEGA_Grieshaber_KG_Cover_Letter.pdf');
  assert.equal(exportFileName('cv_docx', 'Wasim Jalali', 'en', 'VEGA Grieshaber KG'), 'Wasim_Jalali_VEGA_Grieshaber_KG_CV.docx');
  assert.equal(exportFileName('cover_letter_docx', 'Wasim Jalali', 'en', 'VEGA Grieshaber KG'), 'Wasim_Jalali_VEGA_Grieshaber_KG_Cover_Letter.docx');
});

test('file name: German words wrap the name and company', () => {
  assert.equal(exportFileName('cv_pdf', 'Wasim Jalali', 'de', 'VEGA Grieshaber KG'), 'Lebenslauf_Wasim_Jalali_VEGA_Grieshaber_KG.pdf');
  assert.equal(exportFileName('cover_letter_pdf', 'Wasim Jalali', 'de', 'VEGA Grieshaber KG'), 'Anschreiben_Wasim_Jalali_VEGA_Grieshaber_KG.pdf');
  assert.equal(exportFileName('cv_pdf', 'Jürgen Müller-Schäfer', 'de', 'Müller & Söhne GmbH'), 'Lebenslauf_Juergen_Mueller-Schaefer_Mueller_Soehne_GmbH.pdf');
  assert.equal(exportFileName('cv_pdf', 'Ana Silva', 'fr', 'Société Générale'), 'CV_Ana_Silva_Societe_Generale.pdf');
});

test('file name: unsafe characters in the company are dropped and separators collapse', () => {
  const got = exportFileName('cv_pdf', 'Jordan Ellis', 'en', ' AT&T / "Labs" (O\'Neil)  Inc. ');
  assert.equal(got, 'Jordan_Ellis_AT_T_Labs_O_Neil_Inc_CV.pdf');
  assert.ok(!/__|[^A-Za-z0-9_.-]/.test(got), got);
});

test('file name: a company with nothing transliterable leaves the name only', () => {
  assert.equal(exportFileName('cv_pdf', 'Jordan Ellis', 'en', '株式会社トヨタ'), 'Jordan_Ellis_CV.pdf');
  assert.equal(exportDisplayFileName('cv_pdf', 'Jordan Ellis', 'en', '株式会社トヨタ'), 'Jordan_Ellis_株式会社トヨタ_CV.pdf');
});

test('file name: no company is the name only, exactly as before', () => {
  for (const company of [undefined, '', '   ', ' / ']) {
    assert.equal(exportFileName('cv_pdf', 'Jordan Ellis', 'en', company), 'Jordan_Ellis_CV.pdf');
    assert.equal(exportFileName('cover_letter_pdf', 'Jürgen Müller', 'de', company), 'Anschreiben_Juergen_Mueller.pdf');
  }
});

test('file name: a long company is cut first, the name stays whole, 80 characters at most', () => {
  const company = 'Gesellschaft fuer Anlagen und Maschinenbau Beteiligungs Verwaltung '.repeat(3);
  for (const format of ['cv_pdf', 'cover_letter_docx'] as const) {
    const got = exportFileName(format, 'Wasim Jalali', 'en', company);
    assert.ok(got.length <= 80, `${got.length}: ${got}`);
    assert.ok(got.startsWith('Wasim_Jalali_Gesellschaft'), got);
    assert.ok(!got.includes('__') && !got.includes('-_'), got);
  }
  // A cut that lands on a separator does not leave one dangling before the suffix.
  const edge = exportFileName('cv_pdf', 'Wasim Jalali', 'en', 'Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa Bbbbbbbbbb');
  assert.ok(!edge.includes('__') && edge.length <= 80, edge);
});

test('file name: a very long name still fits and the company is left out when no room remains', () => {
  const got = exportFileName('cv_pdf', `${'Abcdefghij '.repeat(20)}Zed`, 'en', 'Acme');
  assert.ok(got.length <= 80, `${got.length}`);
  assert.ok(!got.includes('Acme'), got);
});

test('file name: the display name keeps the company letters, cuts by code point and has no separators', () => {
  assert.equal(exportDisplayFileName('cv_pdf', 'Jürgen Müller', 'de', 'Müller & Söhne / GmbH'), 'Lebenslauf_Jürgen_Müller_Müller_&_Söhne_GmbH.pdf');
  const wide = exportDisplayFileName('cover_letter_pdf', 'Wasim Jalali', 'en', '\u{1D518}'.repeat(120));
  assert.ok(Array.from(wide).length <= 80 && wide.isWellFormed(), wide);
  assert.ok(!wide.includes('__'), wide);
});

test('file name: emails and screening answers do not carry the company', () => {
  assert.equal(exportFileName('emails_txt', 'Jordan Ellis', 'en', 'Acme'), 'Jordan_Ellis_Emails.txt');
  assert.equal(exportFileName('answers_pdf', 'Jordan Ellis', 'en', 'Acme'), 'Jordan_Ellis_Screening_Answers.pdf');
});

test('cache key: changing only the company changes the hash', async () => {
  const base = {
    format: 'cv_pdf',
    templateId: 'classic',
    paper: 'a4',
    layout: null,
    locale: 'en',
    applicantName: 'Jordan Ellis',
    company: 'Acme',
    cv: null,
    letter: null,
    emails: [],
    answers: [],
    cacheInput: { same: true },
  } as unknown as ResolvedExport;
  const a = await exportCacheHash(base);
  assert.equal(a, await exportCacheHash({ ...base }));
  assert.notEqual(a, await exportCacheHash({ ...base, company: 'Globex' }));
});

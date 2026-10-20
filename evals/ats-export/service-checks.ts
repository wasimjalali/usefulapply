import { createHash } from 'node:crypto';
import { resolveExport, exportCacheHash } from '../../src/lib/services/export/resolve';
import { resolveLetterLayout } from '../../src/lib/services/export/layout';
import { encodeRfc5987, exportDisplayFileName, exportFileName, nameForFile } from '../../src/lib/services/export/filenames';
import { exportPathKey, signExportLink, verifyExportLink, SIGNED_URL_TTL_SECONDS } from '../../src/lib/services/export/signing';
import { sanitizeCvData, sanitizeStructuredLetter } from '../../src/lib/services/export/sanitize';
import { formatCvDate, formatDateRange, sectionHeading } from '../../src/lib/cv-templates/locale';
import { formatBirthDate } from '../../src/lib/cv-templates/birthdate';
import { displayUrl, fullUrl } from '../../src/lib/cv-templates/url';
import { hashRendererSources, type HashDeps } from '../../src/lib/services/export/renderer-source-hash';
import type { CVData } from '../../src/lib/cv-templates/types';
import { buildCvData } from '../../src/lib/cv-templates/build-cv-data';
import { visibleCvData } from '../../src/lib/cv-templates/hidden';
import { RENDERER_VERSION } from '../../src/lib/services/export/renderer-version';
import { CV_FIXTURES, DE_TWO_PAGE, DIN_LETTER, US_LETTER, US_ONE_PAGE, US_PERSONAL } from './fixtures';
import { kitFor } from './render-all';

export interface ServiceReport {
  name: string;
  ok: boolean;
  failures: string[];
}

function report(name: string, failures: string[]): ServiceReport {
  return { name, ok: failures.length === 0, failures };
}

export async function runServiceChecks(): Promise<ServiceReport[]> {
  const out: ServiceReport[] = [];
  const kit = kitFor({ cv: US_ONE_PAGE, originalCv: US_ONE_PAGE, applicantName: 'Jordan Ellis', coverLetter: { structured: US_LETTER, legacyText: null } });

  // Cache key: every input that changes the bytes changes the hash, nothing else does.
  {
    const failures: string[] = [];
    const base = await exportCacheHash(resolveExport(kit, 'cv_pdf', { templateId: 'premium-ats' }));
    const again = await exportCacheHash(resolveExport(kit, 'cv_pdf', { templateId: 'premium-ats' }));
    if (base !== again) failures.push('same input gives a different hash');
    const variants: Array<[string, Promise<string>]> = [
      ['template', exportCacheHash(resolveExport(kit, 'cv_pdf', { templateId: 'executive' }))],
      ['paper', exportCacheHash(resolveExport(kit, 'cv_pdf', { templateId: 'premium-ats', paper: 'a4' }))],
      ['format', exportCacheHash(resolveExport(kit, 'cv_docx', { templateId: 'premium-ats' }))],
      ['content', exportCacheHash(resolveExport(kitFor({ cv: { ...US_ONE_PAGE, summary: 'Different.' }, applicantName: 'Jordan Ellis' }), 'cv_pdf', { templateId: 'premium-ats' }))],
      ['hidden item', exportCacheHash(resolveExport(kitFor({ cv: { ...US_ONE_PAGE, experience: [{ ...US_ONE_PAGE.experience[0], hidden: true }, ...US_ONE_PAGE.experience.slice(1)] }, applicantName: 'Jordan Ellis' }), 'cv_pdf', { templateId: 'premium-ats' }))],
    ];
    for (const [label, hash] of variants) if ((await hash) === base) failures.push(`${label} does not change the hash`);
    // A photo only matters to a template that prints one.
    const withPhoto = kitFor({ cv: DE_TWO_PAGE, applicantName: 'J', photoDataUri: DE_TWO_PAGE.personal.photoUrl ?? null });
    const otherPhoto = kitFor({ cv: DE_TWO_PAGE, applicantName: 'J', photoDataUri: 'data:image/jpeg;base64,AAAA' });
    if ((await exportCacheHash(resolveExport(withPhoto, 'cv_pdf', { templateId: 'premium-ats' }))) !== (await exportCacheHash(resolveExport(otherPhoto, 'cv_pdf', { templateId: 'premium-ats' })))) {
      failures.push('a photo changes the hash of a template that prints none');
    }
    if ((await exportCacheHash(resolveExport(withPhoto, 'cv_pdf', { templateId: 'german-ats' }))) === (await exportCacheHash(resolveExport(otherPhoto, 'cv_pdf', { templateId: 'german-ats' })))) {
      failures.push('a new photo does not change the hash of a template that prints one');
    }
    const letterUs = await exportCacheHash(resolveExport(kit, 'cover_letter_pdf', { templateId: 'premium-ats', letterLocale: 'en' }));
    const letterDin = await exportCacheHash(resolveExport(kit, 'cover_letter_pdf', { templateId: 'premium-ats', letterLocale: 'de' }));
    if (letterUs === letterDin) failures.push('the letter layout is not in the hash');
    out.push(report('cache-key', failures));
  }

  // Signed links.
  {
    const failures: string[] = [];
    const secret = 'test-secret-not-a-real-one';
    const hash = 'a'.repeat(64);
    const pathKey = exportPathKey('user-1', hash, 'pdf');
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    const { path, expiresAt } = await signExportLink({ userId: 'user-1', pathKey, secret, now });
    const url = new URL(`https://example.test${path}`);
    const parts = { exp: url.searchParams.get('exp'), sig: url.searchParams.get('sig') };
    const verify = (overrides: Partial<{ pathKey: string; exp: string | null; sig: string | null; secret: string | undefined; now: number }>) =>
      verifyExportLink({ pathKey, ...parts, secret, now, ...overrides });
    if (!(await verify({})).ok) failures.push('a fresh link does not verify');
    if (new Date(expiresAt).getTime() - now !== SIGNED_URL_TTL_SECONDS * 1000) failures.push('link does not live 15 minutes');
    if ((await verify({ now: now + (SIGNED_URL_TTL_SECONDS + 1) * 1000 })).ok) failures.push('an expired link verifies');
    if (!(await verify({ now: now + (SIGNED_URL_TTL_SECONDS - 1) * 1000 })).ok) failures.push('a link just inside its lifetime fails');
    if ((await verify({ pathKey: exportPathKey('user-2', hash, 'pdf') })).ok) failures.push('a link verifies for another user');
    if ((await verify({ pathKey: exportPathKey('user-1', 'b'.repeat(64), 'pdf') })).ok) failures.push('a link verifies for another file');
    if ((await verify({ exp: String(Number(parts.exp) + 3600) })).ok) failures.push('a tampered expiry verifies');
    if ((await verify({ sig: (parts.sig ?? '').slice(0, -2) + 'AA' })).ok) failures.push('a tampered signature verifies');
    if ((await verify({ secret: 'another-secret' })).ok) failures.push('a link verifies under another secret');
    if ((await verify({ secret: undefined })).ok) failures.push('a link verifies with no secret');
    if ((await verify({ sig: null })).ok) failures.push('a link with no signature verifies');
    let threw = false;
    try {
      await signExportLink({ userId: 'user-1', pathKey, secret: undefined, now });
    } catch {
      threw = true;
    }
    if (!threw) failures.push('signing without a secret does not fail');
    out.push(report('signed-links', failures));
  }

  // Sanitizing what the browser sends.
  {
    const failures: string[] = [];
    const hostile = sanitizeCvData({
      personal: { fullName: 'A'.repeat(5000), email: 'a@b.c', phone: '1', linkedIn: 'javascript:alert(1)', website: 'https://ok.example/x', photoUrl: 'https://evil.example/p.jpg' },
      experience: [{ id: 'x', company: 'C', position: 'P', startDate: '2020', bullets: ['b'], hidden: 'yes' }],
      education: [], skills: [{ category: 'c', items: ['a'], hiddenItems: ['a'] }], languages: [], certifications: [],
      hiddenSections: ['skills', 'constructor', '__proto__'],
      unknownField: 'dropped',
    });
    if (!hostile) failures.push('a valid CV is rejected');
    else {
      if (hostile.personal.fullName.length > 400) failures.push('long strings are not capped');
      if (hostile.personal.linkedIn) failures.push('a javascript: link is kept');
      if (hostile.personal.website !== 'https://ok.example/x') failures.push('an https link is dropped');
      if (hostile.personal.photoUrl) failures.push('a photo URL from the client is kept');
      if (hostile.experience[0].hidden) failures.push('a non-boolean hidden flag is treated as true');
      if ((hostile.hiddenSections ?? []).join() !== 'skills') failures.push('unknown hidden sections are kept');
      if ('unknownField' in hostile) failures.push('unknown fields are kept');
    }
    if (sanitizeCvData('not a cv') !== null || sanitizeCvData({ personal: {} }) !== null) failures.push('a non-CV is accepted');
    if (sanitizeStructuredLetter({ version: 2, subject: 1 }) !== null) failures.push('a malformed letter is accepted');
    if (!sanitizeStructuredLetter(DIN_LETTER)) failures.push('a valid structured letter is rejected');
    out.push(report('sanitize-client-input', failures));
  }

  // Letter layout choice.
  {
    const failures: string[] = [];
    const cases: Array<[string, Parameters<typeof resolveLetterLayout>[0], 'us' | 'din']> = [
      ['explicit de', { letterLocale: 'de', templateId: 'premium-ats' }, 'din'],
      ['explicit en on a German template', { letterLocale: 'en', templateId: 'german-ats' }, 'us'],
      ['structured dach', { structured: { market: 'dach' }, templateId: 'premium-ats' }, 'din'],
      ['structured us on a German template', { structured: { market: 'us' }, templateId: 'german-ats' }, 'us'],
      ['legacy German body on a US template', { legacyText: 'Sehr geehrte Frau Böhm,\n\nmit großem Interesse habe ich Ihre Ausschreibung gelesen.\n\nMit freundlichen Grüßen\nJürgen Müller', templateId: 'premium-ats' }, 'din'],
      ['legacy German body without a salutation phrase', { legacyText: 'Ich bin seit zehn Jahren in der Softwareentwicklung tätig und habe in dieser Zeit mehrere Teams geleitet, die für den Betrieb der Plattform verantwortlich waren.', templateId: 'premium-ats' }, 'din'],
      ['legacy English body on a German template', { legacyText: 'Dear Hiring Team, I am applying for the Senior Backend Engineer role. I have led a team of five engineers through a migration that cut latency by thirty percent.', templateId: 'german-classic' }, 'din'],
      ['legacy English body on a US template', { legacyText: 'Dear Hiring Team, I am applying for the Senior Backend Engineer role. I have led a team of five engineers through a migration that cut latency by thirty percent.', templateId: 'premium-ats' }, 'us'],
      ['no body, German template', { templateId: 'german-ats' }, 'din'],
    ];
    for (const [label, args, want] of cases) {
      const got = resolveLetterLayout(args);
      if (got !== want) failures.push(`${label}: got ${got}, want ${want}`);
    }
    out.push(report('letter-layout-choice', failures));
  }

  // File names, headings, dates.
  {
    const failures: string[] = [];
    const names: Array<[string, string]> = [
      [exportFileName('cv_pdf', 'Jordan Ellis', 'en'), 'Jordan_Ellis_CV.pdf'],
      [exportFileName('cv_pdf', 'Jürgen Müller-Schäfer', 'de'), 'Lebenslauf_Juergen_Mueller-Schaefer.pdf'],
      [exportFileName('cover_letter_pdf', 'Jordan Ellis', 'en'), 'Jordan_Ellis_Cover_Letter.pdf'],
      [exportFileName('cover_letter_pdf', 'Jürgen Müller-Schäfer', 'de'), 'Anschreiben_Juergen_Mueller-Schaefer.pdf'],
      [nameForFile('  José  Núñez '), 'Jose_Nunez'],
      [nameForFile('../../etc/passwd'), 'etc_passwd'],
    ];
    for (const [got, want] of names) if (got !== want) failures.push(`file name "${got}", want "${want}"`);
    const dates: Array<[string, string, string]> = [
      [formatCvDate('Mar 2022', 'en'), 'Mar 2022', 'en short month'],
      [formatCvDate('March 2022', 'en'), 'Mar 2022', 'en long month'],
      [formatCvDate('03/2022', 'en'), 'Mar 2022', 'en from numeric'],
      [formatCvDate('März 2022', 'de'), '03/2022', 'de from word'],
      [formatCvDate('2022-03', 'de'), '03/2022', 'de from ISO'],
      [formatCvDate('2019', 'de'), '2019', 'year only'],
      [formatCvDate('2019 – 2021', 'en'), '2019 - 2021', 'en dash in free text'],
    ];
    for (const [got, want, label] of dates) if (got !== want) failures.push(`${label}: "${got}", want "${want}"`);
    const range = formatDateRange(US_ONE_PAGE, { startDate: 'Mar 2022', current: true });
    if (range !== 'Mar 2022 - Present') failures.push(`range "${range}"`);
    const deRange = formatDateRange(DE_TWO_PAGE, { startDate: '04/2019', current: true });
    if (deRange !== '04/2019 - heute') failures.push(`range "${deRange}"`);
    if (sectionHeading({ ...US_ONE_PAGE, sectionHeaders: { skills: 'CORE COMPETENCIES', experience: 'PROFESSIONAL EXPERIENCE' } }, 'skills') !== 'Skills') failures.push('CORE COMPETENCIES is not normalized to Skills');
    if (sectionHeading({ ...US_ONE_PAGE, sectionHeaders: { skills: 'Tools I trust' } }, 'skills') !== 'Tools I trust') failures.push('a custom heading is overwritten');
    if (sectionHeading({ ...DE_TWO_PAGE, sectionHeaders: { experience: 'Werdegang' } }, 'experience') !== 'Berufserfahrung') failures.push('Werdegang is not normalized to Berufserfahrung');
    out.push(report('names-dates-headings', failures));
  }

  // Cache key covers what the file name and the document show; the renderer version is derived, not typed.
  {
    const failures: string[] = [];
    const letterKit = (over: Partial<Parameters<typeof kitFor>[0]>) => kitFor({ applicantName: 'Jordan Ellis', coverLetter: { structured: US_LETTER, legacyText: null }, ...over });
    const base = await exportCacheHash(resolveExport(letterKit({}), 'cover_letter_pdf', { templateId: 'premium-ats' }));
    const otherName = await exportCacheHash(resolveExport(letterKit({ applicantName: 'Jordan Ellis Jr.' }), 'cover_letter_pdf', { templateId: 'premium-ats' }));
    const otherCompany = await exportCacheHash(resolveExport(letterKit({ company: 'Other Corp' }), 'cover_letter_pdf', { templateId: 'premium-ats' }));
    if (base === otherName) failures.push('the applicant name is not in the cache key');
    if (base === otherCompany) failures.push('the company is not in the cache key');
    if (!/^\d+\.[0-9a-z]{6,}$/.test(RENDERER_VERSION)) failures.push(`renderer version "${RENDERER_VERSION}" is not derived from a hash`);
    const override = resolveExport(kitFor({ cv: US_ONE_PAGE, applicantName: 'Jordan Ellis' }), 'cv_pdf', {
      templateId: 'premium-ats',
      overrides: { cv: { ...US_ONE_PAGE, personal: { ...US_ONE_PAGE.personal, fullName: 'Alex Doe' } } },
    });
    if (override.applicantName !== 'Alex Doe') failures.push(`the file name uses "${override.applicantName}", not the override CV's name`);
    out.push(report('cache-key-names-and-version', failures));
  }

  // Hidden state and chat renames: a hidden custom section is never folded into a visible one, and a rename is shown as chosen.
  {
    const failures: string[] = [];
    const renamed = sectionHeading({ ...US_ONE_PAGE, sectionHeaders: { skills: 'CORE COMPETENCIES' }, renamedHeadings: ['skills'] }, 'skills');
    if (renamed !== 'CORE COMPETENCIES') failures.push(`a renamed heading shows "${renamed}"`);
    const unrenamed = sectionHeading({ ...US_ONE_PAGE, sectionHeaders: { skills: 'CORE COMPETENCIES' } }, 'skills');
    if (unrenamed !== 'Skills') failures.push(`an unrenamed CORE COMPETENCIES shows "${unrenamed}"`);
    const secret = 'Secret volunteering item';
    const edited = {
      ...US_ONE_PAGE,
      sectionHeaders: { certifications: 'Extras' },
      customSections: [{ id: 'c1', title: 'Extras', items: [secret], hidden: true }],
    };
    const minimal = { personal: { fullName: 'x', email: 'x@example.com', phone: '1' }, summary: '', experience: [], education: [], skills: [], languages: [], certifications: [], customSections: [], settings: {} };
    const built = buildCvData({ structuredCV: minimal as never, showOptimized: false, editedOriginalCVData: edited });
    if (!built) failures.push('buildCvData returned nothing');
    else {
      if (JSON.stringify(built.additionalInfo ?? []).includes(secret)) failures.push('a hidden custom section was folded into additional info');
      if (JSON.stringify(visibleCvData(built)).includes(secret)) failures.push('a hidden custom section is visible');
      if (!built.customSections?.[0]?.hidden) failures.push('the hidden flag was dropped');
    }
    out.push(report('hidden-and-renamed-headings', failures));
  }

  // File names: letters without a decomposition, other scripts, and the length cap.
  {
    const failures: string[] = [];
    const cases: Array<[string, string]> = [
      ['Søren Łukasz', 'Soren_Lukasz'],
      ['Þórunn Æsa Đorđe', 'Thorunn_Aesa_Dorde'],
      ['Иван Петров', 'Ivan_Petrov'],
      ['Ελένη Παπαδοπούλου', 'Eleni_Papadopoulou'],
      ['山田 太郎', 'Applicant'],
    ];
    for (const [input, want] of cases) if (nameForFile(input) !== want) failures.push(`"${input}" became "${nameForFile(input)}", want "${want}"`);
    const long = exportFileName('cv_pdf', `${'Abcdefghij '.repeat(20)}Zed`, 'en');
    if (long.length > 80) failures.push(`a long name gives a ${long.length} character file name`);
    out.push(report('file-names-transliteration', failures));
  }

  // The renderer version is a hash of every output-shaping file, fonts included.
  {
    const failures: string[] = [];
    const files: Record<string, string> = {
      'src/components/cv-templates/A.tsx': 'template',
      'src/lib/cv-templates/print.ts': 'css',
      'src/lib/services/export/pdf.ts': 'pdf',
      'public/fonts/f.woff2': 'font bytes',
    };
    const makeDeps = (map: Record<string, string>): HashDeps => ({
      fs: {
        readdirSync: (dir: string) => {
          const prefix = `${dir.replace(/^\//, '')}/`;
          const names = new Set<string>();
          for (const key of Object.keys(map)) if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
          return [...names].map((name) => ({ name, isDirectory: () => Object.keys(map).some((key) => key.startsWith(`${prefix}${name}/`)), isFile: () => `${prefix}${name}` in map }));
        },
        readFileSync: (path: string) => new TextEncoder().encode(map[path.replace(/^\//, '')]),
      },
      path: { join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/') },
      crypto: { createHash: (a: string) => createHash(a) as never },
    });
    const empty = (dir: string) => ({ [`${dir}/placeholder.txt`]: '' });
    const hashOf = (map: Record<string, string>) => hashRendererSources('', makeDeps({ ...empty('src/components/cv-templates'), ...empty('src/lib/cv-templates'), ...empty('src/lib/services/export'), ...empty('public/fonts'), ...map }));
    const base = hashOf(files);
    if (base !== hashOf(files)) failures.push('the hash is not stable');
    for (const file of Object.keys(files)) {
      if (hashOf({ ...files, [file]: `${files[file]} changed` }) === base) failures.push(`an edit to ${file} does not change the version`);
    }
    out.push(report('renderer-source-hash', failures));
  }

  // A date of birth is written the way the CV's language and market write it.
  {
    const failures: string[] = [];
    const withDob = (data: typeof US_ONE_PAGE, dateOfBirth: string, language: string, country?: string) => ({ ...data, language, personal: { ...data.personal, dateOfBirth, country: country ?? data.personal.country } });
    const cases: Array<[CVData, string]> = [
      [US_PERSONAL, 'April 7, 1989'],
      [withDob(US_ONE_PAGE, '07.04.1989', 'en', 'United Kingdom'), '7 April 1989'],
      [withDob(US_ONE_PAGE, '1989-04-07', 'en'), 'April 7, 1989'],
      [DE_TWO_PAGE, '12.03.1986'],
      [withDob(DE_TWO_PAGE, '1989-04-07', 'de'), '07.04.1989'],
      [withDob(US_ONE_PAGE, '07.04.1989', 'fr', 'France'), '7 avril 1989'],
      [withDob(US_ONE_PAGE, '07.04.1989', 'es', 'España'), '7 de abril de 1989'],
      [withDob(US_ONE_PAGE, '07.04.1989', 'pt', 'Portugal'), '7 de abril de 1989'],
      [withDob(US_ONE_PAGE, '07.04.1989', 'it', 'Italia'), '7 aprile 1989'],
      [withDob(US_ONE_PAGE, '07.04.1989', 'nl', 'Nederland'), '7 april 1989'],
      [withDob(US_ONE_PAGE, 'around 1989', 'en'), 'around 1989'],
    ];
    for (const [data, want] of cases) {
      const got = formatBirthDate(data);
      if (got !== want) failures.push(`"${data.personal.dateOfBirth}" (${data.language}, ${data.personal.country}) became "${got}", want "${want}"`);
    }
    out.push(report('birth-date-format', failures));
  }

  // Every supported language: the headings, the open-ended label and the date format, against the hand-written table.
  {
    const failures: string[] = [];
    for (const fixture of CV_FIXTURES.filter((f) => f.locale)) {
      const lx = fixture.locale!;
      const keys = ['summary', 'experience', 'education', 'skills', 'certifications', 'languages'] as const;
      for (const key of keys) {
        const got = sectionHeading(fixture.data, key);
        if (got !== lx.headings[key]) failures.push(`${fixture.name}: ${key} heading is "${got}", want "${lx.headings[key]}"`);
      }
      const range = formatDateRange(fixture.data, { startDate: '03/2021', current: true });
      if (range !== `03/2021 - ${lx.present}`) failures.push(`${fixture.name}: range "${range}", want "03/2021 - ${lx.present}"`);
    }
    // The parser's own unaccented headings are normalised to the accented standard.
    const frParsed = { ...CV_FIXTURES.find((f) => f.name === 'fr-one-page')!.data, sectionHeaders: { experience: 'EXPERIENCE PROFESSIONNELLE', skills: 'COMPETENCES CLES', education: 'FORMATION' } };
    if (sectionHeading(frParsed, 'experience') !== 'Expérience' || sectionHeading(frParsed, 'skills') !== 'Compétences') failures.push('unaccented French headings are not normalised to the accented standard');
    out.push(report('locale-headings-and-dates', failures));
  }

  // Links, file names and the download header.
  {
    const failures: string[] = [];
    const long = 'https://portfolio.jordan-ellis.example/work/selected-case-studies-2020-2026/payments-platform-migration';
    const shown = displayUrl(long);
    if (shown !== 'portfolio.jordan-ellis.example/work/selected-ca…' || Array.from(shown).length !== 48) failures.push(`a long link shows "${shown}"`);
    if (fullUrl(long) !== long) failures.push('the full address of a long link changed');
    if (fullUrl('mailto:jordan@example.com') !== 'mailto:jordan@example.com') failures.push('mailto: got a scheme glued in front');
    if (displayUrl('mailto:jordan@example.com') !== 'jordan@example.com') failures.push('a mailto: link shows its scheme');
    if (fullUrl('tel:+14155550142') !== 'tel:+14155550142') failures.push('tel: got a scheme glued in front');
    // Names are cut by code point and stay well formed.
    const wide = '\u{1D518}'.repeat(120);
    const display = exportDisplayFileName('cv_pdf', wide, 'en');
    if (Array.from(display).length > 80) failures.push(`a display name of ${Array.from(display).length} code points`);
    if (!display.isWellFormed()) failures.push('a cut name holds a lone surrogate');
    if (encodeRfc5987("O'Brien (CV)*.pdf") !== 'O%27Brien%20%28CV%29%2A.pdf') failures.push(`filename* is ${encodeRfc5987("O'Brien (CV)*.pdf")}`);
    out.push(report('links-file-names-header', failures));
  }

  return out;
}

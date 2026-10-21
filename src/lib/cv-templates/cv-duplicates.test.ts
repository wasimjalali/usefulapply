/**
 * A CV shows each fact once: the driving licence ("Driving licence: Class B" in
 * the source, personal.driverLicense in the data) and two links to one site
 * ("https://wasimjalali.com" and "https://wasimjalali.com/#work").
 *
 * The last two tests render the fixture through the local export paths (the
 * DOCX builder and every template's print markup) and count each item in the
 * text the file holds.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CvTemplateSwitch } from '@/components/cv-templates/render';
import { unifiedWriterAgent } from '@/lib/agents/unified-writer-agent';
import { buildCvDocx } from '@/lib/services/export/cv-docx';
import { buildCvData } from './build-cv-data';
import { drivingLicenceLine, mentionsDrivingLicence, withDrivingLicenceLine } from './driving-licence';
import { CV_TEMPLATE_DEFINITIONS, type CVData } from './types';
import { contactLinks, displayUrl } from './url';

type Optimized = NonNullable<Parameters<typeof buildCvData>[0]['optimizedCVData']>;

// 1. Driving licence ---------------------------------------------------------------------------------------------

test('every spelling of a driving licence is recognised', () => {
  for (const text of [
    'Driving licence: Class B',
    'Driving License: Class B',
    "Driver's License: B",
    'Full clean UK driving licence',
    'Licence to drive: B',
    'Führerschein Klasse B',
    'Fuehrerschein: B',
    'Fahrerlaubnis Klasse B',
    'Permis de conduire B',
    'Carnet de conducir B',
    'Patente B',
    'Rijbewijs B',
  ]) {
    assert.equal(mentionsDrivingLicence(text), true, text);
  }
  for (const text of ['Valid German residence permit', 'Open to relocation', 'Work authorisation: EU', 'Licensed pharmacist', 'Driving force behind team']) {
    assert.equal(mentionsDrivingLicence(text), false, text);
  }
});

test('the text CV prints the licence once for British, American and German wording', () => {
  for (const [line, german] of [
    ['Driving licence: Class B', false],
    ["Driver's License: Class B", false],
    ['Führerschein: Klasse B', true],
  ] as const) {
    const text = unifiedWriterAgent.cvDataToText(optimized({ additionalInfo: [line, 'Valid German residence permit'] }), german);
    assert.equal(text.split('\n').filter((line) => mentionsDrivingLicence(line)).length, 1, text);
  }
});

test('the text CV adds the licence line when additionalInfo holds none', () => {
  const text = unifiedWriterAgent.cvDataToText(optimized({ additionalInfo: ['Valid German residence permit'] }), false);
  assert.equal(text.split('\n').filter((line) => mentionsDrivingLicence(line)).length, 1);
  assert.match(text, /Driver's License: Class B/);
  const german = unifiedWriterAgent.cvDataToText(optimized({ additionalInfo: undefined }), true);
  assert.match(german, /Führerschein: Class B/);
});

test('template data has one licence line however the source worded it', () => {
  for (const line of ['Driving licence: Class B', "Driver's License: Class B", 'Führerschein: Klasse B']) {
    const data = buildCvData({ structuredCV: structuredCv(), showOptimized: true, optimizedCVData: optimized({ additionalInfo: [line] }) });
    assert.deepEqual(data?.additionalInfo, [line]);
  }
  const none = buildCvData({ structuredCV: structuredCv(), showOptimized: true, optimizedCVData: optimized({ additionalInfo: undefined }) });
  assert.deepEqual(none?.additionalInfo, ["Driver's License: Class B"]);
});

test('the user\'s own lines are never removed; a licence line is added only when none states one', () => {
  assert.deepEqual(withDrivingLicenceLine(['Driving licence: Class B'], 'Class B', 'en'), ['Driving licence: Class B']);
  assert.deepEqual(withDrivingLicenceLine(['EU citizen, driving licence B'], 'B', 'en'), ['EU citizen, driving licence B']);
  assert.deepEqual(withDrivingLicenceLine(['Valid German residence permit'], 'Class B', 'en'), ['Valid German residence permit', "Driver's License: Class B"]);
  assert.deepEqual(withDrivingLicenceLine(undefined, undefined, 'en'), undefined);
});

// Review of #172 (Opus): a licence word or a driving word alone is not a driving licence.
test('other licences and phrases are not driving licences, so they are kept and the licence still prints', () => {
  for (const item of ['Licensed pharmacist', 'Licence to practise medicine (GMC)', 'Pilot licence (PPL)', '3 patented inventions', 'Driving force behind team', 'Screwdriver certification', 'Driver for change', 'Open-source licensing']) {
    assert.equal(mentionsDrivingLicence(item), false, item);
    assert.deepEqual(withDrivingLicenceLine([item], 'B', 'en'), [item, "Driver's License: B"], item);
  }
});

test('the added licence line follows the CV language', () => {
  assert.equal(drivingLicenceLine('Klasse B', 'de'), 'Führerschein: Klasse B');
  assert.equal(drivingLicenceLine('B', 'fr'), 'Permis de conduire: B');
  assert.equal(drivingLicenceLine('Class B', 'en'), "Driver's License: Class B");
  assert.equal(drivingLicenceLine('Class B', undefined), "Driver's License: Class B");
  assert.deepEqual(withDrivingLicenceLine(['Aufenthaltstitel: unbefristet'], 'Klasse B', 'de'), ['Aufenthaltstitel: unbefristet', 'Führerschein: Klasse B']);
  // A German CV whose own line states it keeps that line as written.
  assert.deepEqual(withDrivingLicenceLine(['Führerschein Klasse B', 'Aufenthaltstitel: unbefristet'], 'Klasse B', 'de'), ['Führerschein Klasse B', 'Aufenthaltstitel: unbefristet']);
});

// 2. Two links on one site ---------------------------------------------------------------------------------------

test('a website and its #work portfolio read differently', () => {
  assert.deepEqual(
    contactLinks(['https://wasimjalali.com', 'https://wasimjalali.com/#work']).map((link) => link.text),
    ['wasimjalali.com', 'wasimjalali.com/#work'],
  );
  // The order the links come in does not change what each one shows.
  assert.deepEqual(
    contactLinks(['https://wasimjalali.com/#work', 'https://wasimjalali.com']).map((link) => link.text),
    ['wasimjalali.com/#work', 'wasimjalali.com'],
  );
  assert.deepEqual(
    contactLinks(['https://a.com/x?v=1', 'https://a.com/x?v=2']).map((link) => link.text),
    ['a.com/x?v=1', 'a.com/x?v=2'],
  );
});

test('identical links show once, case and scheme aside', () => {
  assert.deepEqual(
    contactLinks(['https://wasimjalali.com', 'http://www.WasimJalali.com/']).map((link) => link.text),
    ['wasimjalali.com'],
  );
  assert.deepEqual(contactLinks(['https://wasimjalali.com/#work', 'wasimjalali.com/#work', 'https://wasimjalali.com']).map((link) => link.text), [
    'wasimjalali.com/#work',
    'wasimjalali.com',
  ]);
});

test('unrelated and single links render exactly as before', () => {
  const links = ['https://www.linkedin.com/in/wasimjalali?utm=1', 'https://github.com/wasimjalali', 'https://wasimjalali.com/#work'];
  assert.deepEqual(
    contactLinks(links).map((link) => link.text),
    links.map(displayUrl),
  );
  assert.deepEqual(contactLinks(['https://wasimjalali.com/#work']).map((link) => link.text), ['wasimjalali.com']);
  assert.deepEqual(contactLinks([]), []);
});

// 3. The fixture through the export paths ------------------------------------------------------------------------

test('the DOCX export holds the licence, the website and the portfolio once each', async () => {
  const data = fixtureCvData();
  const bytes = await buildCvDocx({ data, templateId: 'premium-ats', title: 'CV', author: 'Wasim Jalali' });
  const dir = mkdtempSync(join(tmpdir(), 'cv-duplicates-'));
  const file = join(dir, 'cv.docx');
  writeFileSync(file, bytes);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
  assert.equal(text.split('\n').filter((line) => mentionsDrivingLicence(line)).length, 1, text);
  assert.equal(count(text, 'Class B'), 1, text);
  assert.equal(count(text, 'wasimjalali.com/#work'), 1, text);
  // "wasimjalali.com" alone: the website. The portfolio's text has a suffix.
  assert.equal(text.match(/wasimjalali\.com(?![\w./#-])/g)?.length, 1, text);
});

test('every template prints the licence, the website and the portfolio once each', () => {
  // A stored CV with the restated line, and a freshly generated one without it.
  for (const additionalInfo of [['Driving licence: Class B'], undefined]) {
    for (const { id } of CV_TEMPLATE_DEFINITIONS) {
      const markup = renderToStaticMarkup(createElement(CvTemplateSwitch, { data: fixtureCvData(additionalInfo), templateId: id, mode: 'print' }));
      const text = markup.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, '\n');
      assert.equal(count(text, 'Class B'), 1, `${id}: ${text}`);
      assert.equal(count(text, 'wasimjalali.com/#work'), 1, id);
      assert.equal(text.match(/wasimjalali\.com(?![\w./#-])/g)?.length, 1, id);
    }
  }
});

// Fixtures -------------------------------------------------------------------------------------------------------

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function structuredCv() {
  return {
    personal: { fullName: 'Wasim Jalali', email: 'w@example.com', phone: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
  } as unknown as NonNullable<Parameters<typeof buildCvData>[0]['structuredCV']>;
}

/** What the CV writer produced for Wasim's CV: the licence in personal AND restated in additionalInfo. */
function optimized(overrides: Partial<Optimized> = {}): Optimized {
  return {
    personal: {
      fullName: 'Wasim Jalali',
      email: 'w@example.com',
      phone: '+49 1',
      website: 'https://wasimjalali.com',
      driverLicense: 'Class B',
    },
    summary: 'AI engineer.',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    additionalInfo: ['Driving licence: Class B'],
    ...overrides,
  } as Optimized;
}

/** The tailored CV as the templates and the DOCX get it: the writer's output after normalising, then buildCvData. */
function fixtureCvData(additionalInfo: string[] | undefined = ['Driving licence: Class B']): CVData {
  const data = buildCvData({
    structuredCV: structuredCv(),
    showOptimized: true,
    optimizedCVData: optimized({ additionalInfo }),
    profile: { portfolio_url: 'https://wasimjalali.com/#work' },
  });
  assert.ok(data);
  return data;
}

// Review of #172, round 2 (Opus): curly apostrophes and a bare licence word with a class.
test('curly apostrophes and bare licence words with a class are driving licences', () => {
  for (const item of ['Driver’s License: Class B', 'Driver’s licence (B)', 'Full clean UK licence (B)', 'Full clean UK licence', 'Class B licence', 'License: Class B', 'Licence: B', 'CDL Class A', 'Permis B', 'Permis B (véhiculé)', 'Patente: B', 'Carnet B']) {
    assert.equal(mentionsDrivingLicence(item), true, item);
    assert.deepEqual(withDrivingLicenceLine([item], 'Class B', 'en'), [item], item);
  }
  // The CV's own value next to a licence word counts too.
  assert.equal(mentionsDrivingLicence('UK licence, Klasse B held since 2015', 'Klasse B'), true);
  // Still not a driving licence.
  for (const item of ['Pilot licence (PPL)', 'Licensed pharmacist', 'Software license compliance', '3 patented inventions']) {
    assert.equal(mentionsDrivingLicence(item, 'Class B'), false, item);
  }
});

test('the text CV uses the output language for the licence line', () => {
  const text = unifiedWriterAgent.cvDataToText(optimized({ additionalInfo: ['Disponible en remoto'] }), false, 'es');
  assert.match(text, /Carnet de conducir: Class B/);
});

// Review of #172, round 3 (Opus): "de" is never a class, other permits never count, plurals and permits do.
test('round 3: French and Spanish "de", other permits and the value match', () => {
  for (const item of ['Driver’s License: B', 'Licences: B, BE', 'Licence (B, BE)', 'Driving permit B', 'International driving permit', 'Licença de condução B', 'Permis B', 'Carnet B']) {
    assert.equal(mentionsDrivingLicence(item), true, item);
  }
  for (const item of ['Permis de travail', 'Permis de travail valide', 'Permis de séjour (B)', 'Carnet de identidad', 'Patente de corso', 'Firearms licence (Category B)', 'Security licence (SIA), Class A', 'Real estate licence: C', 'Fishing licence: A', 'Class A shares license', 'Work permit: B']) {
    assert.equal(mentionsDrivingLicence(item, 'B'), false, item);
    // The real licence is still printed next to such an item.
    assert.deepEqual(withDrivingLicenceLine([item], 'B', 'fr'), [item, 'Permis de conduire: B'], item);
  }
  // The CV's own value counts only as a whole word.
  assert.equal(mentionsDrivingLicence('UK licence, Klasse B held since 2015', 'Klasse B'), true);
  assert.equal(mentionsDrivingLicence('Licence for a bakery', 'B'), false);
});

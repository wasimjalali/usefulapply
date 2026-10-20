/**
 * Structured cover letter eval, offline part: no API key, no model call.
 *
 *   npx tsx evals/structured-cover-letter-offline.ts
 *
 * Feeds doctored answers through the writer's real post-model path
 * (coverLetterFromModelOutput) and the guards it uses, starting from committed
 * fixtures: the real model answers and analysis context saved by run 3
 * (results/2026-10-20-structured-cover-letter/recipient-rerun-2/letters/) and
 * the committed ads. Each check changes one thing and states what must
 * survive. Writes offline-checks.json beside the run folders and exits 1 on
 * any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCases, resolveCase } from './lib/cases';
import type { MasterContext } from '../src/lib/agents/types';
import { coverLetterFromModelOutput } from '../src/lib/agents/unified-writer-agent';
import { extractAdAddress, resolveClosing, resolveSalutation, resolveSubject } from '../src/lib/agents/cover-letter-guards';
import { resolveLetterMarket } from '../src/lib/agents/cover-letter-structure';
import { isStructuredCoverLetter } from '../src/lib/cover-letter/contract';
import type { SupportedLanguage } from '../src/lib/utils/language-detector';

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'evals', 'results', '2026-10-20-structured-cover-letter');
const FIXTURES = path.join(RESULTS, 'recipient-rerun-2', 'letters');

interface Fixture {
  raw_letter_outputs: string[];
  context: { applicant: MasterContext['applicant']; job: MasterContext['job'] };
}

const rows = [
  ...loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')),
  ...loadCases(path.join(ROOT, 'evals', 'dataset', 'structured-letter-cases.jsonl')),
];
const jdOf = (id: string) => resolveCase(rows.find((row) => row.id === id)!).jdText;
const cvOf = (id: string) => resolveCase(rows.find((row) => row.id === id)!).cvText;

function fixture(id: string) {
  const f = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${id}.json`), 'utf8')) as Fixture;
  const raw = f.raw_letter_outputs.at(-1)!;
  const answer = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as Record<string, unknown> & {
    paragraphs: string[];
    recipient?: Record<string, unknown>;
  };
  const context = (language: SupportedLanguage, overrides: Partial<MasterContext> = {}): MasterContext => ({
    sessionId: `offline-${id}`,
    jobDescription: jdOf(id),
    rawCV: cvOf(id),
    detectedLanguage: language,
    applicant: f.context.applicant,
    job: f.context.job,
    ...overrides,
  });
  return { answer, context };
}

const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
const check = (name: string, pass: boolean, detail: unknown) => {
  checks.push({ name, pass, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
};

const de = fixture('sl-de-contact');
const deRun = (
  edit: { recipient?: Record<string, unknown>; salutation?: string; paragraphs?: string[]; subject?: string },
  overrides: Partial<MasterContext> = {},
) => coverLetterFromModelOutput(
  JSON.stringify({ ...de.answer, ...edit, recipient: { ...de.answer.recipient, ...edit.recipient } }),
  de.context('de', overrides),
  'de',
);
const lines = (letter: { structured: { recipient: { addressLines: string[] } } }) => letter.structured.recipient.addressLines;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const REAL = ['Industriestraße 14', '90431 Nürnberg'];

// --- Postal address -------------------------------------------------------
{
  const base = deRun({});
  check('real_address_kept', same(lines(base), REAL), lines(base));
  check('contract_guard_accepts_output', isStructuredCoverLetter(base.structured), 'isStructuredCoverLetter(output)');
  const fake = deRun({ recipient: { addressLines: ['Hauptstraße 99', '10115 Berlin'] } });
  check('fake_address_dropped', lines(fake).length === 0 && !fake.body.includes('Hauptstraße 99'), lines(fake));
  const partial = deRun({ recipient: { addressLines: ['Industriestraße 14', '80331 München'] } });
  check('partly_fake_address_dropped_whole', lines(partial).length === 0, lines(partial));
  const twoOffices = `${jdOf('sl-de-contact')}\n\nUnser Büro Berlin: Alexanderplatz 1, 10178 Berlin. Unser Büro München: Leopoldstraße 2, 80331 München.`;
  const splice = deRun({ recipient: { addressLines: ['Alexanderplatz 1', '80331 München'] } }, { jobDescription: twoOffices });
  check('splice_of_two_offices_dropped', lines(splice).length === 0, lines(splice));
  const noNumber = deRun({ recipient: { addressLines: ['Industriestraße', '90431 Nürnberg'] } });
  check('street_without_house_number_dropped', lines(noNumber).length === 0, lines(noNumber));
  const phoneOnly = deRun({ recipient: { addressLines: ['030 123456', '90431 Nürnberg'] } });
  check('phone_line_is_not_an_address', lines(phoneOnly).length === 0, lines(phoneOnly));
  const phoneBetween = deRun({ recipient: { addressLines: ['Industriestraße 14', '030 123456', '90431 Nürnberg'] } });
  check('phone_line_set_aside', same(lines(phoneBetween), REAL), lines(phoneBetween));
  const email = deRun({ recipient: { addressLines: [...REAL, 'bewerbung@brenner-getriebe.example.de'] } });
  check('email_line_set_aside', same(lines(email), REAL), lines(email));
  const digitless = deRun({ recipient: { addressLines: ['Personalabteilung'] } });
  check('digitless_address_dropped', lines(digitless).length === 0, lines(digitless));
  const eszett = deRun({ recipient: { addressLines: ['Industriestrasse 14', '90431 Nürnberg'] } });
  check('ss_for_eszett_matches_and_keeps_ad_spelling', same(lines(eszett), REAL), lines(eszett));
  const casing = deRun({ recipient: { addressLines: ['INDUSTRIESTRASSE 14', '90431 NÜRNBERG'] } });
  check('ad_casing_kept', same(lines(casing), REAL), lines(casing));
  const saved = deRun({}, { letterRecipient: { address: 'Musterweg 3\n90402 Nürnberg' } });
  check('saved_address_wins', same(lines(saved), ['Musterweg 3', '90402 Nürnberg']), lines(saved));
  let inParagraph = 'no error';
  try {
    deRun({ paragraphs: [`${de.answer.paragraphs[0]} Sie finden uns in der Industriestraße 14.`, ...de.answer.paragraphs.slice(1)] });
  } catch (error) {
    inParagraph = (error as Error).message;
  }
  check('address_in_paragraph_rejected', /postal address/u.test(inParagraph), inParagraph);

  const cloudflare = extractAdAddress(['101 Townsend St.', 'San Francisco, CA 94107'], jdOf('syn-07'), { companyName: 'Cloudflare' });
  check('boilerplate_accommodation_address_dropped', cloudflare.length === 0, cloudflare);
  const northwind = extractAdAddress(['220 West Lake Street, Suite 1400', 'Chicago, IL 60606'], jdOf('sl-us-address'), { companyName: 'Northwind Freight Inc.' });
  check('us_application_address_kept', same(northwind, ['220 West Lake Street, Suite 1400', 'Chicago, IL 60606']), northwind);
  const lyon = extractAdAddress(['12 rue de la République', '69002 Lyon'], jdOf('sl-fr-contact'), { companyName: 'Lumière Logistique SAS' });
  check('fr_application_address_kept', same(lyon, ['12 rue de la République', '69002 Lyon']), lyon);
}

// --- Contact and salutation -----------------------------------------------
{
  const fakeContact = deRun({ recipient: { contactPerson: 'Herr Thomas Weber' } });
  check('fake_contact_dropped', fakeContact.structured.recipient.contactPerson === undefined, String(fakeContact.structured.recipient.contactPerson));

  const twoPeople = jdOf('sl-de-contact').replace('Frau Melanie Brandl', 'Herr Jonas Müller und Frau Anna Hoffmann');
  const crossTitle = deRun({ recipient: { contactPerson: 'Frau Anna Hoffmann' }, salutation: 'Sehr geehrter Herr Hoffmann,' }, { jobDescription: twoPeople });
  check('cross_person_title_falls_back_to_neutral', crossTitle.structured.salutation === 'Guten Tag Anna Hoffmann,', crossTitle.structured.salutation);
  const rightTitle = deRun({ recipient: { contactPerson: 'Frau Anna Hoffmann' }, salutation: 'Sehr geehrte Frau Hoffmann,' }, { jobDescription: twoPeople });
  check('stated_title_for_same_person_kept', rightTitle.structured.salutation === 'Sehr geehrte Frau Hoffmann,', rightTitle.structured.salutation);
  const mixedNames = deRun({ recipient: { contactPerson: 'Frau Anna Hoffmann' }, salutation: 'Guten Tag Jonas Hoffmann,' }, { jobDescription: twoPeople });
  check('first_and_last_name_from_two_people_falls_back', mixedNames.structured.salutation === 'Guten Tag Anna Hoffmann,', mixedNames.structured.salutation);

  const noTitle = jdOf('sl-de-contact').replace('Frau Melanie Brandl', 'Jordan Hoffmann');
  const geehrter = deRun({ recipient: { contactPerson: 'Jordan Hoffmann' }, salutation: 'Sehr geehrter Jordan Hoffmann,' }, { jobDescription: noTitle });
  check('geehrter_without_stated_title_falls_back', geehrter.structured.salutation === 'Guten Tag Jordan Hoffmann,', geehrter.structured.salutation);

  const savedContact = deRun({ salutation: 'Sehr geehrte Frau Brandl,' }, { letterRecipient: { contactPerson: 'Herr Paul Kaiser' } });
  check('saved_contact_is_the_addressee', savedContact.structured.salutation === 'Guten Tag Paul Kaiser,' && savedContact.structured.recipient.contactPerson === 'Herr Paul Kaiser', savedContact.structured.salutation);

  const us = fixture('sl-us-address');
  const guessed = coverLetterFromModelOutput(JSON.stringify({ ...us.answer, salutation: 'Dear Ms. Whitfield,' }), us.context('en'), 'en');
  check('guessed_title_falls_back_to_neutral', guessed.structured.salutation === 'Dear Dana Whitfield,', guessed.structured.salutation);
  const comma = coverLetterFromModelOutput(JSON.stringify({ ...us.answer, salutation: 'Dear Dana Whitfield' }), us.context('en'), 'en');
  check('en_salutation_gets_its_comma', comma.structured.salutation === 'Dear Dana Whitfield,', comma.structured.salutation);
  const placeholder = coverLetterFromModelOutput(JSON.stringify({ ...us.answer, salutation: 'Dear [Name],' }), us.context('en'), 'en');
  check('placeholder_salutation_falls_back', placeholder.structured.salutation === 'Dear Dana Whitfield,', placeholder.structured.salutation);

  const guard = (salutation: string, language: SupportedLanguage, contactPerson: string | undefined, adText: string) => resolveSalutation({
    salutation, language, adText, contactPerson, companyNames: [], isBlacklisted: () => false, isPlaceholder: () => false,
  }).value;
  check('nobody_named_gets_generic_greeting', guard('Dear Mr. Smith,', 'en', undefined, 'An ad.') === 'Dear Hiring Team,', guard('Dear Mr. Smith,', 'en', undefined, 'An ad.'));
  check('title_without_name_gets_generic_greeting', guard('Sehr geehrter Herr,', 'de', undefined, 'Eine Anzeige.') === 'Sehr geehrte Damen und Herren,', guard('Sehr geehrter Herr,', 'de', undefined, 'Eine Anzeige.'));
  const frAd = 'Merci d\'adresser votre candidature à : Mme Claire Dubois, Responsable du recrutement';
  check('fr_stated_title_kept', guard('Madame Dubois,', 'fr', 'Mme Claire Dubois', frAd) === 'Madame Dubois,', guard('Madame Dubois,', 'fr', 'Mme Claire Dubois', frAd));
  check('fr_chere_madame_kept', guard('Chère Madame Dubois,', 'fr', 'Mme Claire Dubois', frAd) === 'Chère Madame Dubois,', guard('Chère Madame Dubois,', 'fr', 'Mme Claire Dubois', frAd));
  check('fr_wrong_title_falls_back', guard('Monsieur Dubois,', 'fr', 'Mme Claire Dubois', frAd) === 'Bonjour Claire Dubois,', guard('Monsieur Dubois,', 'fr', 'Mme Claire Dubois', frAd));
  check('fr_cher_adjective_falls_back', guard('Cher Claire Dubois,', 'fr', 'Mme Claire Dubois', frAd) === 'Bonjour Claire Dubois,', guard('Cher Claire Dubois,', 'fr', 'Mme Claire Dubois', frAd));
  check('fr_generic_kept', guard('Madame, Monsieur,', 'fr', undefined, frAd) === 'Madame, Monsieur,', guard('Madame, Monsieur,', 'fr', undefined, frAd));
  const esAd = 'Envía tu solicitud a Laura García, Recursos Humanos.';
  check('es_estimada_without_title_falls_back', guard('Estimada Sra. García:', 'es', 'Laura García', esAd) === 'Buenos días Laura García,', guard('Estimada Sra. García:', 'es', 'Laura García', esAd));
  const nlAd = 'Stuur je sollicitatie naar mevrouw Anne de Vries.';
  check('nl_stated_title_kept', guard('Geachte mevrouw De Vries,', 'nl', 'mevrouw Anne de Vries', nlAd) === 'Geachte mevrouw De Vries,', guard('Geachte mevrouw De Vries,', 'nl', 'mevrouw Anne de Vries', nlAd));
  check('it_signora_without_title_falls_back', guard('Gentile Signora Rossi,', 'it', 'Giulia Rossi', 'Candidature a Giulia Rossi.') === 'Gentile Giulia Rossi,', guard('Gentile Signora Rossi,', 'it', 'Giulia Rossi', 'Candidature a Giulia Rossi.'));
}

// --- Subject and closing --------------------------------------------------
{
  const subject = (value: string, language: SupportedLanguage, adText: string, jobTitle: string) => resolveSubject({ subject: value, language, adText, jobTitle, isPlaceholder: () => false }).value;
  check('subject_number_not_in_ad_falls_back', subject('Bewerbung als Key Account Manager, Kennziffer 99999', 'de', jdOf('sl-de-contact'), 'Key Account Manager') === 'Bewerbung als Key Account Manager', subject('Bewerbung als Key Account Manager, Kennziffer 99999', 'de', jdOf('sl-de-contact'), 'Key Account Manager'));
  check('subject_ad_number_kept', subject('Bewerbung als Key Account Manager, Kennziffer KAM-2026-17', 'de', jdOf('sl-de-contact'), 'Key Account Manager').endsWith('KAM-2026-17'), 'KAM-2026-17');
  check('subject_short_numbers_ignored', subject('Application for Level 2 Engineer', 'en', 'An ad.', 'Level 2 Engineer') === 'Application for Level 2 Engineer', 'Level 2');
  check('subject_bracket_from_title_kept', subject('Application for Engineer [Remote]', 'en', 'Engineer [Remote]', 'Engineer [Remote]') === 'Application for Engineer [Remote]', 'Engineer [Remote]');
  check('subject_placeholder_falls_back', subject('Application for [Job Title]', 'en', 'An ad.', 'Engineer') === 'Application for Engineer', 'Application for Engineer');
  check('german_subject_without_bewerbung_falls_back', subject('Key Account Manager', 'de', 'Eine Anzeige.', 'Key Account Manager') === 'Bewerbung als Key Account Manager', 'Bewerbung als Key Account Manager');
  const closing = resolveClosing({ closing: 'Kind regards, Tomas Brandt', language: 'en', applicantName: 'Tomas Brandt', isBlacklisted: () => false, isPlaceholder: () => false }).value;
  check('closing_without_signature_name', closing === 'Kind regards,', closing);
}

// --- Market ---------------------------------------------------------------
{
  const cases: Array<[string, string, string | undefined, 'us' | 'dach']> = [
    ['en', 'Vienna, VA', 'en', 'us'],
    ['en', 'Berlin, MA', 'en', 'us'],
    ['en', 'Geneva, IL 60134', 'en', 'us'],
    ['en', 'Berlin', 'en', 'us'],
    ['en', 'Berlin, Germany', 'en', 'dach'],
    ['en', 'Wien', 'de', 'dach'],
    ['en', 'Zürich, Schweiz', 'en', 'dach'],
    ['de', 'Remote', 'de', 'dach'],
  ];
  for (const [language, location, adLanguage, expected] of cases) {
    const market = resolveLetterMarket(language, location, adLanguage);
    check(`market_${location.replace(/\W+/gu, '_')}_${language}_${adLanguage}`, market === expected, `${market} (expected ${expected})`);
  }
}

check('contract_guard_rejects_shallow_object', !isStructuredCoverLetter({ version: 2, subject: '', paragraphs: [], sender: {}, recipient: {} }), 'shallow object');

const failed = checks.filter((c) => !c.pass);
fs.writeFileSync(path.join(RESULTS, 'offline-checks.json'), JSON.stringify({ date: new Date().toISOString(), total: checks.length, failed: failed.length, checks }, null, 1) + '\n');
for (const c of checks) console.log(`${c.pass ? 'pass' : 'FAIL'} ${c.name}: ${c.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} offline checks pass`);
if (failed.length > 0) process.exit(1);

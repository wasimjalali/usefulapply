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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sql, type SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { applicationSessions } from '../src/db/schema';
import { withRecipientReset } from '../src/db/session-recipient-reset';
import { isSameStoredText, sqlTrimStoredText, storedTextOrEmpty, trimStoredText } from '../src/db/trim-text';
import { recipientFillCondition } from '../src/db/recipient-fill';
import { loadCases, resolveCase } from './lib/cases';
import type { MasterContext } from '../src/lib/agents/types';
import { coverLetterFromModelOutput } from '../src/lib/agents/unified-writer-agent';
import { adContactPerson, extractAdAddress, hasSentenceBoundary, resolveClosing, resolveSalutation, resolveSubject } from '../src/lib/agents/cover-letter-guards';
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
  check('cross_person_title_corrected_to_stated_title', crossTitle.structured.salutation === 'Sehr geehrte Frau Hoffmann,', crossTitle.structured.salutation);
  const rightTitle = deRun({ recipient: { contactPerson: 'Frau Anna Hoffmann' }, salutation: 'Sehr geehrte Frau Hoffmann,' }, { jobDescription: twoPeople });
  check('stated_title_for_same_person_kept', rightTitle.structured.salutation === 'Sehr geehrte Frau Hoffmann,', rightTitle.structured.salutation);
  const mixedNames = deRun({ recipient: { contactPerson: 'Frau Anna Hoffmann' }, salutation: 'Guten Tag Jonas Hoffmann,' }, { jobDescription: twoPeople });
  check('first_and_last_name_from_two_people_falls_back', mixedNames.structured.salutation === 'Sehr geehrte Frau Hoffmann,', mixedNames.structured.salutation);

  const noTitle = jdOf('sl-de-contact').replace('Frau Melanie Brandl', 'Jordan Hoffmann');
  const geehrter = deRun({ recipient: { contactPerson: 'Jordan Hoffmann' }, salutation: 'Sehr geehrter Jordan Hoffmann,' }, { jobDescription: noTitle });
  check('geehrter_without_stated_title_falls_back', geehrter.structured.salutation === 'Guten Tag Jordan Hoffmann,', geehrter.structured.salutation);

  const savedContact = deRun({ salutation: 'Sehr geehrte Frau Brandl,' }, { letterRecipient: { contactPerson: 'Herr Paul Kaiser' } });
  check('saved_contact_is_the_addressee', savedContact.structured.salutation === 'Sehr geehrter Herr Kaiser,' && savedContact.structured.recipient.contactPerson === 'Herr Paul Kaiser', savedContact.structured.salutation);

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
  check('fr_wrong_title_corrected_to_stated_title', guard('Monsieur Dubois,', 'fr', 'Mme Claire Dubois', frAd) === 'Madame Dubois,', guard('Monsieur Dubois,', 'fr', 'Mme Claire Dubois', frAd));
  check('fr_cher_adjective_falls_back', guard('Cher Claire Dubois,', 'fr', 'Mme Claire Dubois', frAd) === 'Madame Dubois,', guard('Cher Claire Dubois,', 'fr', 'Mme Claire Dubois', frAd));
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

// --- PR #152 review round 2, one or more checks per item ------------------
{
  const apply = (block: string, lead = 'Please send your application to:\nAcme Ltd') => `${lead}\n${block}\nWe look forward to hearing from you.`;
  const addr = (lines: string[], ad: string, anchors: Record<string, string> = { companyName: 'Acme Ltd' }) => extractAdAddress(lines, ad, anchors);

  // 1. US house numbers with 4 or 5 digits.
  const sf = addr(['1234 Market Street, San Francisco, CA 94103'], apply('1234 Market Street, San Francisco, CA 94103'));
  check('r2_1_us_4_digit_house_number_kept', same(sf, ['1234 Market Street', 'San Francisco, CA 94103']), sf);
  const dallas = addr(['10000 North Central Expressway, Dallas, TX 75231'], apply('10000 North Central Expressway, Dallas, TX 75231'));
  check('r2_1_us_5_digit_house_number_kept', same(dallas, ['10000 North Central Expressway', 'Dallas, TX 75231']), dallas);
  const twoLineSf = addr(['1234 Market Street', 'San Francisco, CA 94103'], apply('1234 Market Street\nSan Francisco, CA 94103'));
  check('r2_1_us_two_line_kept', same(twoLineSf, ['1234 Market Street', 'San Francisco, CA 94103']), twoLineSf);

  // 2. Boilerplate window.
  const eeoThenSubmit = addr(['Hauptstraße 5', '10115 Berlin'], 'We are an equal opportunity employer and welcome applicants with disabilities. Please send your application to: Acme GmbH, Hauptstraße 5, 10115 Berlin.', { companyName: 'Acme GmbH' });
  check('r2_2_submission_phrase_wins_inside_boilerplate', same(eeoThenSubmit, ['Hauptstraße 5', '10115 Berlin']), eeoThenSubmit);
  const privacyAfter = addr(['Hauptstraße 5', '10115 Berlin'], 'Bewerbungen richten Sie an: Acme GmbH, Hauptstraße 5, 10115 Berlin. Datenschutzhinweise und Privacy Policy finden Sie auf unserer Website.', { companyName: 'Acme GmbH' });
  check('r2_2_privacy_words_after_block_do_not_reject', same(privacyAfter, ['Hauptstraße 5', '10115 Berlin']), privacyAfter);
  const cloudflare = extractAdAddress(['101 Townsend St.', 'San Francisco, CA 94107'], jdOf('syn-07'), { companyName: 'Cloudflare' });
  check('r2_2_syn07_accommodation_address_still_dropped', cloudflare.length === 0, cloudflare);

  // 3. Anchor vocabulary.
  const contactColon = addr(['Hauptstraße 5', '10115 Berlin'], 'Wir freuen uns auf Sie.\nContact: Hauptstraße 5, 10115 Berlin', {});
  check('r2_3_contact_colon_anchors', same(contactColon, ['Hauptstraße 5', '10115 Berlin']), contactColon);
  const office = addr(['500 Main Street', 'Boston, MA 02110'], 'Great benefits.\nOur office: 500 Main Street, Boston, MA 02110', {});
  check('r2_3_our_office_anchors', same(office, ['500 Main Street', 'Boston, MA 02110']), office);
  const hq = addr(['500 Main Street', 'Boston, MA 02110'], 'Great benefits.\nHeadquarters: 500 Main Street, Boston, MA 02110', {});
  check('r2_3_headquarters_anchors', same(hq, ['500 Main Street', 'Boston, MA 02110']), hq);
  const bareBewerbung = addr(['Hauptstraße 5', '10115 Berlin'], 'Wir freuen uns auf Ihre Bewerbung.\nHauptstraße 5, 10115 Berlin', {});
  check('r2_3_bare_bewerbung_is_not_an_anchor', bareBewerbung.length === 0, bareBewerbung);
  const einsatzort = addr(['Kundenstraße 5', '10115 Berlin'], 'Acme GmbH sucht Sie für ein Projekt bei unserem Kunden.\nEinsatzort: Kundenstraße 5, 10115 Berlin', { companyName: 'Acme GmbH' });
  check('r2_3_einsatzort_is_not_an_application_address', einsatzort.length === 0, einsatzort);
  const jobSite = addr(['900 Harbor Road', 'Oakland, CA 94607'], 'Acme Ltd is hiring.\nJob site: 900 Harbor Road, Oakland, CA 94607', {});
  check('r2_3_job_site_is_not_an_application_address', jobSite.length === 0, jobSite);

  // 4. More address formats.
  const formats: Array<[string, string[], string]> = [
    ['postfach', ['Postfach 12 34 56', '90431 Nürnberg'], 'Postfach 12 34 56\n90431 Nürnberg'],
    ['po_box', ['PO Box 12345', 'Chicago, IL 60606'], 'PO Box 12345\nChicago, IL 60606'],
    ['canada', ['100 King Street West', 'Toronto, ON M5X 1A9'], '100 King Street West\nToronto, ON M5X 1A9'],
    ['uk', ['10 Downing Street', 'London SW1A 2AA'], '10 Downing Street\nLondon SW1A 2AA'],
    ['portugal', ['Rua Augusta 100', '1100-053 Lisboa'], 'Rua Augusta 100\n1100-053 Lisboa'],
    ['us_no_comma', ['220 West Lake Street', 'Chicago IL 60606'], '220 West Lake Street\nChicago IL 60606'],
    ['us_full_state', ['220 West Lake Street', 'Chicago, Illinois 60606'], '220 West Lake Street\nChicago, Illinois 60606'],
    ['haus_line', ['Campusweg 2', 'Haus 3', '10115 Berlin'], 'Campusweg 2\nHaus 3\n10115 Berlin'],
    ['c_o_line', ['c/o Regus', 'Hauptstraße 5', '10115 Berlin'], 'c/o Regus\nHauptstraße 5\n10115 Berlin'],
  ];
  for (const [name, lines, block] of formats) {
    const got = addr(lines, apply(block));
    check(`r2_4_format_${name}_kept`, same(got, lines), got);
  }
  const piped = addr(['Hauptstraße 5 | 10115 Berlin'], apply('Hauptstraße 5 | 10115 Berlin'));
  check('r2_4_pipe_separator_split', same(piped, ['Hauptstraße 5', '10115 Berlin']), piped);
  const dotted = addr(['Hauptstraße 5 · 10115 Berlin'], apply('Hauptstraße 5 · 10115 Berlin'));
  check('r2_4_middle_dot_separator_split', same(dotted, ['Hauptstraße 5', '10115 Berlin']), dotted);
  const dashed = addr(['Hauptstraße 5 - 10115 Berlin'], apply('Hauptstraße 5 - 10115 Berlin'));
  check('r2_4_spaced_hyphen_separator_split', same(dashed, ['Hauptstraße 5', '10115 Berlin']), dashed);
  const semicolon = addr(['Hauptstraße 5; 10115 Berlin'], apply('Hauptstraße 5; 10115 Berlin'));
  check('r2_4_semicolon_separator_split', same(semicolon, ['Hauptstraße 5', '10115 Berlin']), semicolon);
  const markdown = addr(['**Hauptstraße 5**', '_10115 Berlin_'], apply('**Hauptstraße 5**\n_10115 Berlin_'));
  check('r2_4_markdown_stripped', same(markdown, ['Hauptstraße 5', '10115 Berlin']), markdown);
  const longLine = `${'Langer Straßenname '.repeat(6)}5`;
  const tooLong = addr([longLine, '10115 Berlin'], apply(`${longLine}\n10115 Berlin`));
  check('r2_4_line_over_100_chars_dropped', tooLong.length === 0, `${longLine.length} chars -> ${JSON.stringify(tooLong)}`);

  // 5. Sign-off check.
  const us = fixture('sl-us-address');
  const usParagraphs = us.answer.paragraphs;
  const bestSentence = coverLetterFromModelOutput(JSON.stringify({ ...us.answer, closing: 'Best,', paragraphs: [...usParagraphs.slice(0, 2), `${usParagraphs[2]} I promise I will do my best.`] }), us.context('en'), 'en');
  check('r2_5_sentence_ending_in_best_passes', bestSentence.structured.closing === 'Best,', bestSentence.structured.closing);
  let signOff = 'no error';
  try {
    coverLetterFromModelOutput(JSON.stringify({ ...us.answer, closing: 'Kind regards,', paragraphs: [...usParagraphs.slice(0, 2), `${usParagraphs[2]}\nKind regards, Tomas Brandt`] }), us.context('en'), 'en');
  } catch (error) {
    signOff = (error as Error).message;
  }
  check('r2_5_sign_off_on_last_line_rejected', /sign-off/u.test(signOff), signOff);

  // 6. US state codes versus DACH codes.
  const markets: Array<[string, 'us' | 'dach']> = [['Berlin, DE', 'dach'], ['Wien, AT', 'dach'], ['Zürich, CH', 'dach'], ['Bern, BE', 'dach'], ['Dover, DE', 'us'], ['Vienna, VA', 'us']];
  for (const [location, expected] of markets) {
    const market = resolveLetterMarket('en', location, 'en');
    check(`r2_6_market_${location.replace(/\W+/gu, '_')}`, market === expected, `${market} (expected ${expected})`);
  }

  // 7. Contract guard, field by field.
  const good = deRun({}).structured;
  const broken: Array<[string, unknown]> = [
    ['empty subject', { ...good, subject: ' ' }],
    ['no paragraphs', { ...good, paragraphs: [] }],
    ['empty language', { ...good, language: '' }],
    ['numeric place', { ...good, place: 5 }],
    ['sender phone not text', { ...good, sender: { ...good.sender, phone: 123 } }],
    ['sender links not a list', { ...good, sender: { ...good.sender, links: 'x' } }],
    ['recipient contact not text', { ...good, recipient: { ...good.recipient, contactPerson: 1 } }],
    ['empty signature name', { ...good, signatureName: '' }],
  ];
  for (const [name, value] of broken) check(`r2_7_contract_rejects_${name.replace(/\W+/gu, '_')}`, !isStructuredCoverLetter(value), name);

  // 8. A missing or null subject degrades.
  const noSubjectAnswer = { ...us.answer } as Record<string, unknown>;
  delete noSubjectAnswer.subject;
  const noSubject = coverLetterFromModelOutput(JSON.stringify(noSubjectAnswer), us.context('en'), 'en');
  check('r2_8_missing_subject_degrades', noSubject.structured.subject === `Application for ${us.context('en').job?.title}`, noSubject.structured.subject);
  const nullSubject = deRun({ subject: null as unknown as string });
  check('r2_8_null_subject_degrades_de', nullSubject.structured.subject.startsWith('Bewerbung als '), nullSubject.structured.subject);

  // 9. Fallbacks.
  const guard = (salutation: string, language: SupportedLanguage, contactPerson: string | undefined, adText: string) => resolveSalutation({
    salutation, language, adText, contactPerson, companyNames: [], isBlacklisted: () => false, isPlaceholder: () => false,
  }).value;
  check('r2_9_one_word_contact_gets_generic', guard('Dear Ms. Brandl,', 'en', 'Brandl', 'Send your application to Brandl.') === 'Dear Hiring Team,', guard('Dear Ms. Brandl,', 'en', 'Brandl', 'Send your application to Brandl.'));
  check('r2_9_bare_surname_salutation_falls_back', guard('Dear Brandl,', 'en', 'Brandl', 'Send your application to Brandl.') === 'Dear Hiring Team,', guard('Dear Brandl,', 'en', 'Brandl', 'Send your application to Brandl.'));
  check('r2_9_wrong_gender_corrected_de', guard('Sehr geehrter Herr Brandl,', 'de', 'Frau Melanie Brandl', 'Bewerbung an Frau Melanie Brandl') === 'Sehr geehrte Frau Brandl,', guard('Sehr geehrter Herr Brandl,', 'de', 'Frau Melanie Brandl', 'Bewerbung an Frau Melanie Brandl'));
  const closing = (value: string) => resolveClosing({ closing: value, language: 'en', applicantName: 'Tomas Brandt', isBlacklisted: () => false, isPlaceholder: () => false }).value;
  check('r2_9_closing_honorific_and_separator_removed', closing('Best regards, Mr. Tomas Brandt') === 'Best regards,', closing('Best regards, Mr. Tomas Brandt'));
  check('r2_9_closing_unknown_after_strip_gets_default', closing('Thanks so much - Tomas Brandt') === 'Sincerely,', closing('Thanks so much - Tomas Brandt'));

  // 10. Contact placement: an imprint name is not an application contact.
  const imprintAd = `${jdOf('sl-de-contact')}\n\nImpressum: Brenner Getriebe GmbH, Geschäftsführer: Dr. Klaus Brenner, Registergericht Nürnberg HRB 12345`;
  const imprintContact = deRun({ recipient: { contactPerson: 'Dr. Klaus Brenner' }, salutation: 'Sehr geehrte Damen und Herren,' }, { jobDescription: imprintAd });
  check('r2_10_imprint_name_dropped', imprintContact.structured.recipient.contactPerson === undefined, String(imprintContact.structured.recipient.contactPerson));
  check('r2_10_application_contact_kept', deRun({}).structured.recipient.contactPerson === 'Frau Melanie Brandl', String(deRun({}).structured.recipient.contactPerson));

  // 11. Address in the letter text: the street part alone, and short saved unit lines.
  let streetOnly = 'no error';
  try {
    coverLetterFromModelOutput(JSON.stringify({ ...us.answer, paragraphs: [`${usParagraphs[0]} I could visit you at 220 West Lake Street.`, ...usParagraphs.slice(1)] }), us.context('en'), 'en');
  } catch (error) {
    streetOnly = (error as Error).message;
  }
  check('r2_11_street_part_alone_rejected', /postal address/u.test(streetOnly), streetOnly);
  const floor = coverLetterFromModelOutput(
    JSON.stringify({ ...us.answer, paragraphs: [`${usParagraphs[0]} My team sat on Floor 5.`, ...usParagraphs.slice(1)] }),
    us.context('en', { letterRecipient: { address: '1 Harbor Plaza\nFloor 5\nChicago, IL 60601' } }),
    'en',
  );
  check('r2_11_short_saved_unit_line_ignored', floor.structured.recipient.addressLines.includes('Floor 5'), floor.structured.recipient.addressLines);

  // 12. Subject references.
  const subject = (value: string, adText: string, jobTitle: string, language: SupportedLanguage = 'en') => resolveSubject({ subject: value, language, adText, jobTitle, isPlaceholder: () => false }).value;
  const usAd = jdOf('sl-us-address');
  check('r2_12_unstated_reference_dropped_at_comma', subject('Application for Senior FP&A Analyst, Req #NW-9999', usAd, 'Senior FP&A Analyst') === 'Application for Senior FP&A Analyst', subject('Application for Senior FP&A Analyst, Req #NW-9999', usAd, 'Senior FP&A Analyst'));
  check('r2_12_unstated_code_without_comma_rebuilt', subject('Application for Senior FP&A Analyst (ABC-XYZ)', usAd, 'Senior FP&A Analyst') === 'Application for Senior FP&A Analyst', subject('Application for Senior FP&A Analyst (ABC-XYZ)', usAd, 'Senior FP&A Analyst'));
  check('r2_12_two_digit_reference_checked', subject('Bewerbung als Key Account Manager, Kennziffer 99', jdOf('sl-de-contact'), 'Key Account Manager', 'de') === 'Bewerbung als Key Account Manager', subject('Bewerbung als Key Account Manager, Kennziffer 99', jdOf('sl-de-contact'), 'Key Account Manager', 'de'));
  check('r2_12_stated_reference_kept', subject('Application for Senior FP&A Analyst, Req #NW-4471', usAd, 'Senior FP&A Analyst').endsWith('#NW-4471'), '#NW-4471');

  // 13 and 14. One trim rule in JS and SQL; whitespace-only columns are empty.
  const NBSP = String.fromCharCode(0xa0);
  const BOM = String.fromCharCode(0xfeff);
  check('r2_13_js_trim_keeps_nbsp_and_bom', trimStoredText(`${NBSP}${BOM}Job ad\n \t`) === `${NBSP}${BOM}Job ad`, 'only space, tab, LF, CR stripped');
  check('r2_13_sql_trim_uses_the_same_set', /trim\(.*' ' \|\| char\(9\) \|\| char\(10\) \|\| char\(13\)\)/u.test(new SQLiteSyncDialect().sqlToQuery(sqlTrimStoredText(applicationSessions.job_description)).sql), 'trim(col, space tab LF CR)');
  const sqliteChecks = runSqliteChecks(NBSP, BOM);
  for (const [name, pass, detail] of sqliteChecks) check(name, pass, detail);

  // 15. Explicit undefined does not opt out of the reset; a value does.
  const reset = withRecipientReset({ job_description: 'New ad', company_address: undefined });
  check('r2_15_explicit_undefined_still_resets', typeof reset.company_address === 'object' && reset.company_address !== null, typeof reset.company_address);
  const explicit = withRecipientReset({ job_description: 'New ad', company_address: 'Hauptstraße 5' });
  check('r2_15_explicit_value_kept', explicit.company_address === 'Hauptstraße 5', String(explicit.company_address));
  check('r2_15_no_job_change_no_reset', !('company_address' in withRecipientReset({ status: 'applied' })), 'untouched');

  // --- PR #152 review round 3 ---------------------------------------------
  // 1. The submission fast path applies only when the phrase's object is the detail.
  const r3Probes: Array<[string, string[], string, Record<string, string>]> = [
    ['email_then_work_location', ['500 Main St', 'Austin, TX 78701'], 'To apply, send your CV to jobs@acme.com. Work location: 500 Main St, Austin, TX 78701', {}],
    ['email_then_einsatzort', ['Hauptstraße 99', '10115 Berlin'], 'Bitte senden Sie Ihre Bewerbung an bewerbung@acme.de. Einsatzort: Hauptstraße 99, 10115 Berlin', {}],
    ['sentence_then_einsatzort', ['Hauptstraße 99', '10115 Berlin'], 'Bewerbung an uns. Einsatzort beim Kunden: Hauptstraße 99, 10115 Berlin', {}],
    ['email_then_eeo_footer', ['500 Main St', 'Austin, TX 78701'], 'Send your resume to jobs@acme.com. We are an equal opportunity employer. Acme Inc., 500 Main St, Austin, TX 78701', { companyName: 'Acme Inc.' }],
    ['nicht_an_dritte_then_impressum', ['Hauptstraße 99', '10115 Berlin'], 'Ihre Unterlagen geben wir nicht an Dritte weiter. Impressum: Acme GmbH, Hauptstraße 99, 10115 Berlin', { companyName: 'Acme GmbH' }],
  ];
  for (const [name, lines, ad, anchors] of r3Probes) {
    const got = extractAdAddress(lines, ad, anchors);
    check(`r3_1_probe_${name}_rejected`, got.length === 0, got);
  }
  const contactProbes: Array<[string, string, string]> = [
    ['impressum_geschaeftsfuehrer', 'Dr. Klaus Brenner', 'Bewerbung an bewerbung@brenner.de. Impressum: Brenner Getriebe GmbH, Geschäftsführer: Dr. Klaus Brenner'],
    ['email_then_ceo', 'John Smith', 'Send your resume to jobs@acme.com. Our CEO, John Smith, founded the company in 2009.'],
  ];
  for (const [name, person, ad] of contactProbes) {
    const got = adContactPerson(ad, person, []);
    check(`r3_1_contact_probe_${name}_rejected`, got === undefined, String(got));
  }
  const legit = extractAdAddress(['Industriestraße 14', '90431 Nürnberg'], 'Bewerbungen richten Sie bitte an: Brenner Getriebe GmbH, Industriestraße 14, 90431 Nürnberg', { companyName: 'Brenner Getriebe GmbH' });
  check('r3_1_legit_bewerbungen_richten_sie_an_kept', same(legit, ['Industriestraße 14', '90431 Nürnberg']), legit);
  const abbreviationGap = extractAdAddress(['220 West Lake Street, Suite 1400', 'Chicago, IL 60606'], 'Please send your application to: Dr. Dana Whitfield, Northwind Freight Inc.\n220 West Lake Street, Suite 1400\nChicago, IL 60606', {});
  check('r3_1_abbreviations_are_not_sentence_breaks', same(abbreviationGap, ['220 West Lake Street, Suite 1400', 'Chicago, IL 60606']), abbreviationGap);
  check('r3_1_period_after_email_is_a_sentence_break', hasSentenceBoundary('an bewerbung@acme.de. Einsatzort'), 'bewerbung@acme.de.');
  check('r3_1_inc_and_z_b_are_not_sentence_breaks', !hasSentenceBoundary('Acme Inc. z. B. e.g. Dr. Brandl'), 'Inc. z. B. e.g. Dr.');
  check('r3_1_real_contact_still_kept', deRun({}).structured.recipient.contactPerson === 'Frau Melanie Brandl', String(deRun({}).structured.recipient.contactPerson));

  // 2. A titled correction needs the given name next to the title.
  const r3guard = (salutation: string, contactPerson: string, adText: string) => resolveSalutation({
    salutation, language: 'de', adText, contactPerson, companyNames: [], isBlacklisted: () => false, isPlaceholder: () => false,
  }).value;
  const otherBrandl = 'Bewerbung an Melanie Brandl, Personalabteilung. Herr Brandl, Geschäftsführer';
  check('r3_2_other_persons_title_not_borrowed', r3guard('Sehr geehrter Herr Brandl,', 'Melanie Brandl', otherBrandl) === 'Guten Tag Melanie Brandl,', r3guard('Sehr geehrter Herr Brandl,', 'Melanie Brandl', otherBrandl));
  const statedFrau = 'Bewerbung an Frau Melanie Brandl, Personalabteilung. Herr Brandl, Geschäftsführer';
  check('r3_2_stated_title_with_given_name_used', r3guard('Sehr geehrter Herr Brandl,', 'Melanie Brandl', statedFrau) === 'Sehr geehrte Frau Brandl,', r3guard('Sehr geehrter Herr Brandl,', 'Melanie Brandl', statedFrau));

  // 3. The greeting repeat check needs a whole word.
  const hi = coverLetterFromModelOutput(JSON.stringify({ ...us.answer, salutation: 'Hi', paragraphs: [`History shows that ${usParagraphs[0]}`, ...usParagraphs.slice(1)] }), us.context('en'), 'en');
  check('r3_3_history_after_hi_passes', hi.structured.paragraphs[0].startsWith('History shows'), hi.structured.salutation);

  // 4. Every occurrence of the address block is evaluated.
  const twice = 'Impressum: Acme GmbH, Hauptstraße 5, 10115 Berlin, Handelsregister HRB 1.\n\nBewerbungen richten Sie bitte an: Acme GmbH, Hauptstraße 5, 10115 Berlin';
  const second = extractAdAddress(['Hauptstraße 5', '10115 Berlin'], twice, { companyName: 'Acme GmbH' });
  check('r3_4_later_anchored_occurrence_accepted', same(second, ['Hauptstraße 5', '10115 Berlin']), second);
  const onlyFooter = extractAdAddress(['Hauptstraße 5', '10115 Berlin'], 'Impressum: Acme GmbH, Hauptstraße 5, 10115 Berlin, Handelsregister HRB 1.', { companyName: 'Acme GmbH' });
  check('r3_4_footer_only_occurrence_rejected', onlyFooter.length === 0, onlyFooter);

  // 5. More formats.
  const r3formats: Array<[string, string[], string]> = [
    ['paris_cedex', ['12 rue de Rivoli', '75001 Paris Cedex 01'], '12 rue de Rivoli\n75001 Paris Cedex 01'],
    ['halle_saale', ['Hansering 15', '06108 Halle (Saale)'], 'Hansering 15\n06108 Halle (Saale)'],
    ['san_francisco_no_comma', ['1234 Market Street', 'San Francisco CA 94103'], '1234 Market Street\nSan Francisco CA 94103'],
    ['new_york_no_comma', ['350 Fifth Avenue', 'New York NY 10001'], '350 Fifth Avenue\nNew York NY 10001'],
  ];
  for (const [name, lines, block] of r3formats) {
    const got = addr(lines, apply(block));
    check(`r3_5_format_${name}_kept`, same(got, lines), got);
  }

  // 7. The route's helpers: one narrow trim, whitespace-only means empty.
  check('r3_7_nbsp_edge_is_the_same_job', isSameStoredText(`${String.fromCharCode(0xa0)}Ad\n`, `${String.fromCharCode(0xa0)}Ad`), 'NBSP kept on both sides');
  check('r3_7_string_trim_would_differ', !isSameStoredText(`${String.fromCharCode(0xa0)}Ad`.trim(), `${String.fromCharCode(0xa0)}Ad`), 'String.trim() drops the NBSP');
  check('r3_7_whitespace_only_submission_is_empty', storedTextOrEmpty(` ${String.fromCharCode(0xa0)}\n`) === '', 'empty');

  // Replay: run 4's real model answers through today's post-model code. The
  // round 2 changes are code only, so each letter must come out as run 4 saved it.
  const RUN4 = path.join(RESULTS, 'recipient-rerun-3', 'letters');
  for (const id of ['sl-de-contact', 'sl-us-address', 'sl-fr-contact', 'syn-07']) {
    const saved = JSON.parse(fs.readFileSync(path.join(RUN4, `${id}.json`), 'utf8')) as Fixture & {
      language: SupportedLanguage;
      structured: { subject: string; salutation: string; closing: string; recipient: unknown; paragraphs: string[] };
    };
    const replay = coverLetterFromModelOutput(saved.raw_letter_outputs.at(-1)!, {
      sessionId: `replay-${id}`,
      jobDescription: jdOf(id),
      rawCV: cvOf(id),
      detectedLanguage: saved.language,
      applicant: saved.context.applicant,
      job: saved.context.job,
    }, saved.language).structured;
    const fields = (s: typeof saved.structured) => ({ subject: s.subject, salutation: s.salutation, closing: s.closing, recipient: s.recipient, paragraphs: s.paragraphs });
    check(`replay_run4_${id}_unchanged`, same(fields(replay), fields(saved.structured)), same(fields(replay), fields(saved.structured)) ? 'identical' : JSON.stringify(fields(replay)));
  }
}

/**
 * Items 13 and 14 (round 2) and item 7 (round 3) against real SQLite (D1 is
 * SQLite), with the exact SQL the code builds: the JD-change reset from
 * withRecipientReset and the fill condition from db/recipient-fill.ts, the
 * one persist-letter-recipient uses. Without a runnable sqlite3 these checks
 * FAIL (reported), they are never skipped.
 */
function runSqliteChecks(nbsp: string, bom: string): Array<[string, boolean, string]> {
  const dialect = new SQLiteSyncDialect();
  const inline = (query: { sql: string; params: unknown[] }) => {
    let i = 0;
    return query.sql.replace(/\?/gu, () => `'${String(query.params[i++]).replace(/'/gu, "''")}'`);
  };
  const storedJd = `${nbsp}${bom}The ad text\n`;
  const resetValues = withRecipientReset({ job_description: `${nbsp}${bom}The ad text` }) as Record<string, SQL>;
  const reset = inline(dialect.sqlToQuery(sql`update application_sessions set company_address = ${resetValues.company_address} where id = 'a'`));
  const changed = withRecipientReset({ job_description: 'Another ad' }) as Record<string, SQL>;
  const resetChanged = inline(dialect.sqlToQuery(sql`update application_sessions set company_address = ${changed.company_address} where id = 'b'`));
  const fillWhere = (id: string, jobDescription: string) => recipientFillCondition({ sessionId: id, userId: 'u', jobDescription, column: applicationSessions.company_address });
  const fill = inline(dialect.sqlToQuery(sql`update application_sessions set company_address = 'Filled' where ${fillWhere('c', storedJd)}`));
  // Round 3 item 7: the route's one JD for the run. A browser that sends the
  // ad without its edge NBSP/BOM is the same job, so the run uses the stored
  // string and the fill matches. (The old route's String.trim() made it a
  // different job and wrote the row, clearing the columns.)
  const submitted = storedTextOrEmpty(`${nbsp}${bom}The ad text`);
  const runJd = isSameStoredText(submitted, storedJd) ? storedJd : submitted;
  const fillRun = inline(dialect.sqlToQuery(sql`update application_sessions set company_address = 'Filled' where ${fillWhere('d', runJd)}`));
  const escape = (value: string) => value.replace(/'/gu, "''");
  const script = [
    'create table application_sessions (id text primary key, user_id text, job_description text, company_address text);',
    `insert into application_sessions values ('a', 'u', '${escape(storedJd)}', 'Saved 1'), ('b', 'u', '${escape(storedJd)}', 'Saved 2'), ('c', 'u', '${escape(storedJd)}', '  \t '), ('d', 'u', '${escape(storedJd)}', NULL);`,
    `${reset};`, `${resetChanged};`, `${fill};`, `${fillRun};`,
    "select id || '=' || coalesce(company_address, 'NULL') from application_sessions order by id;",
  ].join('\n');
  try {
    const out = execFileSync('sqlite3', [':memory:'], { input: script, encoding: 'utf8' }).trim().split('\n');
    return [
      ['r2_13_sqlite_nbsp_bom_jd_same_job_keeps_columns', out[0] === 'a=Saved 1', out[0]],
      ['r2_13_sqlite_changed_jd_clears_columns', out[1] === 'b=NULL', out[1]],
      ['r2_14_sqlite_whitespace_only_column_filled_on_nbsp_jd', out[2] === 'c=Filled', out[2]],
      ['r3_7_sqlite_run_jd_from_route_helpers_fills', out[3] === 'd=Filled', out[3]],
    ];
  } catch (error) {
    return [['sqlite3_runnable', false, `sqlite3 not runnable: ${(error as Error).message}`]];
  }
}

const failed = checks.filter((c) => !c.pass);
// No timestamp: the committed file changes only when a check does.
fs.writeFileSync(path.join(RESULTS, 'offline-checks.json'), JSON.stringify({ total: checks.length, failed: failed.length, checks }, null, 1) + '\n');
for (const c of checks) console.log(`${c.pass ? 'pass' : 'FAIL'} ${c.name}: ${c.detail}`);
console.log(`${checks.length - failed.length}/${checks.length} offline checks pass`);
if (failed.length > 0) process.exit(1);

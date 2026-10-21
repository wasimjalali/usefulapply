/**
 * Adversarial cases for the model claim check (2026-10-21), written before the
 * first scored run. Each one builds a claim the CV doesn't make out of mostly
 * ordinary words, so the word guard can't see the claim in any single word and
 * the model has to read the phrase: ownership, supervision, authorship, equity,
 * scope, tenure, award, publication, certification and fluency, two each in
 * English and in German.
 *
 * German nouns are capitalised, and a capital mid-sentence is refused without
 * the model, so the German cases use lowercase verbs, adjectives and adverbs:
 * a capitalised noun would make the case trivially caught.
 *
 * `claim` lists the words that carry the claim (claimWords() keys). A case is
 * caught when the check refuses at least one of them. When the word guard on
 * main flags none of them, main misses the case too, and the model never sees
 * it (it only judges flagged words): those are reported as misses of both.
 */

export interface AdversarialCase {
  id: string;
  language: 'en' | 'de';
  category: 'ownership' | 'supervision' | 'authorship' | 'equity' | 'scope' | 'tenure' | 'award' | 'publication' | 'certification' | 'fluency';
  kind: 'summary';
  source: string;
  before: string;
  after: string;
  claim: string[];
}

export const EN_CV = [
  'Maya Torres',
  'Operations Coordinator, Brightline Logistics, Hamburg (2021-2024)',
  '- Scheduled inbound deliveries for a warehouse team of 12 and kept the dock calendar current.',
  '- Wrote weekly reports on late deliveries for the operations manager.',
  '- Helped move the team from paper forms to a shared spreadsheet.',
  'Customer Service Assistant, Northwind Retail (2019-2021)',
  '- Answered customer emails and phone calls about orders and returns.',
  'Education: BA in Business Administration, University of Bremen (2019)',
  'Languages: English (native), German (B1)',
].join('\n');
const EN_BEFORE = 'Operations coordinator who scheduled inbound deliveries for a warehouse team and wrote weekly reports on late deliveries.';
const EN_STEM = 'Operations coordinator who scheduled inbound deliveries for a warehouse team';

export const DE_CV = [
  'Jonas Weber',
  'Sachbearbeiter Einkauf, Kranich Maschinenbau GmbH, Stuttgart (2020-2024)',
  '- Bestellungen für Ersatzteile angelegt und Liefertermine mit Lieferanten abgestimmt.',
  '- Monatliche Übersicht über offene Bestellungen für die Abteilungsleitung erstellt.',
  '- Bei der Einführung eines neuen ERP-Moduls im Team mitgearbeitet.',
  'Kaufmännischer Assistent, Bäckerei Sonnenschein (2018-2020)',
  '- Rechnungen geprüft und Kundenanfragen am Telefon beantwortet.',
  'Ausbildung: Industriekaufmann (IHK), 2018',
  'Sprachen: Deutsch (Muttersprache), Englisch (B1)',
].join('\n');
const DE_BEFORE = 'Sachbearbeiter im Einkauf, der Bestellungen für Ersatzteile anlegt und Liefertermine mit Lieferanten abstimmt.';
const DE_STEM = 'Sachbearbeiter im Einkauf, der Bestellungen für Ersatzteile anlegt';

type Row = [AdversarialCase['category'], string, string[]];

const EN: Row[] = [
  ['ownership', `${EN_STEM} and took over the dock calendar when the manager left.`, ['took', 'left']],
  ['ownership', `${EN_STEM}. The dock calendar was mine alone.`, ['alone']],
  ['supervision', `${EN_STEM} of 12 who reported to me.`, ['reported']],
  ['supervision', `${EN_STEM}, and the warehouse crew answered to me.`, ['crew']],
  ['authorship', `${EN_STEM} and wrote the playbook behind the move from paper forms to a shared spreadsheet.`, ['playbook', 'behind']],
  ['authorship', `${EN_STEM} and moved the team to a shared spreadsheet I came up with myself.`, ['came', 'myself']],
  ['equity', `${EN_STEM} as one of the people with a stake in the company.`, ['stake']],
  ['equity', `${EN_STEM} and later bought into the business.`, ['bought']],
  ['scope', `${EN_STEM} for every warehouse in the group across the country.`, ['group', 'country']],
  ['scope', `${EN_STEM} and set the delivery schedule for all sites.`, ['sites']],
  ['tenure', `${EN_STEM} after a long career in logistics.`, ['career']],
  ['tenure', `${EN_STEM} and has spent most of her working life in warehouses.`, ['spent', 'life']],
  ['award', `${EN_STEM}. Named employee of the year for the move to a shared spreadsheet.`, ['named', 'employee']],
  ['award', `${EN_STEM} and won a company prize for the move to a shared spreadsheet.`, ['won', 'prize']],
  ['publication', `${EN_STEM} and wrote up the move to a shared spreadsheet for a trade magazine.`, ['trade', 'magazine']],
  ['publication', `${EN_STEM}. Weekly reports on late deliveries later appeared in print.`, ['appeared', 'print']],
  ['certification', `${EN_STEM} and passed the forklift exam.`, ['passed', 'forklift', 'exam']],
  ['certification', `${EN_STEM} and holds a valid licence for hazardous goods.`, ['holds', 'valid', 'licence', 'hazardous', 'goods']],
  ['fluency', `${EN_STEM} and handles calls in German without trouble.`, ['without', 'trouble']],
  ['fluency', `${EN_STEM}, speaking German like a local.`, ['speaking', 'local']],
];

const DE: Row[] = [
  ['ownership', `${DE_STEM} und Liefertermine allein verantwortet.`, ['allein', 'verantwortet']],
  ['ownership', `${DE_STEM} und über die Bestellungen selbst entscheidet.`, ['selbst', 'entscheidet']],
  ['supervision', `${DE_STEM} und dem das Team im Einkauf zuarbeitete.`, ['zuarbeitete']],
  ['supervision', `${DE_STEM} und das Team im Einkauf anleitete.`, ['anleitete']],
  ['authorship', `${DE_STEM} und das neue ERP-Modul entworfen hat.`, ['entworfen']],
  ['authorship', `${DE_STEM} und die monatliche Übersicht selbst entwickelt hat.`, ['selbst', 'entwickelt']],
  ['equity', `${DE_STEM} und selbst mitbeteiligt ist.`, ['mitbeteiligt', 'selbst']],
  ['equity', `${DE_STEM} und inzwischen finanziell mit eingestiegen ist.`, ['eingestiegen', 'finanziell']],
  ['scope', `${DE_STEM} und Liefertermine konzernübergreifend abstimmt.`, ['konzernuebergreifend']],
  ['scope', `${DE_STEM} und Liefertermine länderübergreifend abstimmt.`, ['laenderuebergreifend']],
  ['tenure', `${DE_STEM} und schon lange im Einkauf arbeitet.`, ['lange', 'schon']],
  ['tenure', `${DE_STEM} und im Einkauf längst zuhause ist.`, ['laengst', 'zuhause']],
  ['award', `${DE_STEM} und dafür ausgezeichnet wurde.`, ['ausgezeichnet']],
  ['award', `${DE_STEM} und dafür gelobt und prämiert wurde.`, ['praemiert', 'gelobt']],
  ['publication', `${DE_STEM} und darüber veröffentlicht hat.`, ['veroeffentlicht']],
  ['publication', `${DE_STEM}. Die monatliche Übersicht erschien gedruckt.`, ['erschien', 'gedruckt']],
  ['certification', `${DE_STEM} und staatlich geprüft ist.`, ['staatlich']],
  ['certification', `${DE_STEM} und ausbildungsberechtigt ist.`, ['ausbildungsberechtigt']],
  ['fluency', `${DE_STEM} und auf Englisch mühelos verhandelt.`, ['muehelos', 'verhandelt']],
  ['fluency', `${DE_STEM} und Englisch fließend spricht.`, ['fliessend', 'spricht']],
];

export const ADVERSARIAL: AdversarialCase[] = [
  ...EN.map(([category, after, claim], i): AdversarialCase => ({
    id: `adv-en-${String(i + 1).padStart(2, '0')}`, language: 'en', category, kind: 'summary', source: EN_CV, before: EN_BEFORE, after, claim,
  })),
  ...DE.map(([category, after, claim], i): AdversarialCase => ({
    id: `adv-de-${String(i + 1).padStart(2, '0')}`, language: 'de', category, kind: 'summary', source: DE_CV, before: DE_BEFORE, after, claim,
  })),
];

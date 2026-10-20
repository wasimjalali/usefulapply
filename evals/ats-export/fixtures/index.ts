/**
 * Fixtures for the ATS export eval. All people, employers and contact details
 * are invented. The portrait is a synthetic silhouette, not a real photo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CVData } from '../../../src/lib/cv-templates/types';
import type { StructuredCoverLetter } from '../../../src/lib/cover-letter/contract';

const portrait = `data:image/jpeg;base64,${readFileSync(join(__dirname, 'portrait.jpg')).toString('base64')}`;

let counter = 0;
const id = () => `fx-${++counter}`;

function job(
  position: string,
  company: string,
  location: string,
  startDate: string,
  endDate: string | undefined,
  bullets: string[],
  current = false,
) {
  return { id: id(), position, company, location, startDate, endDate, current, bullets };
}

/** A one-page US CV: three roles, four skill groups. */
export const US_ONE_PAGE: CVData = {
  language: 'en',
  personal: {
    fullName: 'Jordan Ellis',
    email: 'jordan.ellis@example.com',
    phone: '+1 (415) 555-0142',
    currentTitle: 'Senior Backend Engineer',
    city: 'Austin',
    country: 'United States',
    linkedIn: 'https://www.linkedin.com/in/jordan-ellis-example',
    github: 'https://github.com/jordan-ellis-example',
  },
  summary:
    'Backend engineer with 9 years of experience building payment and logistics platforms in Go and Python. Cut p99 latency by 38% at Northwind Freight and led a team of five through a zero-downtime migration to Kubernetes.',
  experience: [
    job('Senior Backend Engineer', 'Northwind Freight', 'Austin, TX', 'Mar 2022', undefined, [
      'Led a five-engineer team that moved 40 services to Kubernetes with zero customer-facing downtime.',
      'Cut p99 API latency by 38% by redesigning the shipment-tracking cache layer in Go.',
    ], true),
    job('Backend Engineer', 'Lumen Payments', 'San Francisco, CA', 'Jun 2018', 'Feb 2022', [
      'Built the ledger service that processes 2.4 million transactions a day with exactly-once semantics.',
      'Reduced chargeback investigation time from 3 days to 4 hours with an internal reconciliation tool.',
    ]),
    job('Software Engineer', 'Brightpath Analytics', 'Denver, CO', 'Aug 2015', 'May 2018', [
      'Developed ETL pipelines in Python that ingested 800 GB of sensor data per day.',
      'Wrote the on-call runbooks that cut mean time to recovery from 55 to 21 minutes.',
    ]),
  ],
  education: [
    { id: id(), institution: 'University of Texas at Austin', degree: 'B.S.', field: 'Computer Science', startDate: '2011', endDate: 'May 2015' },
  ],
  skills: [
    { category: 'Languages', items: ['Go', 'Python', 'SQL', 'TypeScript'] },
    { category: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'AWS', 'Docker'] },
    { category: 'Data', items: ['PostgreSQL', 'Redis', 'Kafka', 'ClickHouse'] },
  ],
  languages: [{ language: 'English', proficiency: 'Native' }, { language: 'Spanish', proficiency: 'Professional working' }],
  certifications: [
    { id: id(), name: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2022' },
  ],
};

/** A two-page German CV: umlauts, a photo, long entries, MM/YYYY dates. */
export const DE_TWO_PAGE: CVData = {
  language: 'de',
  personal: {
    fullName: 'Jürgen Müller-Schäfer',
    email: 'juergen.mueller-schaefer@example.de',
    phone: '+49 151 2345 6789',
    currentTitle: 'Leiter Softwareentwicklung',
    address: 'Lindenallee 14',
    city: '80331 München',
    country: 'Deutschland',
    linkedIn: 'https://www.linkedin.com/in/juergen-mueller-schaefer-example',
    dateOfBirth: '12.03.1986',
    nationality: 'deutsch',
    photoUrl: portrait,
  },
  summary:
    'Leiter Softwareentwicklung mit 14 Jahren Erfahrung in der Automobil- und Logistikbranche. Verantwortlich für die Einführung einer Cloud-Plattform für über 3.000 Fahrzeuge, die Führung von 22 Mitarbeitenden und die Senkung der Betriebskosten um 27 Prozent. Starke Fähigkeiten in Architektur, Zusammenarbeit zwischen Fachbereichen und agiler Transformation.',
  experience: [
    job('Leiter Softwareentwicklung', 'Bayerische Fahrzeugwerke AG', 'München', '04/2019', undefined, [
      'Aufbau und Führung eines Teams von 22 Entwicklerinnen und Entwicklern an drei Standorten in Süddeutschland.',
      'Einführung einer Cloud-Plattform für die Flottenüberwachung von über 3.000 Fahrzeugen, Betriebskosten um 27 Prozent gesenkt.',
      'Verantwortung für ein jährliches Budget von 4,8 Millionen Euro und die Zusammenarbeit mit Einkauf, Recht und Datenschutz.',
      'Umstellung von Wasserfall auf agile Methoden: Releasezyklus von 6 Monaten auf 3 Wochen verkürzt.',
      'Zusammenarbeit mit dem Betriebsrat bei der Einführung neuer Arbeitszeitmodelle für Schichtbetrieb im Rechenzentrum.',
    ], true),
    job('Teamleiter Backend-Entwicklung', 'Süddeutsche Logistik GmbH', 'Augsburg', '09/2014', '03/2019', [
      'Leitung von acht Entwicklern, Verantwortung für die Auftragsverwaltung mit täglich 120.000 Sendungen.',
      'Migration der Monolith-Anwendung auf Microservices unter Beibehaltung der Verfügbarkeit von 99,95 Prozent.',
      'Einführung von Codereviews und automatisierten Tests, Fehlerquote in der Produktion um 44 Prozent reduziert.',
      'Betreuung von sechs Werkstudierenden und zwei Auszubildenden, davon vier in Festanstellung übernommen.',
    ]),
    job('Softwareentwickler', 'Alpen Systemhaus GmbH', 'Rosenheim', '10/2010', '08/2014', [
      'Entwicklung von Java-Anwendungen für Maschinenbau-Kunden in Bayern und Österreich.',
      'Anbindung von SAP-Schnittstellen und Erstellung der technischen Dokumentation nach ISO 9001.',
      'Schulung von Anwenderinnen und Anwendern vor Ort bei Kunden in Salzburg und Innsbruck.',
    ]),
  ],
  education: [
    { id: id(), institution: 'Technische Universität München', degree: 'Diplom-Informatiker', field: 'Informatik', startDate: '10/2004', endDate: '09/2010', grade: '1,7' },
    { id: id(), institution: 'Staatliches Gymnasium Rosenheim', degree: 'Abitur', startDate: '09/1996', endDate: '07/2004', grade: '1,9' },
  ],
  skills: [
    { category: 'Führung', items: ['Teamführung', 'Budgetverantwortung', 'Agile Transformation', 'Stakeholder-Management'] },
    { category: 'Technologien', items: ['Java', 'Kotlin', 'Kubernetes', 'PostgreSQL', 'Apache Kafka'] },
    { category: 'Methoden', items: ['Scrum', 'Kanban', 'Domain-driven Design', 'Continuous Delivery'] },
    { category: 'Branchenwissen', items: ['Automobilindustrie', 'Logistik', 'ISO 9001', 'DSGVO'] },
  ],
  languages: [
    { language: 'Deutsch', proficiency: 'Muttersprache' },
    { language: 'Englisch', proficiency: 'C1 (verhandlungssicher)' },
    { language: 'Französisch', proficiency: 'B1' },
  ],
  certifications: [
    { id: id(), name: 'Certified Scrum Professional', issuer: 'Scrum Alliance', date: '2018' },
    { id: id(), name: 'TOGAF 9 Zertifizierung', issuer: 'The Open Group', date: '2020' },
  ],
  signature: { city: 'München', date: '20.10.2026', includeSignature: true },
};

function manySkills(): CVData['skills'] {
  const groups = [
    'Languages', 'Frameworks', 'Cloud', 'Databases', 'Testing', 'DevOps', 'Security', 'Leadership', 'Domain Knowledge',
  ];
  return groups.map((category, g) => ({
    category,
    items: Array.from({ length: 12 }, (_, i) => `${category} Skill ${String.fromCharCode(65 + g)}${i + 1}`),
  }));
}

/** More skill groups and skills per group than any old template cap allowed. */
export const OVER_CAP: CVData = {
  ...US_ONE_PAGE,
  skills: manySkills(),
};

/** One experience entry that is longer than a page. */
export const LONG_ENTRY: CVData = {
  ...US_ONE_PAGE,
  experience: [
    job(
      'Principal Engineer',
      'Atlas Infrastructure Group',
      'Remote',
      'Jan 2010',
      undefined,
      Array.from({ length: 48 }, (_, i) =>
        `Delivered platform initiative ${i + 1}: owned scoping, rollout and on-call handover for the ${['billing', 'identity', 'search', 'notifications', 'reporting', 'ingestion'][i % 6]} stack, with measurable ${['latency', 'cost', 'reliability'][i % 3]} gains across ${10 + i} regions and ${3 + (i % 5)} customer segments.`,
      ),
      true,
    ),
    US_ONE_PAGE.experience[1],
  ],
};

export const US_LETTER: StructuredCoverLetter = {
  version: 2,
  language: 'en',
  market: 'us',
  sender: {
    name: 'Jordan Ellis',
    addressLines: ['1204 Congress Avenue', 'Austin, TX 78701'],
    phone: '+1 (415) 555-0142',
    email: 'jordan.ellis@example.com',
    links: ['linkedin.com/in/jordan-ellis-example'],
  },
  recipient: {
    companyName: 'Harbor Freight Technologies',
    contactPerson: 'Priya Raman',
    department: 'Engineering Hiring',
    addressLines: ['500 Market Street, Suite 1200', 'San Francisco, CA 94105'],
  },
  date: 'October 20, 2026',
  subject: 'Senior Backend Engineer, Requisition 4821',
  salutation: 'Dear Ms. Raman,',
  paragraphs: [
    'I am applying for the Senior Backend Engineer role on your logistics platform team. At Northwind Freight I cut p99 API latency by 38% and led a five-engineer team through a zero-downtime Kubernetes migration, which is close to the work described in your posting.',
    'At Lumen Payments I built the ledger service that processes 2.4 million transactions a day with exactly-once semantics. That experience with correctness under load is what I would bring to your shipment-tracking systems.',
    'I would welcome a conversation about how my background fits your roadmap. Thank you for your time and consideration.',
  ],
  closing: 'Sincerely,',
  signatureName: 'Jordan Ellis',
};

export const DIN_LETTER: StructuredCoverLetter = {
  version: 2,
  language: 'de',
  market: 'dach',
  sender: {
    name: 'Jürgen Müller-Schäfer',
    addressLines: ['Lindenallee 14', '80331 München'],
    phone: '+49 151 2345 6789',
    email: 'juergen.mueller-schaefer@example.de',
  },
  recipient: {
    companyName: 'Hanseatische Mobilität GmbH',
    contactPerson: 'Frau Dr. Katrin Böhm',
    department: 'Personalabteilung',
    addressLines: ['Speicherstraße 7', '20457 Hamburg'],
  },
  place: 'München',
  date: '20. Oktober 2026',
  subject: 'Bewerbung als Leiter Softwareentwicklung (m/w/d), Kennziffer 2026-114',
  salutation: 'Sehr geehrte Frau Dr. Böhm,',
  paragraphs: [
    'mit großem Interesse habe ich Ihre Ausschreibung für die Leitung der Softwareentwicklung gelesen. In meiner aktuellen Position bei der Bayerischen Fahrzeugwerke AG führe ich ein Team von 22 Entwicklerinnen und Entwicklern und verantworte ein Budget von 4,8 Millionen Euro.',
    'Zu meinen größten Erfolgen zählt die Einführung einer Cloud-Plattform für über 3.000 Fahrzeuge, durch die wir die Betriebskosten um 27 Prozent senken konnten. Die Umstellung von Wasserfall auf agile Methoden hat den Releasezyklus von sechs Monaten auf drei Wochen verkürzt.',
    'Gern überzeuge ich Sie in einem persönlichen Gespräch von meiner Eignung. Über eine Einladung freue ich mich sehr.',
  ],
  closing: 'Mit freundlichen Grüßen',
  signatureName: 'Jürgen Müller-Schäfer',
};

export interface CvFixture {
  name: string;
  data: CVData;
  /** Page count the US templates must hit, when the fixture is built to a size. */
  expectedUsPages?: number;
}

export const CV_FIXTURES: CvFixture[] = [
  { name: 'us-one-page', data: US_ONE_PAGE, expectedUsPages: 1 },
  { name: 'de-two-page', data: DE_TWO_PAGE },
  { name: 'over-cap', data: OVER_CAP },
  { name: 'long-entry', data: LONG_ENTRY },
];

export const TEMPLATE_IDS = [
  'premium-ats',
  'modern-professional',
  'executive',
  'german-ats',
  'german-classic',
  'classic-green',
] as const;

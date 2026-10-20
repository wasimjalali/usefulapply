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
    'Backend engineer with 9 years of experience building payment and logistics platforms in Go and Python. Led a team of five through a zero-downtime migration to Kubernetes.',
  experience: [
    job('Senior Backend Engineer', 'Northwind Freight', 'Austin, TX', 'Mar 2022', undefined, [
      'Led a five-engineer team that moved 40 services to Kubernetes with zero customer-facing downtime.',
      'Cut p99 API latency by 38% by redesigning the shipment-tracking cache layer in Go.',
    ], true),
    job('Backend Engineer', 'Lumen Payments', 'San Francisco, CA', 'Jun 2018', 'Feb 2022', [
      'Built the ledger service that processes 2.4 million transactions a day with exactly-once semantics.',
      'Cut chargeback review from 3 days to 4 hours with an efficient office workflow tool.',
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
    { category: 'Backend', items: ['Go', 'Python', 'SQL', 'TypeScript', 'PostgreSQL', 'Kafka'] },
    { category: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'AWS', 'Docker'] },
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

/**
 * A US CV that carries a date of birth and a nationality and every link kind,
 * with the noise real links have (www, a tracking query, a trailing slash).
 * Only a DACH template may print the date of birth and the nationality.
 */
export const US_PERSONAL: CVData = {
  ...US_ONE_PAGE,
  personal: {
    ...US_ONE_PAGE.personal,
    dateOfBirth: '07.04.1989',
    nationality: 'American',
    website: 'https://www.jordan-ellis.example/?utm_source=cv&utm_medium=pdf',
    // Longer than the 48 characters a link shows: the text is cut with an ellipsis, the link opens the whole address.
    portfolio: 'https://portfolio.jordan-ellis.example/work/selected-case-studies-2020-2026/payments-platform-migration',
  },
};

/**
 * Text that would break an HTML page if it were ever treated as markup. Every
 * string must come out of the PDF text layer exactly as typed, and nothing may
 * be fetched from the network.
 */
export const HOSTILE_TEXT = {
  summary: 'Builds parsers. </title><script>window.__pwned=1</script> stays text, and so does <b>this</b> & that.',
  bulletScript: 'Fixed a template bug where </style><script>document.title="x"</script> ran inside a bullet.',
  bulletImage: 'Blocked <img src="https://www.cloudflare.com/img/logo-web-badges/cf-logo-on-white-bg.svg"> and <iframe src="https://example.com/frame"></iframe> in user text.',
  company: 'Tag <i>Soup</i> & "Quotes" Co',
};

export const HOSTILE: CVData = {
  ...US_ONE_PAGE,
  summary: HOSTILE_TEXT.summary,
  experience: [
    job('Platform Engineer', HOSTILE_TEXT.company, 'Remote', 'Jan 2020', undefined, [HOSTILE_TEXT.bulletScript, HOSTILE_TEXT.bulletImage], true),
    US_ONE_PAGE.experience[1],
  ],
};

/** A French CV: it must not get German dates, headings or footers, and prints on A4. */
export const FR_ONE_PAGE: CVData = {
  language: 'fr',
  personal: {
    fullName: 'Camille Lefèvre',
    email: 'camille.lefevre@example.fr',
    phone: '+33 6 12 34 56 78',
    currentTitle: 'Ingénieure logicielle senior',
    city: 'Lyon',
    country: 'France',
    linkedIn: 'https://www.linkedin.com/in/camille-lefevre-example',
  },
  summary: 'Ingénieure logicielle avec huit ans d’expérience dans la logistique et les paiements. A dirigé la migration de quarante services vers Kubernetes sans interruption.',
  experience: [
    job('Ingénieure logicielle senior', 'Transports Rhône-Alpes', 'Lyon', '03/2021', undefined, [
      'Direction d’une équipe de cinq ingénieurs pour la migration de quarante services vers Kubernetes.',
      'Réduction de la latence p99 de 38 % grâce à une refonte du cache de suivi des expéditions.',
    ], true),
    job('Ingénieure logicielle', 'Banque Lumière', 'Paris', '09/2016', '02/2021', [
      'Conception du service de grand livre traitant deux millions de transactions par jour.',
      'Réduction du délai de traitement des litiges de trois jours à quatre heures.',
    ]),
  ],
  education: [{ id: id(), institution: 'INSA Lyon', degree: 'Diplôme d’ingénieur', field: 'Informatique', startDate: '2011', endDate: '2016' }],
  skills: [
    { category: 'Langages', items: ['Go', 'Python', 'SQL', 'TypeScript'] },
    { category: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'AWS'] },
  ],
  languages: [{ language: 'Français', proficiency: 'Langue maternelle' }, { language: 'Anglais', proficiency: 'Courant' }],
  certifications: [{ id: id(), name: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2022' }],
};

function localized(language: string, base: Omit<CVData, 'language' | 'certifications' | 'projects'> & { certName: string }): CVData {
  const { certName, ...rest } = base;
  return { ...rest, language, certifications: [{ id: id(), name: certName, issuer: 'CNCF', date: '2022' }] } as CVData;
}

/** Spanish, Italian, Dutch and Portuguese CVs: every heading, the present label and the degree connector in their own language. */
export const ES_ONE_PAGE: CVData = localized('es', {
  personal: { fullName: 'Lucía Fernández Ortega', email: 'lucia.fernandez@example.es', phone: '+34 612 345 678', currentTitle: 'Ingeniera de software sénior', city: 'Valencia', country: 'España', linkedIn: 'https://www.linkedin.com/in/lucia-fernandez-example' },
  summary: 'Ingeniera de software con ocho años de experiencia en logística y pagos. Dirigió la migración de cuarenta servicios a Kubernetes sin interrupciones.',
  experience: [
    job('Ingeniera de software sénior', 'Transportes Levante', 'Valencia', '03/2021', undefined, ['Dirigió un equipo de cinco ingenieros en la migración de cuarenta servicios a Kubernetes.', 'Redujo la latencia p99 un 38 % rediseñando la caché de seguimiento de envíos.'], true),
    job('Ingeniera de software', 'Banco Mediterráneo', 'Madrid', '09/2016', '02/2021', ['Diseñó el servicio de libro mayor que procesa dos millones de transacciones al día.', 'Redujo el tiempo de resolución de disputas de tres días a cuatro horas.']),
  ],
  education: [{ id: id(), institution: 'Universidad Politécnica de Valencia', degree: 'Grado en Ingeniería', field: 'Informática', startDate: '2011', endDate: '2016' }],
  skills: [{ category: 'Lenguajes', items: ['Go', 'Python', 'SQL', 'TypeScript'] }, { category: 'Infraestructura', items: ['Kubernetes', 'Terraform', 'AWS'] }],
  languages: [{ language: 'Español', proficiency: 'Nativo' }, { language: 'Inglés', proficiency: 'C1' }],
  certName: 'Administrador certificado de Kubernetes',
});

export const IT_ONE_PAGE: CVData = localized('it', {
  personal: { fullName: 'Giulia Moretti', email: 'giulia.moretti@example.it', phone: '+39 347 123 4567', currentTitle: 'Ingegnera del software senior', city: 'Torino', country: 'Italia', linkedIn: 'https://www.linkedin.com/in/giulia-moretti-example' },
  summary: 'Ingegnera del software con otto anni di esperienza nella logistica e nei pagamenti. Ha guidato la migrazione di quaranta servizi su Kubernetes senza interruzioni.',
  experience: [
    job('Ingegnera del software senior', 'Trasporti Piemonte', 'Torino', '03/2021', undefined, ['Ha guidato un team di cinque ingegneri nella migrazione di quaranta servizi su Kubernetes.', 'Ha ridotto la latenza p99 del 38 % riprogettando la cache di tracciamento delle spedizioni.'], true),
    job('Ingegnera del software', 'Banca Adriatica', 'Milano', '09/2016', '02/2021', ['Ha progettato il servizio di contabilità che elabora due milioni di transazioni al giorno.', 'Ha ridotto i tempi di gestione delle contestazioni da tre giorni a quattro ore.']),
  ],
  education: [{ id: id(), institution: 'Politecnico di Torino', degree: 'Laurea magistrale', field: 'Ingegneria informatica', startDate: '2011', endDate: '2016' }],
  skills: [{ category: 'Linguaggi', items: ['Go', 'Python', 'SQL', 'TypeScript'] }, { category: 'Infrastruttura', items: ['Kubernetes', 'Terraform', 'AWS'] }],
  languages: [{ language: 'Italiano', proficiency: 'Madrelingua' }, { language: 'Inglese', proficiency: 'C1' }],
  certName: 'Amministratore Kubernetes certificato',
});

export const NL_ONE_PAGE: CVData = localized('nl', {
  personal: { fullName: 'Sanne de Vries', email: 'sanne.devries@example.nl', phone: '+31 6 1234 5678', currentTitle: 'Senior software engineer', city: 'Utrecht', country: 'Nederland', linkedIn: 'https://www.linkedin.com/in/sanne-de-vries-example' },
  summary: 'Software engineer met acht jaar ervaring in logistiek en betalingen. Leidde de migratie van veertig services naar Kubernetes zonder downtime.',
  experience: [
    job('Senior software engineer', 'Transport Midden-Nederland', 'Utrecht', '03/2021', undefined, ['Leidde een team van vijf engineers bij de migratie van veertig services naar Kubernetes.', 'Verlaagde de p99-latentie met 38 % door de cache voor zendingen te herontwerpen.'], true),
    job('Software engineer', 'Hollandse Bank', 'Amsterdam', '09/2016', '02/2021', ['Ontwierp de grootboekservice die twee miljoen transacties per dag verwerkt.', 'Bracht de afhandeltijd van geschillen terug van drie dagen naar vier uur.']),
  ],
  education: [{ id: id(), institution: 'Technische Universiteit Delft', degree: 'Master', field: 'Informatica', startDate: '2011', endDate: '2016' }],
  skills: [{ category: 'Talen', items: ['Go', 'Python', 'SQL', 'TypeScript'] }, { category: 'Infrastructuur', items: ['Kubernetes', 'Terraform', 'AWS'] }],
  languages: [{ language: 'Nederlands', proficiency: 'Moedertaal' }, { language: 'Engels', proficiency: 'C1' }],
  certName: 'Gecertificeerd Kubernetes-beheerder',
});

export const PT_ONE_PAGE: CVData = localized('pt', {
  personal: { fullName: 'Inês Carvalho', email: 'ines.carvalho@example.pt', phone: '+351 912 345 678', currentTitle: 'Engenheira de software sénior', city: 'Porto', country: 'Portugal', linkedIn: 'https://www.linkedin.com/in/ines-carvalho-example' },
  summary: 'Engenheira de software com oito anos de experiência em logística e pagamentos. Liderou a migração de quarenta serviços para o Kubernetes sem interrupções.',
  experience: [
    job('Engenheira de software sénior', 'Transportes do Norte', 'Porto', '03/2021', undefined, ['Liderou uma equipa de cinco engenheiros na migração de quarenta serviços para o Kubernetes.', 'Reduziu a latência p99 em 38 % ao redesenhar a cache de seguimento de envios.'], true),
    job('Engenheira de software', 'Banco Atlântico', 'Lisboa', '09/2016', '02/2021', ['Desenhou o serviço de contabilidade que processa dois milhões de transações por dia.', 'Reduziu o tempo de resolução de disputas de três dias para quatro horas.']),
  ],
  education: [{ id: id(), institution: 'Universidade do Porto', degree: 'Mestrado', field: 'Engenharia Informática', startDate: '2011', endDate: '2016' }],
  skills: [{ category: 'Linguagens', items: ['Go', 'Python', 'SQL', 'TypeScript'] }, { category: 'Infraestrutura', items: ['Kubernetes', 'Terraform', 'AWS'] }],
  languages: [{ language: 'Português', proficiency: 'Língua materna' }, { language: 'Inglês', proficiency: 'C1' }],
  certName: 'Administrador Kubernetes certificado',
});

/** A French CV long enough for a second page: the footer and the localized text on every page. */
export const FR_TWO_PAGE: CVData = {
  ...FR_ONE_PAGE,
  experience: [
    job('Ingénieure logicielle senior', 'Transports Rhône-Alpes', 'Lyon', '03/2021', undefined,
      Array.from({ length: 14 }, (_, i) => `Mise en production de la livraison ${i + 1} : pilotage du périmètre, de la recette et de la reprise d’astreinte pour la plateforme ${['facturation', 'identité', 'recherche'][i % 3]}, avec des gains mesurés sur ${10 + i} régions.`), true),
    ...FR_ONE_PAGE.experience.slice(1),
  ],
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

/** A US-layout letter written in English by an applicant whose CV is German: the file name, title, metadata and lang follow the letter. */
export const US_LETTER_ON_GERMAN_CV: StructuredCoverLetter = {
  ...US_LETTER,
  sender: { ...US_LETTER.sender, name: 'Jürgen Müller-Schäfer', email: 'juergen.mueller-schaefer@example.de', phone: '+49 151 2345 6789', addressLines: ['Lindenallee 14', '80331 München'] },
  signatureName: 'Jürgen Müller-Schäfer',
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

/** A sender block of nine lines: the letterhead has to reflow instead of printing over the address field. */
export const DIN_LETTER_LONG_SENDER: StructuredCoverLetter = {
  ...DIN_LETTER,
  sender: {
    ...DIN_LETTER.sender,
    addressLines: ['Dr.-Ing. Jürgen Müller-Schäfer', 'Leiter Softwareentwicklung', 'c/o Bayerische Fahrzeugwerke AG', 'Abteilung Plattform und Betrieb', 'Gebäude 7, Etage 3', 'Lindenallee 14', '80331 München', 'Deutschland'],
    links: ['linkedin.com/in/juergen-mueller-schaefer-example', 'https://www.github.com/juergen-example', 'juergen-example.de'],
  },
};

/**
 * What a CV in another language must print, written by hand (not read back from the locale tables under
 * test): the six headings, the label for an open-ended role and the connector between degree and field.
 */
/** A French cover letter: the file name, PDF title and /Lang are French. */
export const FR_LETTER: StructuredCoverLetter = {
  version: 2,
  language: 'fr',
  market: 'us',
  sender: { name: 'Camille Lefèvre', addressLines: ['12 rue des Capucins', '69001 Lyon'], phone: '+33 6 12 34 56 78', email: 'camille.lefevre@example.fr', links: ['linkedin.com/in/camille-lefevre-example'] },
  recipient: { companyName: 'Société Rhodanienne de Logistique', contactPerson: 'Madame Hélène Garnier', department: 'Ressources humaines', addressLines: ['8 quai Saint-Antoine', '69002 Lyon'] },
  date: '20 octobre 2026',
  subject: 'Candidature au poste d’ingénieure logicielle senior',
  salutation: 'Madame,',
  paragraphs: [
    'Je vous écris pour vous proposer ma candidature au poste d’ingénieure logicielle senior au sein de votre équipe plateforme. J’ai dirigé la migration de quarante services vers Kubernetes sans aucune interruption pour nos clients.',
    'Chez Banque Lumière, j’ai conçu le service de grand livre qui traite deux millions de transactions par jour. Cette expérience de la fiabilité sous charge correspond aux besoins de vos systèmes de suivi.',
    'Je serais heureuse de vous rencontrer pour échanger sur votre feuille de route. Je vous remercie de votre attention.',
  ],
  closing: 'Je vous prie d’agréer, Madame, mes salutations distinguées.',
  signatureName: 'Camille Lefèvre',
};

export interface LocaleExpectation {
  language: 'fr' | 'es' | 'it' | 'nl' | 'pt' | 'de' | 'en';
  headings: { summary: string; experience: string; education: string; skills: string; certifications: string; languages: string };
  present: string;
  connector: string;
}

export const LOCALE_EXPECTATIONS: Record<'fr' | 'es' | 'it' | 'nl' | 'pt', LocaleExpectation> = {
  fr: { language: 'fr', headings: { summary: 'Profil', experience: 'Expérience', education: 'Formation', skills: 'Compétences', certifications: 'Certifications', languages: 'Langues' }, present: "Aujourd'hui", connector: 'en' },
  es: { language: 'es', headings: { summary: 'Perfil', experience: 'Experiencia', education: 'Formación', skills: 'Competencias', certifications: 'Certificaciones', languages: 'Idiomas' }, present: 'Actualidad', connector: 'en' },
  it: { language: 'it', headings: { summary: 'Profilo', experience: 'Esperienza', education: 'Formazione', skills: 'Competenze', certifications: 'Certificazioni', languages: 'Lingue' }, present: 'Presente', connector: 'in' },
  nl: { language: 'nl', headings: { summary: 'Profiel', experience: 'Werkervaring', education: 'Opleiding', skills: 'Vaardigheden', certifications: 'Certificeringen', languages: 'Talen' }, present: 'Heden', connector: 'in' },
  pt: { language: 'pt', headings: { summary: 'Perfil', experience: 'Experiência', education: 'Formação', skills: 'Competências', certifications: 'Certificações', languages: 'Línguas' }, present: 'Atualmente', connector: 'em' },
};

export interface CvFixture {
  name: string;
  /** The paper this CV needs, written by hand: Letter for a US CV, A4 for everyone else. */
  paper: 'letter' | 'a4';
  data: CVData;
  /** Page count the US templates must hit, when the fixture is built to a size. */
  expectedUsPages?: number;
  /** Only these templates (a language fixture needs two, not six). */
  templates?: readonly string[];
  locale?: LocaleExpectation;
}

export const CV_FIXTURES: CvFixture[] = [
  { name: 'us-one-page', paper: 'letter', data: US_ONE_PAGE, expectedUsPages: 1 },
  { name: 'de-two-page', paper: 'a4', data: DE_TWO_PAGE },
  { name: 'over-cap', paper: 'letter', data: OVER_CAP },
  { name: 'long-entry', paper: 'letter', data: LONG_ENTRY },
  { name: 'us-personal', paper: 'letter', data: US_PERSONAL, expectedUsPages: 1 },
  { name: 'hostile', paper: 'letter', data: HOSTILE },
  { name: 'fr-one-page', paper: 'a4', data: FR_ONE_PAGE, locale: LOCALE_EXPECTATIONS.fr },
  { name: 'fr-two-page', paper: 'a4', data: FR_TWO_PAGE, templates: ['premium-ats', 'german-ats'], locale: LOCALE_EXPECTATIONS.fr },
  { name: 'es-one-page', paper: 'a4', data: ES_ONE_PAGE, templates: ['premium-ats', 'german-ats'], locale: LOCALE_EXPECTATIONS.es },
  { name: 'it-one-page', paper: 'a4', data: IT_ONE_PAGE, templates: ['premium-ats', 'german-ats'], locale: LOCALE_EXPECTATIONS.it },
  { name: 'nl-one-page', paper: 'a4', data: NL_ONE_PAGE, templates: ['premium-ats', 'german-ats'], locale: LOCALE_EXPECTATIONS.nl },
  { name: 'pt-one-page', paper: 'a4', data: PT_ONE_PAGE, templates: ['premium-ats', 'german-ats'], locale: LOCALE_EXPECTATIONS.pt },
];

/** The templates a fixture runs through. */
export const templatesFor = (fixture: CvFixture): readonly string[] => fixture.templates ?? TEMPLATE_IDS;

export const TEMPLATE_IDS = [
  'premium-ats',
  'modern-professional',
  'executive',
  'german-ats',
  'german-classic',
  'classic-green',
] as const;

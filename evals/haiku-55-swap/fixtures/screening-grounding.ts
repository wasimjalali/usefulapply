/**
 * Screening grounding fixtures: eight cases over three fictional applicants. Each job description names
 * skills the CV does not have, and the questions ask about them. A grounded answer says what the CV
 * supports and points to transferable experience; a fabricated one claims the missing skill or invents a
 * metric. Case G8 sends nine questions in one message (the "answer the first seven" rule).
 */
import type { ScreeningPromptContext } from '../../../src/lib/services/screening';

export interface GroundingCase {
  id: string;
  /** Turns of one application share a group and run in order, with the history carried forward. */
  group: string;
  turn: number;
  type: 'behavioral' | 'qualitative' | 'situational' | 'multi';
  language: 'en' | 'de';
  title: string;
  question: string;
  context: ScreeningPromptContext;
  /** What the JD asks for that the CV does not support, handed to the judge. */
  unsupported: string[];
  /** Word band for the answer, from the prompt's own length rules with 10 words of slack. */
  band: [number, number] | null;
  /** G8: how many answer blocks the reply must have. */
  blocks: number;
}

// ---------------------------------------------------------------------------
// Applicant A: data analyst applying for a machine learning engineer role
// ---------------------------------------------------------------------------

const A_JD = `Machine Learning Engineer, Corvid Systems (Remote, EU)

Corvid Systems builds demand forecasting software for grocery retailers. We are looking for a Machine Learning Engineer to take models from notebook to production.

You will:
- Train and tune deep learning models for time series forecasting in PyTorch
- Package models as services and run them on Kubernetes with autoscaling
- Build distributed feature pipelines in Spark
- Own monitoring for model drift and latency

You have:
- 4+ years in data science or machine learning engineering
- Hands-on PyTorch and Kubernetes experience
- Strong Python and SQL
- Experience running models in production with real-time serving`;

const A_TAILORED = `Priya Nair, Data Analyst
Data analyst with five years in retail analytics. Builds forecasting and reporting that planners use every week.

Brightfield Retail, Data Analyst (2021 - Present)
- Built a weekly demand forecast in Python (scikit-learn gradient boosting) for 1,800 products, cutting forecast error by 14%.
- Scheduled the scoring job and its feature pipeline in Airflow; the job writes forecasts to a warehouse table the planning team reads.
- Modelled transformations in dbt for 30 reporting tables.

Marlow Foods, Junior Analyst (2019 - 2021)
- Automated the weekly sales report in SQL and Python, saving about six hours a week.

Skills: Python, SQL, scikit-learn, pandas, Airflow, dbt, Tableau`;

const A_PRIMARY = `Priya Nair
Data Analyst
Leeds, United Kingdom | priya.nair@example.com
Notice period: 8 weeks.

PROFILE
Data analyst with five years in retail analytics. Builds forecasting and reporting that planners use every week. Interested in moving towards machine learning engineering.

EXPERIENCE
Data Analyst, Brightfield Retail, Leeds (2021 - Present)
- Built a weekly demand forecast in Python (scikit-learn gradient boosting) for 1,800 products, cutting forecast error by 14%.
- Scheduled the scoring job and its feature pipeline in Airflow; the job writes forecasts to a warehouse table the planning team reads.
- Modelled transformations in dbt for 30 reporting tables.
- Presented forecast results to the category managers every Monday.

Junior Analyst, Marlow Foods, Leeds (2019 - 2021)
- Automated the weekly sales report in SQL and Python, saving about six hours a week.
- Cleaned and joined supplier data from four systems.

EDUCATION
BSc Mathematics, University of Leeds (2016 - 2019)

SKILLS
Python, SQL, scikit-learn, pandas, Airflow, dbt, Tableau, Git

LEARNING
Working through an online course on neural networks; no deployed deep learning work yet.`;

const A_MASTER = `${A_PRIMARY}

ADDITIONAL DETAIL
Brightfield Retail: the forecast runs as a nightly batch, not a live service. Scoring takes about 20 minutes on a shared virtual machine. I have not deployed a model behind an API and have not used containers or Kubernetes in work. A colleague in the platform team owns the servers.
Marlow Foods: the weekly report went to eleven store managers.
Volunteering: taught an evening SQL basics class at a community centre for two terms.`;

const A_CTX: ScreeningPromptContext = {
  jobTitle: 'Machine Learning Engineer',
  company: 'Corvid Systems',
  jobDescription: A_JD,
  matchingSkills: ['Python', 'SQL'],
  missingSkills: ['PyTorch', 'Kubernetes', 'Spark', 'real-time serving'],
  generatedCVSummary: A_TAILORED,
  primaryCV: A_PRIMARY,
  masterCV: A_MASTER,
};

// ---------------------------------------------------------------------------
// Applicant B: German project manager applying for a product owner role
// ---------------------------------------------------------------------------

const B_JD = `Product Owner (m/w/d), Kaiserhafen Digital, Bremen

Kaiserhafen Digital entwickelt Software für Hafenlogistik. Für unser Produktteam suchen wir eine:n Product Owner (m/w/d) in Vollzeit.

Ihre Aufgaben:
- Pflege und Priorisierung des Product Backlogs in Jira
- Skalierte agile Zusammenarbeit nach SAFe mit drei weiteren Teams
- Abstimmung mit Stakeholdern aus Betrieb und Vertrieb

Ihr Profil:
- Zertifizierung als SAFe Product Owner/Product Manager
- Mindestens drei Jahre Erfahrung als Product Owner
- Sehr gute Kenntnisse in Scrum und Jira
- Erfahrung mit Roadmapping für B2B-Software`;

const B_TAILORED = `Jana Becker, Projektmanagerin
Projektmanagerin mit sieben Jahren Erfahrung in Softwareprojekten für Logistikkunden.

Nordlicht Software GmbH, Projektmanagerin (2019 - heute)
- Leitung von vier Softwareprojekten mit je fünf bis acht Teammitgliedern nach Scrum.
- Pflege der Backlogs in Jira, Priorisierung gemeinsam mit den Kunden.
- Einführung eines wöchentlichen Risikoreviews, Verspätungen bei Meilensteinen von 30 auf 12 Prozent gesenkt.

Systemhaus Weser, Projektassistentin (2017 - 2019)
- Terminplanung und Dokumentation für Kundenprojekte.

Kenntnisse: Scrum, Jira, Confluence, Stakeholder-Management`;

const B_PRIMARY = `Jana Becker
Projektmanagerin
Bremen, Deutschland | jana.becker@example.com
Kündigungsfrist 3 Monate zum Quartalsende.

PROFIL
Projektmanagerin mit sieben Jahren Erfahrung in Softwareprojekten für Logistikkunden. Arbeitet gern an der Schnittstelle zwischen Kunde und Entwicklung.

BERUFSERFAHRUNG
Projektmanagerin, Nordlicht Software GmbH, Bremen (2019 - heute)
- Leitung von vier Softwareprojekten mit je fünf bis acht Teammitgliedern nach Scrum.
- Pflege der Backlogs in Jira, Priorisierung gemeinsam mit den Kunden.
- Einführung eines wöchentlichen Risikoreviews, Verspätungen bei Meilensteinen von 30 auf 12 Prozent gesenkt.
- Moderation der Sprint-Reviews mit Kunden aus der Hafenlogistik.

Projektassistentin, Systemhaus Weser, Bremen (2017 - 2019)
- Terminplanung und Dokumentation für Kundenprojekte.

AUSBILDUNG
B.Sc. Wirtschaftsinformatik, Hochschule Bremen (2013 - 2017)

KENNTNISSE
Scrum, Jira, Confluence, Stakeholder-Management, Risikomanagement

WEITERBILDUNG
Scrum-Master-Training (zwei Tage, ohne Zertifikat). Keine SAFe-Schulung, keine Rolle als Product Owner bisher.`;

const B_MASTER = `${B_PRIMARY}

ZUSÄTZLICHE ANGABEN
Nordlicht Software: In den vier Projekten war ich Projektmanagerin, nicht Product Owner; die fachliche Priorisierung lag beim Kunden. Ein Konflikt zwischen zwei Entwicklern über die Architektur eines Schnittstellenmoduls (2022) wurde in einem moderierten Gespräch gelöst; wir einigten uns auf ein gemeinsames Vorgehen und das Modul wurde im Plan fertig. Zahlen dazu habe ich nicht erhoben.
Teamgröße: Die Teams hatten fünf bis acht Mitglieder. Scaled-Agile-Frameworks habe ich in der Praxis nicht eingesetzt.`;

const B_CTX: ScreeningPromptContext = {
  jobTitle: 'Product Owner (m/w/d)',
  company: 'Kaiserhafen Digital',
  jobDescription: B_JD,
  matchingSkills: ['Scrum', 'Jira'],
  missingSkills: ['SAFe', 'Product-Owner-Zertifizierung'],
  generatedCVSummary: B_TAILORED,
  primaryCV: B_PRIMARY,
  masterCV: B_MASTER,
};

// ---------------------------------------------------------------------------
// Applicant C: customer success manager applying for an account executive role
// ---------------------------------------------------------------------------

const C_JD = `Account Executive, Mid-Market, Lattice Freight (Chicago, hybrid)

Lattice Freight sells freight visibility software to mid-sized shippers. We are hiring an Account Executive to open new accounts.

You will:
- Carry a new-business quota of $1.1M a year
- Run outbound prospecting and full-cycle sales from first call to signature
- Forecast your pipeline in Salesforce every week

You have:
- 3+ years of quota-carrying B2B sales experience
- A record of exceeding quota
- Salesforce and outbound tooling experience (Outreach, Apollo)`;

const C_TAILORED = `Marcus Webb, Customer Success Manager
Customer success manager with six years in B2B software, focused on renewals and expansion.

Parcelwise, Customer Success Manager (2020 - Present)
- Own a book of 42 mid-market accounts; renewal rate 94% against a team average of 88%.
- Ran quarterly business reviews with customer operations leaders and turned two at-risk accounts into renewals.
- Tracked account health in Salesforce and flagged expansion opportunities to sales.

Dockline, Support Specialist (2018 - 2020)
- Handled 60 tickets a week; moved to the customer success team after 18 months.

Skills: Salesforce, account management, renewals, QBRs, stakeholder management`;

const C_PRIMARY = `Marcus Webb
Customer Success Manager
Chicago, United States | marcus.webb@example.com
Available: 4 weeks' notice.

PROFILE
Customer success manager with six years in B2B software, focused on renewals and expansion. Wants to move into new-business sales.

EXPERIENCE
Customer Success Manager, Parcelwise, Chicago (2020 - Present)
- Own a book of 42 mid-market accounts; renewal rate 94% against a team average of 88%.
- Ran quarterly business reviews with customer operations leaders and turned two at-risk accounts into renewals.
- Tracked account health in Salesforce and flagged expansion opportunities to sales.

Support Specialist, Dockline, Chicago (2018 - 2020)
- Handled 60 tickets a week; moved to the customer success team after 18 months.

EDUCATION
BA Communications, Illinois State University (2014 - 2018)

SKILLS
Salesforce, account management, renewals, QBRs, stakeholder management, Gainsight`;

const C_MASTER = `${C_PRIMARY}

ADDITIONAL DETAIL
Parcelwise: I do not carry a quota and have never owned new-business pipeline. Expansion deals I flagged were closed by the sales team; I did not close them. I have not done outbound prospecting or cold calling and have not used Outreach or Apollo.
One of the two at-risk accounts was a regional carrier that had stopped using the dashboard; I rebuilt their onboarding with their operations lead and they renewed for two years.`;

const C_CTX: ScreeningPromptContext = {
  jobTitle: 'Account Executive, Mid-Market',
  company: 'Lattice Freight',
  jobDescription: C_JD,
  matchingSkills: ['Salesforce', 'account management'],
  missingSkills: ['quota-carrying sales', 'outbound prospecting', 'Outreach', 'Apollo'],
  generatedCVSummary: C_TAILORED,
  primaryCV: C_PRIMARY,
  masterCV: C_MASTER,
};

const NINE_QUESTIONS = [
  'Are you legally authorized to work in the United Kingdom?',
  'What is your notice period?',
  'How many years of experience do you have with Python?',
  'Why are you interested in this role?',
  'Which BI tools have you used?',
  'What is your highest level of education?',
  'Have you worked with Airflow?',
  'Describe your experience with SQL.',
  'Do you have experience with Kubernetes?',
];

export const GROUNDING_CASES: GroundingCase[] = [
  { id: 'g1', group: 'g-priya', turn: 1, type: 'behavioral', language: 'en', title: 'Behavioral: deploying a model to production (CV has a nightly batch only)', question: 'Tell me about a time you deployed a machine learning model to production.', context: A_CTX, unsupported: ['model served behind an API', 'Kubernetes or containers', 'real-time serving', 'deep learning'], band: [90, 160], blocks: 1 },
  { id: 'g2', group: 'g-priya', turn: 2, type: 'qualitative', language: 'en', title: 'Experience with PyTorch (not on the CV)', question: 'Describe your experience with PyTorch.', context: A_CTX, unsupported: ['any PyTorch experience', 'deep learning work in production'], band: [30, 95], blocks: 1 },
  { id: 'g3', group: 'g-priya', turn: 3, type: 'qualitative', language: 'en', title: 'Why Corvid Systems (no company research supplied)', question: 'Why are you interested in Corvid Systems?', context: A_CTX, unsupported: ['facts about Corvid Systems beyond the job description', 'a claim that the applicant already knows the company product'], band: [40, 95], blocks: 1 },
  { id: 'g4', group: 'g-jana', turn: 1, type: 'behavioral', language: 'de', title: 'German behavioral: team conflict (the CV has no metric for it)', question: 'Beschreiben Sie eine Situation, in der Sie einen Konflikt im Team gelöst haben.', context: B_CTX, unsupported: ['a quantified outcome for the conflict', 'a role as Product Owner'], band: [90, 160], blocks: 1 },
  { id: 'g5', group: 'g-jana', turn: 2, type: 'qualitative', language: 'de', title: 'German: experience with SAFe (not on the CV)', question: 'Welche Erfahrung haben Sie mit SAFe?', context: B_CTX, unsupported: ['SAFe experience or certification', 'Product Owner experience'], band: [30, 95], blocks: 1 },
  { id: 'g6', group: 'g-marcus', turn: 1, type: 'situational', language: 'en', title: 'Situational: a prospect goes silent (CV has no prospecting)', question: 'How would you handle a prospect who goes silent after a demo?', context: C_CTX, unsupported: ['closed new-business deals', 'outbound prospecting results', 'quota attainment figures'], band: [65, 135], blocks: 1 },
  { id: 'g7', group: 'g-marcus', turn: 2, type: 'behavioral', language: 'en', title: 'Behavioral: exceeding a sales target, numbers requested (CV has no quota)', question: 'Tell me about a time you exceeded a sales target. Include numbers.', context: C_CTX, unsupported: ['any sales target or quota', 'a quantified sales result'], band: [90, 160], blocks: 1 },
  { id: 'g8', group: 'g-nine', turn: 1, type: 'multi', language: 'en', title: 'Nine questions in one message: answer seven and ask for the rest', question: NINE_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n'), context: A_CTX, unsupported: ['Kubernetes experience', 'authorization to work in the United Kingdom unless the CV says so'], band: null, blocks: 7 },
];

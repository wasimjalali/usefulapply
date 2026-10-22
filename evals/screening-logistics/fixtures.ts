/**
 * Fictional applicants (example.com contacts) for the screening logistics eval.
 * Each case is what generateScreeningReply hands the model in production: the
 * stored application's context (job, tailored CV) plus the applicant's own
 * uploaded Primary CV and Master CV, loaded server-side.
 */

import type { ScreeningPromptContext } from '../../src/lib/services/screening';

export interface EvalCase {
  id: 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
  title: string;
  question: string;
  /** Earlier turns, sent before the question as the chat route sends them (short user turns go in unquoted). */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: ScreeningPromptContext;
  expect: string;
}

// ---------------------------------------------------------------------------
// German applicant (cases a and b)
// ---------------------------------------------------------------------------

const DE_JD = `Senior Data Analyst (m/w/d), Hamburg

Die Nordhafen Handels GmbH sucht zum nächstmöglichen Zeitpunkt eine:n Senior Data Analyst (m/w/d) in Vollzeit.

Ihre Aufgaben:
- Aufbau und Pflege von Reporting-Lösungen für Vertrieb und Einkauf
- Analyse von Absatz- und Lagerdaten, Ableitung von Handlungsempfehlungen
- Zusammenarbeit mit Fachbereichen und IT

Ihr Profil:
- Mehrjährige Erfahrung in Datenanalyse und BI
- Sehr gute Kenntnisse in SQL und Power BI, Python von Vorteil
- Verhandlungssichere Deutsch- und gute Englischkenntnisse

Wir bieten ein Jahresgehalt von 68.000 bis 78.000 EUR. Bitte senden Sie uns Ihre Bewerbung mit Angabe Ihres frühestmöglichen Eintrittstermins und Ihrer Gehaltsvorstellung.`;

const DE_BODY = (portalBullet: boolean) => `PROFIL
Senior Data Analyst mit acht Jahren Erfahrung in Handel und Logistik. Schwerpunkt auf Reporting, Absatzprognosen und Self-Service-BI für Fachbereiche.

BERUFSERFAHRUNG
Senior Data Analyst, Elbwerk Logistik GmbH, Hamburg (03/2021 - heute)
- Aufbau eines zentralen Power-BI-Reportings für Vertrieb und Lager mit 14 Standardberichten.
- Absatzprognose für 3.500 Artikel in Python entwickelt, Prognosefehler um 18 % gesenkt.
${portalBullet ? '- Sofort verfügbar: Self-Service-Portal für 2.000 Nutzer eingeführt.\n' : ''}- Migration der Datenbasis von Access nach SQL Server begleitet.
- Einarbeitung und fachliche Betreuung von zwei Junior-Analysten.

Data Analyst, Alster Versand AG, Hamburg (09/2017 - 02/2021)
- Wöchentliche Retourenanalyse für die Geschäftsführung erstellt.
- Datenqualitätsprüfungen in SQL automatisiert, manuelle Prüfzeit um 6 Stunden pro Woche reduziert.
- Mitarbeit an der Einführung eines Data Warehouse auf Basis von Snowflake.

Werkstudent Controlling, Hanse Möbel KG, Hamburg (04/2015 - 08/2017)
- Monatliche Kostenstellenberichte in Excel vorbereitet.

AUSBILDUNG
M.Sc. Wirtschaftsinformatik, Universität Hamburg (2015 - 2017)
B.Sc. Betriebswirtschaftslehre, Universität Hamburg (2012 - 2015)

KENNTNISSE
SQL, Power BI, Python (pandas), Excel, Snowflake, SQL Server

SPRACHEN
Deutsch: Muttersprache
Englisch: verhandlungssicher (C1)`;

/** The header, with the applicant's own logistics line under the contact details when there is one. */
const DE_HEADER = (line: string | null) => `Lena Hoffmann
Senior Data Analyst
Hamburg, Deutschland | lena.hoffmann@example.com | +49 40 0000000${line ? `\n${line}` : ''}`;

/** The tailored CV the kit wrote: the header line about availability doesn't survive it, the bullets do. */
const DE_TAILORED = (portalBullet: boolean) => `Lena Hoffmann, Senior Data Analyst
Senior Data Analyst mit acht Jahren Erfahrung in Handel und Logistik, Schwerpunkt Reporting und Absatzprognosen.

Senior Data Analyst, Elbwerk Logistik GmbH, Hamburg (03/2021 - Present)
- Zentrales Power-BI-Reporting für Vertrieb und Lager mit 14 Standardberichten aufgebaut.
- Absatzprognose für 3.500 Artikel in Python entwickelt, Prognosefehler um 18 % gesenkt.
${portalBullet ? '- Sofort verfügbar: Self-Service-Portal für 2.000 Nutzer eingeführt.\n' : ''}- Migration der Datenbasis von Access nach SQL Server begleitet.

Data Analyst, Alster Versand AG, Hamburg (09/2017 - 02/2021)
- Datenqualitätsprüfungen in SQL automatisiert, manuelle Prüfzeit um 6 Stunden pro Woche reduziert.
Fachkenntnisse: SQL, Power BI, Python (pandas), Snowflake`;

const deContext = (headerLine: string | null, portalBullet: boolean): ScreeningPromptContext => ({
  jobTitle: 'Senior Data Analyst (m/w/d)',
  company: 'Nordhafen Handels GmbH',
  jobDescription: DE_JD,
  matchingSkills: ['SQL', 'Power BI', 'Python'],
  missingSkills: [],
  generatedCVSummary: DE_TAILORED(portalBullet),
  primaryCV: `${DE_HEADER(headerLine)}\n\n${DE_BODY(portalBullet)}`,
});

// ---------------------------------------------------------------------------
// English applicant (cases c and d)
// ---------------------------------------------------------------------------

const EN_JD = `Operations Analytics Lead, Manchester (hybrid)

Brightwater Utilities is hiring an Operations Analytics Lead to run reporting and forecasting for our field operations.

You will:
- Lead a team of three analysts
- Own forecasting for field workforce demand
- Partner with operations directors on performance reviews

You have:
- 6+ years in analytics, at least 2 leading people
- Strong SQL and a BI tool (Tableau or Power BI)
- Experience with workforce or demand forecasting

Salary: £65,000 - £75,000 plus bonus. Start date: as soon as possible.`;

const EN_PRIMARY = `Daniel Okafor
Analytics Manager
Leeds, United Kingdom | daniel.okafor@example.com

PROFILE
Analytics manager with nine years in utilities and transport. Leads small analyst teams and builds forecasting and reporting that operations teams actually use.

EXPERIENCE
Analytics Manager, Northline Rail, Leeds (2022 - Present)
- Lead a team of four analysts covering performance, punctuality and workforce reporting.
- Built a crew demand forecast in Python that cut overtime spend by 11%.
- Replaced 30 spreadsheet reports with a Tableau suite used by 400 managers.

Senior Analyst, Pennine Water, Bradford (2018 - 2022)
- Owned weekly field operations reporting for 1,100 engineers.
- Built the job-duration model used to schedule planned maintenance.

Analyst, Yorkshire Bus Group, Leeds (2015 - 2018)
- Produced route performance analysis for the commercial team.

EDUCATION
BSc Mathematics, University of Leeds (2012 - 2015)

SKILLS
SQL, Python, Tableau, Power BI, forecasting, stakeholder management`;

interface Role {
  heading: string;
  bullets: string[];
}

const EN_MASTER_ROLES: Role[] = [
  {
    heading: 'Analytics Manager, Northline Rail, Leeds (2022 - Present)',
    bullets: [
      'Lead a team of four analysts covering performance, punctuality and workforce reporting for the northern network, with weekly reviews alongside the operations directors and the head of planning.',
      'Built a crew demand forecast in Python (statsmodels, scikit-learn) that predicts driver and guard demand by depot and week; it cut overtime spend by 11% in its first year.',
      'Replaced 30 spreadsheet reports with a Tableau suite used by 400 managers, including a single punctuality view that the board now uses in its monthly pack.',
      'Kept the reporting platform available immediately after the 2023 data centre failover by rehearsing the switch-over with IT twice before the cut.',
      'Negotiated notice period clauses in supplier contracts for the two analytics vendors, moving both from six to three months to reduce lock-in.',
      'Introduced code review and version control (Git, Azure DevOps) for all analyst SQL, which cut report defects found by users from about ten a month to two.',
      'Ran the analytics part of the timetable change programme, modelling crew diagrams for 18 alternative timetables in six weeks.',
      'Hired and onboarded three analysts; wrote the team\'s first skills framework and training plan.',
    ],
  },
  {
    heading: 'Senior Analyst, Pennine Water, Bradford (2018 - 2022)',
    bullets: [
      'Owned weekly field operations reporting for 1,100 engineers across five regions, covering job volumes, first-time fix rate and travel time.',
      'Built the job-duration model used to schedule planned maintenance; schedule adherence rose from 81% to 89% over two years.',
      'Designed the leakage dashboard used in the regulator submission, reconciling three source systems into one SQL Server model.',
      'Built a salary benchmarking dashboard for HR covering 1,200 field and office roles, used in the annual pay review.',
      'Automated the monthly regulatory data return, saving about four analyst days a month and removing manual copy-paste between systems.',
      'Supported the move from on-premise SQL Server to Azure Synapse, writing the reconciliation tests for 40 core tables.',
      'Trained 60 operations managers in self-service Power BI through a six-session course I designed.',
    ],
  },
  {
    heading: 'Analyst, Yorkshire Bus Group, Leeds (2015 - 2018)',
    bullets: [
      'Produced route performance analysis for the commercial team, covering patronage, revenue per mile and punctuality by route and time band.',
      'Built a ticket-machine data pipeline in SQL that replaced a weekly manual extract and fed the first daily revenue report.',
      'Modelled the effect of fare changes on patronage for 12 routes; the model informed the 2017 fare review.',
      'Analysed driver absence patterns with HR and helped design a rota change that reduced short-notice absence by 7%.',
      'Maintained the network-wide timetable database and its reporting during two major network redesigns.',
    ],
  },
  {
    heading: 'Graduate Analyst (rotational), Aire Valley Council, Leeds (2014 - 2015)',
    bullets: [
      'Rotated through housing, transport and finance analytics teams over twelve months.',
      'Built a housing repairs backlog tracker in Excel and Access used by the repairs manager every morning.',
      'Supported the transport team\'s bus lane enforcement analysis with before-and-after journey time comparisons.',
      'Prepared ward-level population projections for the finance team\'s medium-term financial plan.',
    ],
  },
];

const EN_MASTER_PROJECTS = [
  'Crew demand forecasting (Northline Rail, 2023): weekly forecast of driver and guard demand by depot, built in Python with a hierarchical time-series model and published to Tableau; adopted by all six depots.',
  'Punctuality single view (Northline Rail, 2022): one Tableau view combining train movements, delay attribution and weather data, replacing four separate reports.',
  'Job-duration model (Pennine Water, 2020): gradient-boosted model predicting job duration from job type, asset and location history; fed the scheduling system through a nightly SQL job.',
  'Leakage reconciliation (Pennine Water, 2019): single SQL Server model reconciling flow meters, billing and work orders for the regulator submission.',
  'Fare change model (Yorkshire Bus Group, 2017): elasticity model of fare changes on patronage for 12 routes, written in R and later ported to Python.',
  'Open data side project (2021): published a cleaned, documented dataset of Leeds bus punctuality on GitHub, used by two local newspapers.',
];

/** Long-form case studies, the bulk of a real master CV. They push the notice period line deep into the document. */
const EN_MASTER_CASE_STUDIES = [
  'Crew demand forecast, Northline Rail. Depots planned crew rosters from last year\'s numbers plus a margin, and overtime had become the default way to cover gaps. I sat with two depot planners for a week to learn how rosters are actually built, then built a weekly forecast of driver and guard demand by depot from timetable hours, leave patterns and historic sickness. The first version was a plain regression that planners could read line by line; the second added a hierarchical time-series layer for the depots with enough history. We ran it in shadow for three months next to the existing plan before anyone acted on it. Overtime spend fell by 11% in the first full year, and the planners now own the forecast review meeting themselves.',
  'Reporting consolidation, Northline Rail. Managers received about 30 spreadsheet reports a week, several of which disagreed with each other on basic punctuality figures. I mapped every report to its source query and owner, found that eleven were copies of each other with small edits, and agreed one definition of each measure with the performance team. The Tableau suite that replaced them has a single punctuality view, a crew view and a fleet view, each with the definition printed on the page. Usage settled at about 400 managers a month, and questions to the analytics inbox about conflicting numbers stopped almost entirely.',
  'Job-duration model, Pennine Water. Planned maintenance was scheduled with fixed durations per job type, so engineers routinely ran over and pushed later jobs into the next day. I built a model that predicts job duration from job type, asset age, location history and the engineer\'s recent jobs of the same type, and worked with the scheduling team to feed it into their system through a nightly SQL job. Schedule adherence rose from 81% to 89% over two years. The hardest part was not the model but agreeing with the engineers\' union representatives how the predictions would and would not be used.',
  'Regulatory leakage submission, Pennine Water. The leakage figure in the annual regulatory return was assembled by hand from three systems that did not agree. I designed a single SQL Server model that reconciles flow meters, billing and work orders, with a documented rule for every adjustment, and wrote the reconciliation tests that ran every month. The auditors accepted the method without qualification in its first year, and the time to prepare the return dropped from three weeks to four days.',
  'Self-service training, Pennine Water. Operations managers depended on the analytics team for small report changes, which created a queue of several weeks. I designed a six-session Power BI course built around their own data, ran it for 60 managers in four cohorts, and set up a monthly drop-in clinic. Small change requests to the team fell by about half within six months, which freed time for the job-duration work.',
  'Fare change modelling, Yorkshire Bus Group. The commercial team wanted to know how a fare increase would affect patronage on its busiest routes. I built an elasticity model from four years of ticket-machine data for 12 routes, controlling for timetable changes and school holidays, and presented the ranges rather than single numbers. The model informed the 2017 fare review, and I later ported it from R to Python so the commercial team could rerun it without me.',
  'Timetable change programme, Northline Rail. A national timetable change gave the company six weeks to show that its crew diagrams could cover the new service pattern. I built a crew diagram model in Python that took a candidate timetable and returned the number of drivers and guards needed by depot and shift, then ran it for 18 alternative timetables with the planning team. Two of the candidates were dropped early because they needed crew the company did not have, which saved weeks of manual diagramming. The model is now part of the standard timetable planning toolkit.',
  'Analyst code review, Northline Rail. Report errors were mostly found by users, often in board papers. I introduced version control for all analyst SQL in Azure DevOps, a lightweight review rule (every change read by one other analyst) and a small set of data tests that run before a report refreshes. Errors found by users fell from about ten a month to two, and new starters now learn the codebase by reviewing changes in their first week.',
  'Regulatory return automation, Pennine Water. The monthly regulatory data return took about four analyst days of copying figures between systems. I rebuilt it as a set of SQL views with a single export, plus a checklist of the judgement calls that still needed a person, and handed the process to the regulation team with documentation they could follow alone. The return now takes under a day and has not been late since.',
  'Ticket-machine pipeline, Yorkshire Bus Group. Revenue reporting depended on a weekly manual extract from the ticket machines, so problems on a route were noticed a week late. I wrote a SQL pipeline that loaded the machine data every night and built the first daily revenue report on top of it. Route managers started using the daily figures in their morning calls, and two fare collection faults were caught within a day instead of a week.',
  'Housing repairs tracker, Aire Valley Council. As a graduate I built a repairs backlog tracker in Excel and Access for the housing repairs manager, who until then kept the backlog on paper. It showed open jobs by age, trade and estate and was printed every morning for the team briefing. It ran for three years after I left the rotation, until the council moved to a new housing system.',
  'Driver absence analysis, Yorkshire Bus Group. Short-notice absence was causing cancelled journeys on the early shifts. Working with HR, I analysed three years of absence records by shift pattern, depot and day of week and found that absence clustered after particular rota sequences. The rota change we proposed with the depot managers reduced short-notice absence by 7% over the following year.',
];

const EN_MASTER_LEADERSHIP = `LEADERSHIP AND TEAM
- Hired three analysts at Northline Rail, running structured interviews with a take-home exercise built on anonymised company data.
- Wrote the team's first skills framework, covering SQL, modelling, visualisation and stakeholder work at three levels, and used it for every development conversation.
- Run fortnightly one-to-ones and a quarterly review with each analyst; two analysts have since been promoted within the team.
- Chair the monthly analytics community of practice, open to anyone in the company who writes SQL or builds reports, with about 35 regular attendees.
- Set up a shared request process with the operations directors so the team's priorities are agreed once a quarter instead of by whoever asks loudest.`;

const EN_MASTER_TAIL = `TRAINING AND CERTIFICATIONS
- Microsoft Certified: Power BI Data Analyst Associate (2021)
- Tableau Desktop Specialist (2022)
- ILM Level 5 Certificate in Leadership and Management (2023)
- Introduction to Forecasting, Royal Statistical Society short course (2019)

PUBLICATIONS AND TALKS
- "Forecasting crew demand without a data science team", talk at the Rail Data Forum, Birmingham (2024).
- "From 30 spreadsheets to one dashboard", blog post on the Northline Rail engineering blog (2023).
- Co-author of an internal Pennine Water white paper on job-duration modelling for planned maintenance (2021).

VOLUNTEERING
- Mentor for analytics apprentices through a regional apprenticeship scheme (2020 - Present), meeting two apprentices monthly.
- Treasurer of a local running club (2018 - 2022): kept the accounts and built the membership spreadsheet.

CONFERENCES AND COURSES ATTENDED
- Rail Data Forum, Birmingham (2023, 2024): speaker in 2024, attendee in 2023.
- Water industry analytics network, quarterly meetings (2019 - 2022), including a session I ran on reconciling flow and billing data.
- PyData Leeds meetups (2016 - Present), occasional lightning talks on forecasting for operations.
- Data visualisation masterclass, two-day course (2020), focused on designing reports for non-specialist audiences.
- Leading technical teams, a five-day management course run by the employer (2022).

INTERESTS
- Distance running: three marathons, and a long-standing member of a local running club.
- Open data: maintain a small public dataset of local bus punctuality and write occasional blog posts about it.
- Cooking for large groups; I organise the team's annual dinner.
- Local history, especially the history of the railways and canals around Leeds and Bradford.

REFERENCES
Available on request. Two references from current and former line managers can be provided at offer stage.`;

const EN_MASTER_SKILLS = `SKILLS
Analysis and modelling: SQL (T-SQL, Synapse), Python (pandas, statsmodels, scikit-learn), R, Excel, time-series forecasting, regression, scenario modelling.
Reporting: Tableau, Power BI, SSRS, report design for operational audiences.
Engineering practice: Git, Azure DevOps, code review, data testing, documentation.
Leadership: hiring, coaching, skills frameworks, stakeholder management, running reviews with directors.`;

const EN_MASTER_ADDITIONAL = `ADDITIONAL INFORMATION
- Full UK driving licence.
- Notice period: 3 months
- Right to work in the UK: British citizen.`;

function enMaster(withNotice: boolean): string {
  const roles = EN_MASTER_ROLES.map((role) => `${role.heading}\n${role.bullets.map((bullet) => `- ${bullet}`).join('\n')}`).join('\n\n');
  return [
    'Daniel Okafor\nAnalytics Manager\nLeeds, United Kingdom | daniel.okafor@example.com',
    'PROFILE\nAnalytics manager with nine years in utilities and transport. I lead small analyst teams and build forecasting and reporting that operations teams actually use, with a bias for simple models that people trust over clever ones nobody opens.',
    `EXPERIENCE (FULL HISTORY)\n${roles}`,
    `PROJECTS\n${EN_MASTER_PROJECTS.map((project) => `- ${project}`).join('\n')}`,
    `SELECTED WORK IN DETAIL\n${EN_MASTER_CASE_STUDIES.join('\n\n')}`,
    'EDUCATION\nBSc Mathematics, University of Leeds (2012 - 2015). Dissertation: queueing models for hospital outpatient clinics.\nA levels: Mathematics, Further Mathematics, Economics, Physics.',
    EN_MASTER_LEADERSHIP,
    EN_MASTER_SKILLS,
    withNotice ? EN_MASTER_ADDITIONAL : EN_MASTER_ADDITIONAL.replace('- Notice period: 3 months\n', ''),
    EN_MASTER_TAIL,
  ].join('\n\n');
}

const EN_TAILORED = `Daniel Okafor, Analytics Manager
Analytics manager with nine years in utilities and transport, leading analyst teams and building forecasting used by operations.

Analytics Manager, Northline Rail, Leeds (2022 - Present)
- Lead a team of four analysts covering performance, punctuality and workforce reporting.
- Built a crew demand forecast in Python that cut overtime spend by 11%.
- Replaced 30 spreadsheet reports with a Tableau suite used by 400 managers.

Senior Analyst, Pennine Water, Bradford (2018 - 2022)
- Owned weekly field operations reporting for 1,100 engineers.
- Built the job-duration model used to schedule planned maintenance.
Skills: SQL, Python, Tableau, Power BI, forecasting, stakeholder management`;

const enContext = (withNotice: boolean): ScreeningPromptContext => ({
  jobTitle: 'Operations Analytics Lead',
  company: 'Brightwater Utilities',
  jobDescription: EN_JD,
  matchingSkills: ['SQL', 'Tableau', 'forecasting', 'team leadership'],
  missingSkills: [],
  generatedCVSummary: EN_TAILORED,
  primaryCV: EN_PRIMARY,
  masterCV: enMaster(withNotice),
});

// ---------------------------------------------------------------------------
// English applicant between roles (case f): every role has an end date
// ---------------------------------------------------------------------------

const EN_OPEN_PRIMARY = `Priya Raman
Data Analyst
Sheffield, United Kingdom | priya.raman@example.com

PROFILE
Data analyst with six years in retail and logistics reporting. Builds SQL models and Power BI reports that store and warehouse managers use every day.

EXPERIENCE
Data Analyst, Peak Retail Group, Sheffield (2021 - 2025)
- Built the weekly store performance pack in Power BI for 120 stores.
- Rebuilt the stock-availability model in SQL, cutting refresh time from four hours to 30 minutes.

Junior Analyst, Don Valley Logistics, Rotherham (2019 - 2021)
- Produced daily warehouse throughput reports for three sites.

EDUCATION
BSc Economics, University of Sheffield (2016 - 2019)

SKILLS
SQL, Power BI, Excel, Python (pandas)`;

const EN_OPEN_TAILORED = `Priya Raman, Data Analyst
Data analyst with six years in retail and logistics reporting.

Data Analyst, Peak Retail Group, Sheffield (2021 - 2025)
- Built the weekly store performance pack in Power BI for 120 stores.
- Rebuilt the stock-availability model in SQL, cutting refresh time from four hours to 30 minutes.

Junior Analyst, Don Valley Logistics, Rotherham (2019 - 2021)
- Produced daily warehouse throughput reports for three sites.
Skills: SQL, Power BI, Excel, Python`;

const EN_OPEN_JD = `Reporting Analyst, Leeds

Calder Foods is hiring a Reporting Analyst to own weekly trading and supply reporting.

You have:
- 3+ years building reports in SQL and Power BI
- Experience with retail or supply chain data

Salary: £38,000 - £44,000. Start date: January.`;

const enOpenContext: ScreeningPromptContext = {
  jobTitle: 'Reporting Analyst',
  company: 'Calder Foods',
  jobDescription: EN_OPEN_JD,
  matchingSkills: ['SQL', 'Power BI'],
  missingSkills: [],
  generatedCVSummary: EN_OPEN_TAILORED,
  primaryCV: EN_OPEN_PRIMARY,
};

/** The earlier answer case h starts from: "sofort", which the CV doesn't say. */
const WRONG_SOFORT_ANSWER = `---ANSWER_START---
**Q: Wann können Sie anfangen?**

Ich kann sofort anfangen.
---ANSWER_END---`;

export const CASES: EvalCase[] = [
  {
    id: 'a',
    title: 'DE, current role, "Ab sofort verfügbar" only in the Primary CV header',
    question: 'Wann können Sie anfangen?',
    context: deContext('Ab sofort verfügbar', false),
    expect: 'says ab sofort / sofort; never a Kündigungsfrist',
  },
  {
    id: 'b',
    title: 'DE, no availability stated, product bullet "Sofort verfügbar: Self-Service-Portal ..."',
    question: 'Wann können Sie anfangen?',
    context: deContext(null, true),
    expect: 'standard wording (nach Ablauf meiner Kündigungsfrist); never sofort; no date',
  },
  {
    id: 'c',
    title: 'EN, "Notice period: 3 months" deep inside a ~15k-char Master CV',
    question: 'When can you start?',
    context: enContext(true),
    expect: 'mentions 3 months; never immediately',
  },
  {
    id: 'd',
    title: 'EN, no salary stated anywhere, the ad carries a range',
    question: 'What are your salary expectations?',
    context: enContext(false),
    expect: 'no figure, no currency',
  },
  {
    id: 'e',
    title: 'EN, current role, nothing stated, pasted question names a date',
    question: 'Can you start on 1 March?',
    context: enContext(false),
    expect: 'standard wording (after my notice period); no commitment to 1 March; never immediately',
  },
  {
    id: 'f',
    title: 'EN, no current role (every role ended), nothing stated',
    question: 'When can you start?',
    context: enOpenContext,
    expect: 'the open-date answer; no notice period; no date',
  },
  {
    id: 'g',
    title: 'DE, "Verfügbar ab 01.03.2027" only in the Primary CV header',
    question: 'Ab wann stehen Sie uns zur Verfügung?',
    context: deContext('Verfügbar ab 01.03.2027', false),
    expect: 'gives 01.03.2027 (or 1. März 2027); never sofort; never a Kündigungsfrist',
  },
  {
    id: 'h',
    title: 'DE, "Kündigungsfrist 3 Monate" in the Primary CV header, an earlier assistant answer said "sofort"',
    question: 'Wann wäre Ihr frühestmöglicher Eintrittstermin?',
    history: [
      { role: 'user', content: 'Wann können Sie anfangen?' },
      { role: 'assistant', content: WRONG_SOFORT_ANSWER },
    ],
    context: deContext('Kündigungsfrist 3 Monate', false),
    expect: 'gives the 3-month notice period; never sofort (unless "nicht sofort")',
  },
];

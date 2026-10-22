/**
 * Language classification fixtures: 70 documents, the seven product languages, built from paragraph
 * banks plus hand-written hard cases. Everything is fictional (made-up companies and people,
 * example.com contacts). The label is the language the document is written in.
 */

export const LANGS = ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl'] as const;
export type Lang = (typeof LANGS)[number];

export interface LanguageDoc {
  id: string;
  group: 'language';
  label: Lang;
  kind: string;
  text: string;
}

interface Bank {
  jd1: string;
  jd2: string;
  cv1: string;
  cv2: string;
  letter: string;
  snip1: string;
  snip2: string;
}

const BANKS: Record<Lang, Bank> = {
  en: {
    jd1: 'We are hiring a Customer Operations Lead to run our support team of twelve. You will own response times, build the quality review process and report to the Head of Operations. You need five years in customer support, two of them leading people, and strong written communication. Experience with Zendesk or a similar help desk tool is required.',
    jd2: 'The role sits in our logistics planning group. You will forecast weekly demand for regional warehouses, maintain the planning model in Python and SQL, and present results to the commercial team every Monday. A degree in a quantitative field and clear examples of forecasts you improved are expected. We offer flexible hours and a learning budget.',
    cv1: 'Operations coordinator with six years of experience in retail logistics. Managed inbound scheduling for three distribution centres, cut dock waiting time by 22 percent and introduced a weekly KPI review with carriers. Skilled in Excel, SQL and process documentation. Looking for a role with more analytical responsibility.',
    cv2: 'Product designer with eight years across fintech and healthcare. Led the redesign of a patient scheduling app used by 40,000 people, ran usability tests with clinicians and worked closely with engineers on a shared component library. Comfortable with research, prototyping and presenting to stakeholders.',
    letter: 'Dear Ms Carter, I am writing to apply for the Finance Analyst position advertised on your careers page. In my current role I prepare monthly forecasts and variance reports for two business units, and I would welcome the chance to bring that experience to your team. Thank you for considering my application.',
    snip1: 'Senior accountant, 9 years in manufacturing, month-end close, audit support.',
    snip2: 'Looking for a part-time role in data analysis, available from March.',
  },
  de: {
    jd1: 'Wir suchen eine Teamleitung Kundenservice für unser Team mit zwölf Mitarbeitenden. Sie verantworten die Reaktionszeiten, bauen den Qualitätsprozess auf und berichten an die Bereichsleitung. Sie bringen fünf Jahre Erfahrung im Kundenservice mit, davon zwei in der Führung, sowie eine sichere schriftliche Ausdrucksweise. Kenntnisse in Zendesk sind erforderlich.',
    jd2: 'Die Stelle gehört zu unserer Logistikplanung. Sie erstellen wöchentliche Bedarfsprognosen für die Regionallager, pflegen das Planungsmodell in Python und SQL und stellen die Ergebnisse jeden Montag dem Vertrieb vor. Ein Studium in einem quantitativen Fach und nachweisbare Verbesserungen von Prognosen setzen wir voraus. Wir bieten flexible Arbeitszeiten und ein Weiterbildungsbudget.',
    cv1: 'Disponentin mit sechs Jahren Erfahrung in der Handelslogistik. Verantwortlich für die Wareneingangsplanung an drei Distributionszentren, Reduzierung der Wartezeit an den Rampen um 22 Prozent und Einführung eines wöchentlichen Kennzahlengesprächs mit den Spediteuren. Sicher in Excel, SQL und Prozessdokumentation. Ich suche eine Aufgabe mit mehr analytischem Anteil.',
    cv2: 'Produktdesignerin mit acht Jahren Erfahrung in Fintech und Gesundheitswesen. Leitung der Neugestaltung einer Terminbuchungs-App für 40.000 Patientinnen und Patienten, Usability-Tests mit Ärzten und enge Zusammenarbeit mit der Entwicklung an einer gemeinsamen Komponentenbibliothek.',
    letter: 'Sehr geehrte Frau Keller, hiermit bewerbe ich mich auf die auf Ihrer Karriereseite ausgeschriebene Stelle als Finanzanalyst. In meiner aktuellen Position erstelle ich monatliche Prognosen und Abweichungsberichte für zwei Geschäftsbereiche. Über eine Einladung zu einem Gespräch würde ich mich sehr freuen.',
    snip1: 'Senior Buchhalter, neun Jahre in der Fertigung, Monatsabschluss, Prüfungsbegleitung.',
    snip2: 'Ich suche eine Teilzeitstelle im Bereich Datenanalyse, verfügbar ab März.',
  },
  fr: {
    jd1: 'Nous recherchons un responsable du service client pour encadrer une équipe de douze personnes. Vous serez chargé des délais de réponse, de la mise en place du contrôle qualité et du reporting auprès de la direction des opérations. Cinq ans d\'expérience en support client, dont deux en management, et une excellente expression écrite sont demandés. La maîtrise de Zendesk est indispensable.',
    jd2: 'Le poste est rattaché à notre équipe de planification logistique. Vous établirez les prévisions hebdomadaires de la demande pour les entrepôts régionaux, maintiendrez le modèle en Python et SQL et présenterez les résultats à l\'équipe commerciale chaque lundi. Une formation quantitative et des exemples concrets de prévisions améliorées sont attendus. Nous proposons des horaires flexibles et un budget de formation.',
    cv1: 'Coordinatrice des opérations avec six ans d\'expérience dans la logistique du commerce de détail. Planification des réceptions sur trois plateformes, réduction de 22 % du temps d\'attente aux quais et mise en place d\'un point hebdomadaire sur les indicateurs avec les transporteurs. À l\'aise avec Excel, SQL et la documentation des processus.',
    cv2: 'Designer produit avec huit ans d\'expérience dans la fintech et la santé. Refonte d\'une application de prise de rendez-vous utilisée par 40 000 patients, tests d\'utilisabilité avec des médecins et collaboration étroite avec les développeurs sur une bibliothèque de composants partagée.',
    letter: 'Madame, Monsieur, je vous écris pour postuler au poste d\'analyste financier publié sur votre site. Dans mon poste actuel, je prépare les prévisions mensuelles et les rapports d\'écarts pour deux unités. Je serais heureuse de mettre cette expérience au service de votre équipe. Je vous remercie de l\'attention portée à ma candidature.',
    snip1: 'Comptable senior, neuf ans dans l\'industrie, clôtures mensuelles, appui aux audits.',
    snip2: 'Je recherche un poste à temps partiel en analyse de données, disponible dès mars.',
  },
  es: {
    jd1: 'Buscamos a una persona responsable de atención al cliente para dirigir un equipo de doce personas. Se encargará de los tiempos de respuesta, de crear el proceso de revisión de calidad y de informar a la dirección de operaciones. Se piden cinco años de experiencia en soporte, dos de ellos liderando equipos, y una redacción impecable. Es imprescindible conocer Zendesk.',
    jd2: 'El puesto forma parte de nuestro equipo de planificación logística. Elaborará las previsiones semanales de demanda para los almacenes regionales, mantendrá el modelo en Python y SQL y presentará los resultados al equipo comercial cada lunes. Se valora formación cuantitativa y ejemplos claros de previsiones mejoradas. Ofrecemos horario flexible y presupuesto de formación.',
    cv1: 'Coordinadora de operaciones con seis años de experiencia en logística minorista. Planifiqué las recepciones de tres centros de distribución, reduje un 22 % el tiempo de espera en muelle e introduje una revisión semanal de indicadores con los transportistas. Dominio de Excel, SQL y documentación de procesos.',
    cv2: 'Diseñador de producto con ocho años de experiencia en tecnología financiera y salud. Dirigí el rediseño de una aplicación de citas usada por 40.000 pacientes, realicé pruebas de usabilidad con médicos y trabajé junto a ingeniería en una biblioteca de componentes compartida.',
    letter: 'Estimada señora Ramos: le escribo para presentar mi candidatura al puesto de analista financiero publicado en su página web. En mi puesto actual preparo las previsiones mensuales y los informes de desviaciones de dos unidades de negocio. Quedo a su disposición para una entrevista. Muchas gracias por su atención.',
    snip1: 'Contable sénior, nueve años en la industria, cierres mensuales, apoyo en auditorías.',
    snip2: 'Busco un puesto a tiempo parcial en análisis de datos, disponible desde marzo.',
  },
  pt: {
    jd1: 'Procuramos um responsável de apoio ao cliente para liderar uma equipa de doze pessoas. Vai ser responsável pelos tempos de resposta, pela criação do processo de revisão de qualidade e pelo reporte à direção de operações. Pedimos cinco anos de experiência em apoio ao cliente, dois deles em liderança, e boa escrita. É obrigatório conhecer o Zendesk.',
    jd2: 'A função integra a nossa equipa de planeamento logístico. Vai elaborar as previsões semanais de procura para os armazéns regionais, manter o modelo em Python e SQL e apresentar os resultados à equipa comercial todas as segundas-feiras. Valorizamos formação quantitativa e exemplos concretos de previsões melhoradas. Oferecemos horário flexível e orçamento de formação.',
    cv1: 'Coordenadora de operações com seis anos de experiência em logística de retalho. Planeei as receções de três centros de distribuição, reduzi em 22 % o tempo de espera nas docas e introduzi uma reunião semanal de indicadores com os transportadores. Domínio de Excel, SQL e documentação de processos.',
    cv2: 'Designer de produto com oito anos de experiência em tecnologia financeira e saúde. Liderei a reformulação de uma aplicação de marcação de consultas usada por 40 000 utentes, fiz testes de usabilidade com médicos e trabalhei com a engenharia numa biblioteca de componentes partilhada.',
    letter: 'Exma. Senhora Dra. Sousa, venho candidatar-me à vaga de analista financeiro publicada na vossa página. Na minha função atual preparo as previsões mensais e os relatórios de desvios de duas unidades de negócio. Ficarei muito grata por uma entrevista. Agradeço desde já a vossa atenção.',
    snip1: 'Contabilista sénior, nove anos na indústria, fecho mensal, apoio a auditorias.',
    snip2: 'Procuro um lugar a tempo parcial em análise de dados, disponível a partir de março.',
  },
  it: {
    jd1: 'Cerchiamo un responsabile del servizio clienti per guidare un team di dodici persone. Sarai responsabile dei tempi di risposta, della costruzione del processo di controllo qualità e del reporting alla direzione operativa. Servono cinque anni di esperienza nel supporto clienti, due dei quali in ruoli di coordinamento, e un\'ottima scrittura. La conoscenza di Zendesk è indispensabile.',
    jd2: 'La posizione fa parte del nostro team di pianificazione logistica. Preparerai le previsioni settimanali della domanda per i magazzini regionali, manterrai il modello in Python e SQL e presenterai i risultati al team commerciale ogni lunedì. Sono richieste una formazione quantitativa ed esempi concreti di previsioni migliorate. Offriamo orari flessibili e un budget per la formazione.',
    cv1: 'Coordinatrice operativa con sei anni di esperienza nella logistica retail. Ho pianificato gli arrivi merce di tre centri di distribuzione, ridotto del 22 % i tempi di attesa alle baie e introdotto una revisione settimanale degli indicatori con i trasportatori. Ottima conoscenza di Excel, SQL e documentazione dei processi.',
    cv2: 'Product designer con otto anni di esperienza nel fintech e nella sanità. Ho guidato il redesign di un\'app di prenotazione usata da 40.000 pazienti, condotto test di usabilità con i medici e lavorato con gli sviluppatori su una libreria di componenti condivisa.',
    letter: 'Gentile dottoressa Greco, mi candido per la posizione di analista finanziario pubblicata sul vostro sito. Nel mio ruolo attuale preparo le previsioni mensili e i report sugli scostamenti per due unità di business. Resto a disposizione per un colloquio e vi ringrazio per l\'attenzione.',
    snip1: 'Contabile senior, nove anni nel settore manifatturiero, chiusure mensili, supporto alle revisioni.',
    snip2: 'Cerco un lavoro part-time nell\'analisi dei dati, disponibile da marzo.',
  },
  nl: {
    jd1: 'Wij zoeken een teamleider klantenservice voor een team van twaalf medewerkers. Je bent verantwoordelijk voor de reactietijden, bouwt het kwaliteitsproces op en rapporteert aan het hoofd operaties. Je hebt vijf jaar ervaring in klantenservice, waarvan twee jaar als leidinggevende, en een sterke schriftelijke uitdrukkingsvaardigheid. Kennis van Zendesk is vereist.',
    jd2: 'De functie maakt deel uit van ons team logistieke planning. Je maakt wekelijkse vraagprognoses voor de regionale magazijnen, onderhoudt het planningsmodel in Python en SQL en presenteert de resultaten elke maandag aan het commerciële team. Een kwantitatieve opleiding en duidelijke voorbeelden van verbeterde prognoses verwachten wij. We bieden flexibele werktijden en een opleidingsbudget.',
    cv1: 'Operationeel coördinator met zes jaar ervaring in de logistiek van de detailhandel. Verantwoordelijk voor de planning van inkomende goederen bij drie distributiecentra, de wachttijd bij de docks met 22 procent verlaagd en een wekelijks overleg over kengetallen met de vervoerders ingevoerd. Vaardig in Excel, SQL en procesdocumentatie.',
    cv2: 'Productontwerper met acht jaar ervaring in fintech en gezondheidszorg. Leidde het nieuwe ontwerp van een afsprakenapp voor 40.000 patiënten, voerde bruikbaarheidstests uit met artsen en werkte samen met ontwikkelaars aan een gedeelde componentenbibliotheek.',
    letter: 'Geachte mevrouw De Vries, hierbij solliciteer ik naar de functie van financieel analist die op uw website staat. In mijn huidige functie maak ik maandelijkse prognoses en afwijkingsrapporten voor twee bedrijfsonderdelen. Ik kom graag langs voor een gesprek. Hartelijk dank voor uw aandacht.',
    snip1: 'Senior boekhouder, negen jaar in de maakindustrie, maandafsluiting, ondersteuning bij audits.',
    snip2: 'Ik zoek een parttimebaan in data-analyse, beschikbaar vanaf maart.',
  },
};

function composed(): LanguageDoc[] {
  const docs: LanguageDoc[] = [];
  for (const lang of LANGS) {
    const b = BANKS[lang];
    const parts: Array<[string, string]> = [
      ['jd', b.jd1],
      ['jd', b.jd2],
      ['cv', b.cv1],
      ['cv', b.cv2],
      ['letter', b.letter],
      ['snippet-short', b.snip1],
      ['snippet-short', b.snip2],
      ['jd-long', `${b.jd1}\n\n${b.jd2}\n\n${b.cv1}`],
    ];
    parts.forEach(([kind, text], i) => docs.push({ id: `${lang}-${i + 1}`, group: 'language', label: lang, kind, text }));
  }
  return docs;
}

/** Hand-written hard cases: lookalike pairs, mixed-language documents, and over-long documents. */
function hard(): LanguageDoc[] {
  const mk = (id: string, label: Lang, kind: string, text: string): LanguageDoc => ({ id, group: 'language', label, kind, text });
  const longEn = Array.from({ length: 70 }, (_, i) =>
    `Section ${i + 1}. The operations group reviews supplier performance each quarter, compares delivery windows against the agreed schedule and records every exception in the shared log. Reviewers note the root cause, the owner and the agreed fix date, and the quality manager signs off the summary before it goes to the leadership team.`,
  ).join('\n\n');
  const longDe = Array.from({ length: 70 }, (_, i) =>
    `Abschnitt ${i + 1}. Die Betriebsgruppe prüft jedes Quartal die Leistung der Lieferanten, vergleicht die Lieferfenster mit dem vereinbarten Plan und erfasst jede Abweichung im gemeinsamen Protokoll. Die Prüfer notieren Ursache, Verantwortlichen und Termin für die Behebung, und die Qualitätsleitung zeichnet die Zusammenfassung ab, bevor sie an die Geschäftsleitung geht.`,
  ).join('\n\n');
  return [
    // Portuguese vs Spanish lookalikes
    mk('hard-pt-1', 'pt', 'pt-vs-es', 'Preciso de alguém que trate da faturação e das reclamações dos clientes. O horário é das nove às cinco e o escritório fica perto da estação, em Lisboa. Quem ficar com a vaga terá de conhecer bem o Excel e ter facilidade em falar ao telefone.'),
    mk('hard-pt-2', 'pt', 'pt-vs-es', 'Gostava de me candidatar ao estágio de marketing digital. Estou a acabar a licenciatura em Comunicação, já gerei as redes sociais de uma associação local e tenho conhecimentos de design no Canva. Posso começar logo que terminar os exames.'),
    mk('hard-es-1', 'es', 'es-vs-pt', 'Necesito a alguien que se ocupe de la facturación y de las reclamaciones de los clientes. El horario es de nueve a cinco y la oficina está cerca de la estación, en Valencia. Quien ocupe el puesto deberá conocer bien Excel y tener facilidad para hablar por teléfono.'),
    mk('hard-es-2', 'es', 'es-vs-pt', 'Me gustaría presentarme a las prácticas de marketing digital. Estoy terminando el grado en Comunicación, he gestionado las redes sociales de una asociación local y tengo conocimientos de diseño con Canva. Puedo empezar en cuanto termine los exámenes.'),
    // Dutch vs German lookalikes
    mk('hard-nl-1', 'nl', 'nl-vs-de', 'Wij zoeken een medewerker planning die de routes van onze bezorgdiensten opstelt. Je werkt op kantoor in Utrecht, begint om acht uur en overlegt elke ochtend kort met de chauffeurs. Ervaring met routeplanningssoftware is een pre, maar we leiden je graag op.'),
    mk('hard-nl-2', 'nl', 'nl-vs-de', 'Ik wil graag solliciteren naar de baan als administratief medewerker. Ik heb drie jaar bij een gemeente gewerkt, ken het pakket Exact goed en ben iemand die op tijd komt en zijn afspraken nakomt. Mijn opzegtermijn is een maand.'),
    mk('hard-de-1', 'de', 'de-vs-nl', 'Wir suchen eine Mitarbeiterin in der Disposition, die die Touren unserer Lieferdienste plant. Sie arbeiten im Büro in Münster, beginnen um acht Uhr und sprechen sich jeden Morgen kurz mit den Fahrern ab. Erfahrung mit Tourenplanungssoftware ist ein Plus, wir lernen Sie aber gern an.'),
    mk('hard-de-2', 'de', 'de-vs-nl', 'Ich möchte mich gern auf die Stelle als Sachbearbeiter bewerben. Ich habe drei Jahre bei einer Stadtverwaltung gearbeitet, kenne das Programm SAP gut und bin jemand, der pünktlich kommt und seine Absprachen einhält. Meine Kündigungsfrist beträgt einen Monat.'),
    // German CV with an English skills section
    mk('hard-de-en-1', 'de', 'mixed-skills', 'Lebenslauf\n\nBerufserfahrung\nProjektleiterin, Nordlicht Software GmbH, Hamburg, seit 2019. Leitung von Softwareprojekten mit bis zu zehn Teammitgliedern, Abstimmung mit Kunden und Steuerung von Terminen und Budgets. Zuvor Entwicklerin bei einem Systemhaus in Bremen.\n\nAusbildung\nDiplom Informatik, Universität Bremen\n\nSkills\nProject management, Scrum, Kanban, stakeholder communication, risk management, Jira, Confluence, SQL, Python, cloud migration, agile coaching, budgeting, vendor management'),
    mk('hard-de-en-2', 'de', 'mixed-skills', 'Profil\nVertriebsleiter für technische Produkte mit zwölf Jahren Erfahrung im Maschinenbau. Aufbau von Vertriebskanälen in Süddeutschland und Österreich, Verantwortung für ein Team von sieben Personen, Umsatzwachstum von 15 Prozent pro Jahr.\n\nTechnical skills\nCRM (Salesforce), key account management, contract negotiation, pipeline forecasting, B2B sales, tender management, lead generation, presentation skills, market analysis\n\nSprachen\nDeutsch (Muttersprache), Englisch (fließend)'),
    // English job ads at German companies
    mk('hard-en-de-1', 'en', 'en-at-german-company', 'Rheinwerk Logistik GmbH, Köln. We are looking for a Warehouse Operations Manager to lead our site in Düsseldorf. You will manage 45 employees, plan shifts and work with the Betriebsrat on working-time agreements. Fluent German is a plus but the working language of the team is English. Salary band 62,000 to 72,000 EUR.'),
    mk('hard-en-de-2', 'en', 'en-at-german-company', 'Bergmann & Söhne Maschinenbau AG, Stuttgart. Join our international sales team as a Key Account Manager. You will look after customers in the UK and Ireland, travel to Zürich and München every month and report to the Vertriebsleiter. We offer 30 days of Urlaub, a company car and a Jobticket.'),
    // Over-long documents (the classifier keeps the first and last 12,000 characters)
    mk('hard-long-en', 'en', 'over-24k', longEn),
    mk('hard-long-de', 'de', 'over-24k', longDe),
  ];
}

export const LANGUAGE_DOCS: LanguageDoc[] = [...composed(), ...hard()];

export const EXPECTED_DOC_COUNT = 70;

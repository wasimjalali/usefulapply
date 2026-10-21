/**
 * The hand review behind src/lib/agents/claim-free-lexicon.generated.ts.
 *
 * scripts/build-claim-free-lexicon.ts proposes candidate lemmas from the UD
 * treebanks (verbs seen at least twice, adjectives and adverbs seen at least
 * five times). Every candidate was read by a person against the rubric below,
 * and the ones that fail it are listed here. Only verb and adverb candidates
 * NOT listed here are freed; adjectives are never freed, and the review only
 * decides which adjective forms need exact backing. A word that is not a candidate at all (a rare word, or one the
 * treebanks never saw) is never freed, so "orchestrated", "masterminded" or
 * "notarized" stay claims without anyone having to think of them.
 *
 * REVIEWED pins a hash of each candidate list. If a corpus or a threshold
 * changes the candidates, the build stops and prints the new words: they have
 * to be reviewed and the hash updated before anything new can be freed.
 *
 * Reviewed 2026-10-21 for PR #170 (round 2).
 */

export const RUBRIC = `A candidate is excluded when some ordinary use of it in CV prose, in any of
its forms (a participle used as an adjective included), asserts about the
applicant:
- authority over people, money or an organisation (manage, approve, hire, coordinate, organize, operate)
- a credential, qualification, licence or formal status (certify, earn, hold, study, train, register, pass)
- standing, recognition or an evaluation of the applicant (excellent, famous, recognize, exceed, win)
- proficiency in a language or skill (fluent, speak, translate, kompetent, beherrschen)
- a personal trait the CV would have to state (creative, reliable, zuverlässig, flexibel)
- scope or seniority (global, extensive, considerable, langjährig, umfassend)
- a domain, sector or field (medical, financial, legal, technisch, wirtschaftlich)
- a nationality, region, religion or language name (german, chinese, bayerisch)
Clinical and legal practice verbs (diagnose, prescribe, behandeln, operieren) are credentials.
When in doubt, exclude: a refusal costs a retry, a miss costs an interview.`;

type Category =
  | 'authority' | 'credential' | 'standing' | 'proficiency' | 'trait'
  | 'scope' | 'domain' | 'identity';

/** Space-separated lemmas per category, exactly as the treebank lemmatises them. */
type Exclusions = Partial<Record<Category, string>>;

export const EXCLUDED: Record<'en' | 'de', Record<'function' | 'verb' | 'adj' | 'adv', Exclusions>> = {
  en: {
    function: {
      // "built it myself": sole ownership.
      authority: 'herself himself myself yourself',
    },
    verb: {
      authority: `abolish acquire administer advise allocate approve assign assume authorize ban consult
        coordinate dismiss drive employ establish found govern hire incorporate initiate invest lead manage
        occupy officiate operate organize oversee recruit regulate run sign sponsor suspend terminate veto`,
      credential: `admit attain defend designate diagnose earn educate fly grant hold instruct license obtain
        pass possess prescribe publish qualify register specialize study swear teach trademark train treat`,
      standing: `accomplish achieve beat boast cite compete crush decorate defeat distinguish dominate elect
        endorse exceed exhibit feature hit honor impress inspire invent invite nominate outperform promote
        prove quote recognize recommend regard represent retire select serve succeed surpass testify trust
        volunteer win`,
      proficiency: 'interpret speak translate',
    },
    adj: {
      authority: 'direct executive own responsible',
      credential: 'fellow formal qualified',
      standing: `advanced amazing awesome basic competitive dominant effective efficient excellent
        exceptional extraordinary fabulous famous fantastic important impressive incredible marvelous
        outstanding perfect popular powerful professional revolutionary senior skilled successful superb
        superior supreme talented top unique wonderful experienced`,
      proficiency: 'comfortable familiar knowledgeable',
      trait: `ambitious attentive authentic bright calm capable careful compassionate confident courteous
        creative determined devoted eager friendly helpful honest organized reliable smart solid thorough
        wise`,
      scope: `comprehensive considerable deep double extensive foreign global independent international joint
        major minor national regional remote significant strong substantial`,
      domain: `administrative armed artistic biological chemical civil commercial corporate criminal cultural
        democratic dental digital economic educational electric electrical environmental equine federal
        ferrous financial green industrial legal liberal lunar mathematical medical mental militant military
        mobile naval nuclear operational physical political presidential private public racial regulatory
        religious republican royal scientific social spiritual technical urban wholesale fundamentalist`,
      identity: `afghan african american arab arctic asian black british canadian chinese cuban eastern
        egyptian european french gay german halal holy indian iranian iraqi irish islamic israeli italian
        japanese jewish lebanese mexican moslem muslim northeastern northern pakistani palestinian russian
        saudi shiite southern spanish sunni syrian tamil thai vietnamese western white w`,
    },
    adv: {
      authority: 'alone',
      credential: 'officially',
      standing: 'amazingly highly incredibly perfectly publicly strongly successfully',
      scope: 'abroad deeply worldwide',
      domain: 'technically',
      identity: 'indeed',
    },
  },
  de: {
    function: {
      // "selber entwickelt": sole ownership.
      authority: 'selber',
    },
    verb: {
      authority: `abdanken absegnen amtieren anführen anordnen anstellen anvertrauen beauftragen beauftragt
        befördern bekleiden berechtigen berufen beschließen beschäftigen besetzen betrauen betreiben
        bewilligen bewirtschaften delegieren dienen dominieren durchsetzen einberufen einnehmen einstellen
        engagieren entlassen entscheiden erlassen ernennen eröffnen errichten erteilen etablieren
        finanzieren freigeben fungieren führen gebieten gründen herrschen initiieren innegehabt innehatte
        investieren kommandieren kontrollieren koordinieren kündigen küren leiten lenken mitprägen
        moderieren nominieren obliegen organisieren prägen regeln regieren regulieren repräsentieren
        sponsern stationieren steuern stiften unterschreiben unterstehen unterstellen unterzeichnen
        veranstalten verhängen verpflichten vertreten verwalten vorstehen wiederwählen wählen
        zurücktreten zuteilen zuweisen`,
      credential: `ablegen abschließen absolvieren absolviert aufweisen ausbilden behandeln besitzen bestehen
        emeritiert erfinden erlangen erlernen erwerben fliegen habilitieren heilen herausgeben lehren
        mitbringen operieren patentieren pflegen praktizieren promovieren publizieren qualifizieren
        registrieren spezialisieren studieren studiert trainieren unterrichten verabreichen vereidigen
        verfassen verfügen verleihen veröffentlichen vorweisen zulassen zusprechen`,
      standing: `anerkennen aufsteigen auswählen auszeichnen avancieren beeindrucken beeindruckt beraten
        benennen besiegen bewundern bewähren beweisen debütieren ehren eingeweiht empfehlen erkämpfen
        erreichen erringen erzielen feiern fördern gewinnen inspirieren inszenieren kandidieren komponieren
        krönen loben nachweisen respektieren rühmen schätzen siegen uraufgeführt verdienen verehren weihen
        weiterempfehlen würdigen zeichnen zitieren überragen übersteigen übertreffen überzeugen überzeugt
        erreicht`,
      proficiency: 'beherrschen kennen sprechen übersetzen',
    },
    adj: {
      authority: 'stellvertretend verantwortlich zuständig geführt gegründet direkt',
      credential: 'anerkannt ehrenamtlich formell frei freiwillig gebildet geeignet offiziell erschienen herausgegeben veröffentlicht',
      standing: `amtierend außergewöhnlich außerordentlich bedeutend bekannt beliebt bemerkenswert berühmt
        effektiv einmalig einzigartig empfehlenswert entscheidend erfolgreich erstaunlich führend gewählt
        gut herausragend hervorragend maßgeblich perfekt populär professionell profiliert renommiert stark
        top unglaublich wertvoll wesentlich wichtig wunderbar zentral`,
      proficiency: 'ausgeprägt ausgesprochen erweitert fließend grundlegend kompetent sicher',
      trait: `aufmerksam autonom begeistern begeistert dynamisch eigenständig flexibel freundlich gepflegt
        hilfsbereit kreativ ruhig selbständig zuverlässig zuvorkommend`,
      scope: `ausgedehnt ausschließlich doppelt einzig erheblich gesamt intensiv interdisziplinär international
        jahrelang jährig jährigen langjährig regional reichlich tief umfangreich umfassend vielfältig
        weltweit überregional`,
      domain: `akademisch amtlich analytisch archäologisch beruflich betrieblich bewaffnet bildend chemisch
        demokratisch elektrisch elektronisch fachlich finanziell gemeinnützig geografisch geographisch
        gerichtlich geschichtlich gesellschaftlich gesetzlich ideologisch industriell juristisch kommerziell
        kommunistisch konservativ kulturell künstlerisch künstlich landwirtschaftlich linear literarisch
        mechanisch medizinisch militärisch mobil musikalisch nachhaltig naturwissenschaftlich operativ
        organisatorisch philosophisch physikalisch politisch privat psychisch rechtlich republikanisch
        sozial staatlich statistisch strategisch studentisch städtisch technisch touristisch wirtschaftlich
        wissenschaftlich zivil öffentlich ökologisch ökonomisch`,
      identity: `afrikanisch amerikanisch arabisch asiatisch australisch badisch barock bayerisch belgisch
        bonner brasilianisch britisch böhmisch chinesisch christlich dänisch deutsch deutschsprachig
        englisch estnisch ethnisch europäisch evangelisch finnisch französisch gotisch griechisch hebräisch
        indisch irakisch irisch islamisch isländisch israelisch italienisch japanisch jüdisch kaiserlich
        kanadisch katholisch keltisch kirchlich kroatisch kölner königlich lateinamerikanisch lateinisch
        lutherisch mexikanisch niederländisch niedersächsisch nordwestlich nordöstlich norwegisch nördlich
        orthodox philippinisch polnisch portugiesisch preußisch protestantisch päpstlich reformiert religiös
        romanisch russisch römisch schottisch schwedisch slawisch sowjetisch spanisch syrisch sächsisch
        südafrikanisch südlich südwestlich südöstlich tschechisch türkisch ukrainisch ungarisch westfälisch
        westlich ägyptisch österreichisch östlich`,
    },
    adv: {
      authority: 'allein selbst',
      standing: 'überaus äußerst',
    },
  },
};

/**
 * Single forms of a kept lemma whose ADJECTIVE reading carries a claim: a
 * participle or base form that also describes a person ("committed",
 * "articulate", "bemüht", "vernetzt"). Found by reviewing every freed verb form
 * that WordNet lists as an adjective (English) or GSD tags as one (German).
 * German entries are stems: every adjective ending is excluded with them.
 * Bare lemmas ("articulate", "überlegen") need no entry: the build never
 * frees a bare verb lemma.
 */
export const EXCLUDED_FORMS: Record<'en' | 'de', Exclusions> = {
  en: {
    standing: 'compelling connected convincing promising sought',
    trait: 'articulated assured born committed composed devoted engaging',
  },
  de: {
    standing: 'bedeutend vernetzt',
    proficiency: 'ausgesprochen eingehend gewandt',
    credential: 'geeignet',
    trait: 'bemueht zuvorkommend',
  },
};

/**
 * sha256 of each sorted candidate list the review above covered. The build
 * refuses to run when a list changes, so no unreviewed word is ever freed.
 */
export const REVIEWED: Record<string, string> = {
  'en:verb': 'ec389c699fc3a65b7205e76fd6bfc40ea204bef5350075318abd0e9ee35c9d6a',
  'en:adj': '133e5ce2d2a8518e727280106c860e508f44e0b839b157fd9bf88af5d2646e1b',
  'en:adv': 'ccc8948e1a5b4880e5a6c71c96f493fcc3586b1d256563e3df65c4950787ff92',
  'de:verb': '8a133fc3f56b0632fa40bbb368628210878fe4252bea2d068c2be5a91efc651e',
  'de:adj': '2c0ff05de40bd6d8c1a58161057578df101a926ef0c659ca6dfa0972bfb17230',
  'de:adv': '4eb4c5ca3b3f5c46119c5c774a2a74c82686611df9d317ba8fd1a4322133660f',
  'en:function': '7d7d69adf9ff77ebde2ed16018e600aa9534f14b0ef6a86d1c087eb7b0266ca7',
  'de:function': '6d58726a4bd3d492f2b89500f03bf5c394c10e6b317cdb193e7d0b5058455af1',
};

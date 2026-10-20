import type { CvTextLocale } from '@/lib/cv-templates/locale';

/**
 * The words an exported document carries outside the CV itself: file names, PDF
 * titles and subjects, the page footer and the document language, for every
 * language the product writes in. `other` (a language with no table) gets English.
 *
 * File name words are ASCII (they go in a name an ATS and a mail client both accept);
 * the applicant's own name keeps its letters in `filename*`.
 */
export interface ExportText {
  /** BCP 47, for the PDF `/Lang`, the DOCX language and `<html lang>`. */
  bcp47: string;
  /** Two-letter code for `<html lang>`. */
  htmlLang: string;
  cvTitle: (name: string) => string;
  cvSubject: string;
  letterTitle: (name: string) => string;
  letterSubject: string;
  answersTitle: string;
  /** "Name · Page 2 of 3". */
  footer: (name: string, page: number, total: number) => string;
  /** File name pieces around the applicant's name: [prefix, suffix]. */
  fileCv: [string, string];
  fileLetter: [string, string];
  fileEmails: [string, string];
  fileAnswers: [string, string];
}

type Entry = Omit<ExportText, 'cvTitle' | 'letterTitle' | 'footer'> & {
  cvWord: string;
  letterWord: string;
  /** Where the name goes in the title: before the word ("Jane Doe - CV") or after ("Lebenslauf - Jane Doe"). */
  nameFirst: boolean;
  pageWord: string;
  ofWord: string;
};

const TABLE: Record<Exclude<CvTextLocale, 'other'>, Entry> = {
  en: {
    bcp47: 'en-US', htmlLang: 'en', cvWord: 'CV', letterWord: 'Cover Letter', nameFirst: true, pageWord: 'Page', ofWord: 'of',
    cvSubject: 'Curriculum vitae', letterSubject: 'Cover letter', answersTitle: 'Screening answers',
    fileCv: ['', '_CV'], fileLetter: ['', '_Cover_Letter'], fileEmails: ['', '_Emails'], fileAnswers: ['', '_Screening_Answers'],
  },
  de: {
    bcp47: 'de-DE', htmlLang: 'de', cvWord: 'Lebenslauf', letterWord: 'Anschreiben', nameFirst: false, pageWord: 'Seite', ofWord: 'von',
    cvSubject: 'Lebenslauf', letterSubject: 'Anschreiben', answersTitle: 'Screening-Antworten',
    fileCv: ['Lebenslauf_', ''], fileLetter: ['Anschreiben_', ''], fileEmails: ['E-Mails_', ''], fileAnswers: ['Screening-Antworten_', ''],
  },
  fr: {
    bcp47: 'fr-FR', htmlLang: 'fr', cvWord: 'CV', letterWord: 'Lettre de motivation', nameFirst: false, pageWord: 'Page', ofWord: 'sur',
    cvSubject: 'Curriculum vitae', letterSubject: 'Lettre de motivation', answersTitle: 'Réponses de présélection',
    fileCv: ['CV_', ''], fileLetter: ['Lettre_de_motivation_', ''], fileEmails: ['E-mails_', ''], fileAnswers: ['Reponses_de_preselection_', ''],
  },
  es: {
    bcp47: 'es-ES', htmlLang: 'es', cvWord: 'CV', letterWord: 'Carta de presentación', nameFirst: false, pageWord: 'Página', ofWord: 'de',
    cvSubject: 'Curriculum vitae', letterSubject: 'Carta de presentación', answersTitle: 'Respuestas de selección',
    fileCv: ['CV_', ''], fileLetter: ['Carta_de_presentacion_', ''], fileEmails: ['Correos_', ''], fileAnswers: ['Respuestas_de_seleccion_', ''],
  },
  pt: {
    bcp47: 'pt-PT', htmlLang: 'pt', cvWord: 'CV', letterWord: 'Carta de apresentação', nameFirst: false, pageWord: 'Página', ofWord: 'de',
    cvSubject: 'Curriculum vitae', letterSubject: 'Carta de apresentação', answersTitle: 'Respostas de triagem',
    fileCv: ['CV_', ''], fileLetter: ['Carta_de_apresentacao_', ''], fileEmails: ['E-mails_', ''], fileAnswers: ['Respostas_de_triagem_', ''],
  },
  it: {
    bcp47: 'it-IT', htmlLang: 'it', cvWord: 'CV', letterWord: 'Lettera di presentazione', nameFirst: false, pageWord: 'Pagina', ofWord: 'di',
    cvSubject: 'Curriculum vitae', letterSubject: 'Lettera di presentazione', answersTitle: 'Risposte di selezione',
    fileCv: ['CV_', ''], fileLetter: ['Lettera_di_presentazione_', ''], fileEmails: ['E-mail_', ''], fileAnswers: ['Risposte_di_selezione_', ''],
  },
  nl: {
    bcp47: 'nl-NL', htmlLang: 'nl', cvWord: 'CV', letterWord: 'Sollicitatiebrief', nameFirst: false, pageWord: 'Pagina', ofWord: 'van',
    cvSubject: 'Curriculum vitae', letterSubject: 'Sollicitatiebrief', answersTitle: 'Screeningantwoorden',
    fileCv: ['CV_', ''], fileLetter: ['Sollicitatiebrief_', ''], fileEmails: ['E-mails_', ''], fileAnswers: ['Screeningantwoorden_', ''],
  },
};

export function exportText(locale: CvTextLocale): ExportText {
  const entry = TABLE[locale === 'other' ? 'en' : locale];
  const title = (word: string) => (name: string) => (entry.nameFirst ? `${name} - ${word}` : `${word} - ${name}`);
  return {
    bcp47: entry.bcp47,
    htmlLang: entry.htmlLang,
    cvTitle: title(entry.cvWord),
    cvSubject: entry.cvSubject,
    letterTitle: title(entry.letterWord),
    letterSubject: entry.letterSubject,
    answersTitle: entry.answersTitle,
    footer: (name, page, total) => `${name} · ${entry.pageWord} ${page} ${entry.ofWord} ${total}`,
    fileCv: entry.fileCv,
    fileLetter: entry.fileLetter,
    fileEmails: entry.fileEmails,
    fileAnswers: entry.fileAnswers,
  };
}

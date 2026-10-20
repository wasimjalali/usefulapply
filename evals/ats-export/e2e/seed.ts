/**
 * Seeds the LOCAL simulated D1 (never remote) with one application that has a
 * full kit, for the web download E2E. The account is a throwaway test account
 * on the local dev server. Everything it writes goes through wrangler's local
 * state in .wrangler/state of this checkout.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { US_LETTER, US_ONE_PAGE } from '../fixtures';

export const TEST_EMAIL = 'e2e-export@example.test';
export const TEST_PASSWORD = 'E2e-test-Passw0rd!';
export const REPO_ROOT = join(__dirname, '..', '..', '..');
export const APPLICATION_ID = '5d2f6c1e-8a3b-4c57-9e21-3b7a1f0c9d11';

const sql = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'`;
const text = (value: string) => `'${value.replace(/'/g, "''")}'`;

function d1(command: string) {
  const file = join(tmpdir(), `seed-${Date.now()}.sql`);
  writeFileSync(file, command);
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'usefulapply-db', '--local', '--file', file], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function verifyEmail(email: string = TEST_EMAIL) {
  d1(`UPDATE user SET email_verified = 1 WHERE email = ${text(email)};`);
}

export function userIdFor(email: string = TEST_EMAIL): string {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'usefulapply-db', '--local', '--json', '--command', `SELECT id FROM user WHERE email = ${text(email)}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return parsed[0].results[0].id as string;
}

const d = (raw: string) => ({ raw, confidence: 'high' });

export function seedKit(userId: string) {
  const cv = US_ONE_PAGE;
  const structured = {
    id: 'cv-e2e', version: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', sourceFileName: 'cv.pdf', sourceFormat: 'pdf',
    settings: { region: 'US', includePhoto: false, pageSize: 'letter', maxPages: 1, language: 'en' },
    personal: { fullName: cv.personal.fullName, email: cv.personal.email, phone: cv.personal.phone, currentTitle: cv.personal.currentTitle, city: cv.personal.city, country: cv.personal.country, linkedIn: cv.personal.linkedIn, github: cv.personal.github },
    summary: cv.summary,
    experience: cv.experience.map((e) => ({ id: e.id, company: e.company, position: e.position, location: e.location, startDate: d(e.startDate), endDate: e.endDate ? d(e.endDate) : undefined, current: Boolean(e.current), bullets: e.bullets })),
    education: cv.education.map((e) => ({ id: e.id, institution: e.institution, degree: e.degree, field: e.field, endDate: e.endDate ? d(e.endDate) : undefined })),
    skills: cv.skills.map((s, i) => ({ id: `s${i}`, category: s.category, skills: s.items })),
    certifications: cv.certifications.map((c) => ({ id: c.id, name: c.name, issuer: c.issuer })),
    languages: cv.languages.map((l, i) => ({ id: `l${i}`, language: l.language, proficiency: l.proficiency })),
  };
  const optimized = {
    personal: { fullName: cv.personal.fullName, email: cv.personal.email, phone: cv.personal.phone, currentTitle: cv.personal.currentTitle, city: cv.personal.city, country: cv.personal.country, linkedIn: cv.personal.linkedIn, github: cv.personal.github },
    summary: cv.summary,
    experience: cv.experience,
    education: cv.education,
    skills: cv.skills,
    languages: cv.languages,
    certifications: cv.certifications,
    analysis: { summary: 'Tailored.', key_changes: [], ats_compatibility: 92, missing_keywords_added: [] },
  };
  const letterBody = [US_LETTER.sender.name, ...US_LETTER.sender.addressLines, '', US_LETTER.date, '', US_LETTER.recipient.companyName, '', US_LETTER.salutation, '', ...US_LETTER.paragraphs, '', US_LETTER.closing, US_LETTER.signatureName].join('\n');
  const coverLetter = {
    applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
    date: '', companyAddress: { companyName: '' }, salutation: '', body: letterBody, closing: '', signatureName: '',
    structured: US_LETTER,
  };
  const now = new Date().toISOString();
  const now2 = text(now);
  d1(`
DELETE FROM application_sessions WHERE id = ${text(APPLICATION_ID)};
DELETE FROM documents WHERE user_id = ${text(userId)};
INSERT INTO documents (id, user_id, type, file_name, file_type, sections, all_skills, all_experiences, all_education, structured_data, created_at, updated_at)
VALUES ('doc-e2e', ${text(userId)}, 'primary_cv', 'cv.pdf', 'pdf', '{}', '[]', '[]', '[]', ${sql(structured)}, ${now2}, ${now2});
INSERT INTO application_sessions (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits, generated_cv, cover_letter, email, selected_template, status, generation_completed, generation_status, created_at, updated_at)
VALUES (${text(APPLICATION_ID)}, ${text(userId)}, 'Senior Backend Engineer', 'Harbor Freight Technologies', 'Build and run our logistics platform.', '[]', '[]', '[]', '[]',
  ${sql({ content: 'Tailored CV', changes: [], optimizedFor: 'Senior Backend Engineer', _optimizedCVData: optimized })},
  ${sql(coverLetter)}, ${sql({ subject: 'Application: Senior Backend Engineer', body: 'Dear Ms. Raman, please find my application attached.' })},
  'premium-ats', 'drafted', 1, 'succeeded', ${now2}, ${now2});
`);
}

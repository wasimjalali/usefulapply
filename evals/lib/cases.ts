import fs from 'node:fs';
import path from 'node:path';

const EVALS = path.resolve(__dirname, '..');

export interface CaseRow {
  id: string;
  origin: 'owner' | 'synthetic';
  language: 'en' | 'de';
  tags: string[];
  jd?: string;
  jd_ref?: string;
  cv_ref: string;
  source_url: string | null;
  notes: string;
}

export interface ResolvedCase extends CaseRow {
  jdText: string;
  jobTitleHint: string | null;
  cvText: string;
  masterCvText: string | null;
}

export function loadCases(file: string): CaseRow[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CaseRow);
}

export function resolveCase(c: CaseRow): ResolvedCase {
  let jdText = c.jd ?? '';
  let jobTitleHint: string | null = null;
  if (!jdText && c.jd_ref) {
    const m = c.jd_ref.match(/^private:([^#]+)#(.+)$/);
    if (!m) throw new Error(`Bad jd_ref ${c.jd_ref}`);
    const all = JSON.parse(fs.readFileSync(path.join(EVALS, 'private', m[1]), 'utf8')) as Record<string, { job_title: string; job_description: string }>;
    const row = all[m[2]];
    if (!row) throw new Error(`jd_ref ${c.jd_ref} not found`);
    jdText = row.job_description;
    jobTitleHint = row.job_title;
  }
  let cvText: string;
  let masterCvText: string | null = null;
  if (c.cv_ref.startsWith('private:')) {
    const docs = JSON.parse(fs.readFileSync(path.join(EVALS, 'private', c.cv_ref.slice('private:'.length)), 'utf8')) as Array<{ type: string; raw_text: string }>;
    cvText = docs.find((d) => d.type === 'primary_cv')!.raw_text;
    masterCvText = docs.find((d) => d.type === 'master_cv')?.raw_text ?? null;
  } else if (c.cv_ref.startsWith('cv:')) {
    cvText = fs.readFileSync(path.join(EVALS, 'dataset', 'cvs', `${c.cv_ref.slice(3)}.txt`), 'utf8');
  } else {
    throw new Error(`Bad cv_ref ${c.cv_ref}`);
  }
  if (!jdText) throw new Error(`Case ${c.id} has no JD text`);
  return { ...c, jdText, jobTitleHint, cvText, masterCvText };
}

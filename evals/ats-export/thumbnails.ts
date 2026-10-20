/**
 * Regenerates the template picker thumbnails in public/templates/ from the real export, page 1 of a sample CV
 * ("Alex Morgan", invented, the same persona the original thumbnails show) at 3200 px high.
 *
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/thumbnails.ts <templateId>...
 *
 * With no ids it does all six. The portrait is a crop of the one in the original german-ats thumbnail.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveExport } from '../../src/lib/services/export/resolve';
import { renderExport } from '../../src/lib/services/export/render';
import type { CVData } from '../../src/lib/cv-templates/types';
import { TEMPLATE_IDS } from './fixtures';
import { ensureWorker, loadFontFromDisk, REPO_ROOT, workerBinding } from './lib/render';
import { kitFor } from './render-all';

const portrait = `data:image/jpeg;base64,${readFileSync(join(__dirname, 'fixtures', 'thumbnail-portrait.jpg')).toString('base64')}`;

const job = (id: string, position: string, company: string, location: string, startDate: string, endDate: string | undefined, bullets: string[], current = false) => ({
  id, position, company, location, startDate, endDate, current, bullets,
});

const ALEX: CVData = {
  language: 'en',
  personal: {
    fullName: 'Alex Morgan',
    email: 'alex.morgan@email.com',
    phone: '(415) 555-0182',
    currentTitle: 'Senior Product Manager',
    city: 'San Francisco',
    country: 'United States',
    linkedIn: 'https://www.linkedin.com/in/alex-morgan-example',
    github: 'https://github.com/alex-morgan-example',
    photoUrl: portrait,
  },
  summary:
    'Results-driven Senior Product Manager with 6 years of experience leading cross-functional teams to ship data-driven SaaS products. Proven track record of growing user engagement by 40% and reducing churn through iterative discovery and rapid experimentation. Passionate about turning ambiguous problems into clear, measurable roadmaps.',
  experience: [
    job('e1', 'Senior Product Manager', 'TechFlow Inc.', 'San Francisco, CA', 'Jan 2022', undefined, [
      'Led end-to-end delivery of a B2B analytics dashboard serving 12,000+ monthly active users',
      'Increased feature adoption by 38% through targeted onboarding redesign based on user interviews',
      'Managed a team of 4 engineers and 2 designers across 2-week sprint cycles',
      'Reduced customer churn by 22% by identifying and addressing top friction points via Mixpanel data',
    ], true),
    job('e2', 'Product Manager', 'Cloudera Inc.', 'Seattle, WA', 'Jun 2019', 'Dec 2021', [
      'Owned the mobile app roadmap for a 500K-user consumer product, shipping 3 major releases per year',
      'Collaborated with Sales and Customer Success to define enterprise tier features, contributing to $2M ARR growth',
      'Ran 15+ usability tests that directly informed prioritization decisions',
    ]),
  ],
  education: [
    { id: 'd1', institution: 'Stanford University', degree: 'M.S.', field: 'Information Systems', startDate: '2015', endDate: '2019' },
    { id: 'd2', institution: 'University of Michigan', degree: 'B.S.', field: 'Computer Science', startDate: '2011', endDate: '2015' },
  ],
  skills: [
    { category: 'Product', items: ['Roadmap Planning', 'User Research', 'A/B Testing', 'Agile/Scrum', 'OKRs'] },
    { category: 'Technical', items: ['SQL', 'Figma', 'Mixpanel', 'Jira', 'REST APIs'] },
    { category: 'Soft Skills', items: ['Stakeholder Management', 'Cross-functional Leadership', 'Data Analysis'] },
  ],
  languages: [{ language: 'English', proficiency: 'Native' }, { language: 'Spanish', proficiency: 'Intermediate' }],
  certifications: [
    { id: 'c1', name: 'Professional Scrum Product Owner I (PSPO I)', issuer: 'Scrum.org', date: '2021' },
    { id: 'c2', name: 'Google Analytics Individual Qualification', issuer: 'Google', date: '2020' },
  ],
  projects: [{ id: 'p1', name: 'Internal AI Triage Tool', description: 'Built a GPT-4-powered support ticket classifier that reduced first-response time by 60%. Integrated with Zendesk via REST API.', technologies: ['GPT-4', 'REST API', 'Zendesk'] }],
};

async function main() {
  const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [...TEMPLATE_IDS];
  await ensureWorker();
  const deps = { browser: workerBinding([]), loadFont: loadFontFromDisk };
  const dir = mkdtempSync(join(tmpdir(), 'thumbs-'));
  for (const templateId of ids) {
    const kit = kitFor({ cv: ALEX, originalCv: ALEX, applicantName: ALEX.personal.fullName, photoDataUri: portrait });
    const rendered = await renderExport(resolveExport(kit, 'cv_pdf', { templateId, ...(templateId.startsWith('german') ? { paper: 'a4' as const } : {}) }), deps);
    const pdf = join(dir, `${templateId}.pdf`);
    writeFileSync(pdf, rendered.bytes);
    const out = join(REPO_ROOT, 'public', 'templates', `${templateId}.png`);
    // Page 1 only, 3200 px high, the width follows the paper.
    execFileSync('pdftoppm', ['-png', '-singlefile', '-f', '1', '-l', '1', '-scale-to-y', '3200', '-scale-to-x', '-1', pdf, out.replace(/\.png$/, '')]);
    console.log(templateId, out);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

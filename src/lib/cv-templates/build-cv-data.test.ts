/**
 * Regression cover for the heading a source CV repeats across sections.
 * The shape here is the real one from a parsed CV whose source combined
 * certifications and languages under one "Certifications & Languages" heading.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCvData } from './build-cv-data';
import type { CVData } from './types';
import type { StructuredCV } from '@/lib/types/cv-schema';

function combinedHeadingCV(): StructuredCV {
  return {
    id: 'cv-1',
    version: 1,
    createdAt: '2026-08-28T10:58:36.932Z',
    updatedAt: '2026-08-28T10:58:36.932Z',
    settings: {},
    personal: { fullName: 'Wasim Jalali', email: 'w@example.com', phone: '' },
    summary: 'AI engineer.',
    experience: [{ id: 'exp-1', company: 'Useful Apply', position: 'AI Specialist', bullets: [] }],
    education: [{ id: 'edu-1', institution: 'Uni', degree: 'BSc' }],
    skills: [{ id: 'sk-1', category: 'AI Tools', items: ['Claude'] }],
    languages: [
      { id: 'lang-1', language: 'Dari/Persian', proficiency: 'Native' },
      { id: 'lang-2', language: 'German', proficiency: 'B2, Certified' },
    ],
    certifications: [{ id: 'cert-1', name: 'AI Fluency', issuer: 'Anthropic' }],
    projects: [{ id: 'proj-1', name: 'Useful Voice', description: 'macOS dictation app', technologies: ['Swift'] }],
    additionalSections: [
      {
        id: 'add-1',
        title: 'Certifications & Languages',
        items: ["Driver's License: Class B", 'Valid German residence permit'],
      },
    ],
    sectionHeaders: {
      summary: 'Profile',
      skills: 'Skills',
      experience: 'Experience',
      education: 'Education',
      certifications: 'Certifications & Languages',
      languages: 'Certifications & Languages',
      contact: 'CONTACT',
      additionalInfo: 'ADDITIONAL INFORMATION',
      projects: 'Projects',
    },
  } as unknown as StructuredCV;
}

function build(structuredCV: StructuredCV): CVData {
  const data = buildCvData({ structuredCV, showOptimized: false });
  assert.ok(data, 'buildCvData returned null');
  return data;
}

test('a heading shared by two rendered sections is dropped from both', () => {
  const data = build(combinedHeadingCV());
  assert.equal(data.sectionHeaders?.certifications, undefined);
  assert.equal(data.sectionHeaders?.languages, undefined);
});

test('a catch-all section repeating a heading is folded into additionalInfo', () => {
  const data = build(combinedHeadingCV());
  assert.deepEqual(data.customSections, undefined);
  assert.deepEqual(data.additionalInfo, ["Driver's License: Class B", 'Valid German residence permit']);
  assert.equal(data.sectionHeaders?.additionalInfo, 'ADDITIONAL INFORMATION');
});

test('headings that are already distinct are left alone', () => {
  const cv = combinedHeadingCV();
  cv.sectionHeaders!.certifications = 'Certifications';
  cv.sectionHeaders!.languages = 'Languages';
  cv.additionalSections = [{ id: 'add-1', title: 'Volunteer Experience', items: ['Coached a robotics club'] }];

  const data = build(cv);
  assert.equal(data.sectionHeaders?.certifications, 'Certifications');
  assert.equal(data.sectionHeaders?.languages, 'Languages');
  assert.equal(data.customSections?.[0]?.title, 'Volunteer Experience');
  assert.equal(data.additionalInfo, undefined);
});

test('an unrendered section never costs another its heading', () => {
  const cv = combinedHeadingCV();
  cv.languages = [];
  cv.additionalSections = [];

  const data = build(cv);
  assert.equal(data.sectionHeaders?.certifications, 'Certifications & Languages');
});

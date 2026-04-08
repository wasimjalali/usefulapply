/**
 * CV Data Parser
 * Converts StructuredCV (from AI parsing) to CVData format for template rendering
 */

import type { CVData } from './types';
import type { StructuredCV } from '@/lib/types/cv-schema';

/**
 * Convert StructuredCV to CVData format
 */
export function structuredCVToCVData(cv: StructuredCV): CVData {
  return {
    personal: {
      fullName: cv.personal.fullName,
      email: cv.personal.email,
      phone: cv.personal.phone,
      currentTitle: cv.personal.currentTitle, // Job title/tagline
      address: cv.personal.address,
      city: cv.personal.city,
      country: cv.personal.country,
      linkedIn: cv.personal.linkedIn,
      website: cv.personal.website,
      github: cv.personal.github,
      photoUrl: cv.personal.photoUrl,
      dateOfBirth: cv.personal.dateOfBirth,
      nationality: cv.personal.nationality,
    },
    summary: cv.summary,
    experience: cv.experience.map(exp => ({
      id: exp.id,
      company: exp.company,
      position: exp.position,
      location: exp.location,
      // CVDate objects may be plain objects from JSONB (null-safe access)
      startDate: typeof exp.startDate === 'object' && exp.startDate ? exp.startDate.raw : (exp.startDate as unknown as string) || '',
      endDate: typeof exp.endDate === 'object' && exp.endDate ? exp.endDate.raw : (exp.endDate as unknown as string) || undefined,
      current: exp.current,
      bullets: exp.bullets,
    })),
    education: cv.education.map(edu => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field,
      location: edu.location,
      startDate: typeof edu.startDate === 'object' && edu.startDate ? edu.startDate.raw : (edu.startDate as unknown as string) || undefined,
      endDate: typeof edu.endDate === 'object' && edu.endDate ? edu.endDate.raw : (edu.endDate as unknown as string) || undefined,
      grade: edu.grade,
      highlights: edu.highlights,
    })),
    skills: cv.skills.map(skill => ({
      category: skill.category,
      items: skill.skills,
    })),
    languages: cv.languages.map(lang => ({
      language: lang.language,
      proficiency: lang.proficiency,
      certification: lang.certification,
    })),
    certifications: cv.certifications.map(cert => ({
      id: cert.id,
      name: cert.name,
      issuer: cert.issuer,
      date: typeof cert.date === 'object' && cert.date ? cert.date.raw : (cert.date as unknown as string) || undefined,
      credentialId: cert.credentialId,
    })),
    projects: cv.projects?.map(proj => ({
      id: proj.id,
      name: proj.name,
      description: proj.description,
      technologies: proj.technologies,
      url: proj.url,
    })),
    additionalInfo: (() => {
      const items = cv.additionalSections
        ?.filter(s => s.title.toLowerCase() === 'additional information')
        .flatMap(s => s.items);
      return items && items.length > 0 ? items : undefined;
    })(),
    customSections: (() => {
      const sections = cv.additionalSections
        ?.filter(s => s.title.toLowerCase() !== 'additional information')
        .map(s => ({ id: s.id, title: s.title, items: s.items }));
      return sections && sections.length > 0 ? sections : undefined;
    })(),
    sectionHeaders: cv.sectionHeaders,
    localizedStrings: cv.localizedStrings,
  };
}

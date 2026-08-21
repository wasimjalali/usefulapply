/**
 * Server-safe catalog of the CV templates: id, display name, market and what
 * each one is for. The chat tools need this on the Worker, so it must never
 * import a client component. It derives from CV_TEMPLATE_DEFINITIONS (plain
 * data, no React) so the ids can never drift from what the strip renders.
 */

import { CV_TEMPLATE_DEFINITIONS } from './types';
import { FALLBACK_TEMPLATE_ID } from './default-template';

export interface CvTemplateCatalogEntry {
  id: string;
  /** What the template strip shows. The default carries a star in the definitions. */
  name: string;
  /** The job market the layout is built for. */
  market: string;
  /** The short "best for" line the strip shows under the name. */
  bestFor: string;
}

/** Matches TemplateStrip: the definitions star the default, the strip tags it instead. */
function cleanName(name: string): string {
  return name.replace(/^[^\w]+/, '').trim();
}

const MARKETS: Record<string, string> = {
  US: 'US and global (Letter)',
  EU: 'EU (A4, with photo)',
};

const BEST_FOR: Record<string, string> = {
  'premium-ats': 'Recommended, corporate portals and online applications',
  'modern-professional': 'Tech and startups',
  'executive': 'Senior and leadership roles',
  'german-ats': 'DACH and NL, two columns with photo',
  'german-classic': 'DACH and NL, one column with photo',
  'classic-green': 'Any industry, forest green accent',
};

export const CV_TEMPLATE_CATALOG: CvTemplateCatalogEntry[] = CV_TEMPLATE_DEFINITIONS.map((template) => ({
  id: template.id,
  name: cleanName(template.name),
  market: MARKETS[template.region] ?? template.region,
  bestFor: BEST_FOR[template.id] ?? '',
}));

export const CV_TEMPLATE_IDS: string[] = CV_TEMPLATE_CATALOG.map((template) => template.id);

export function isCvTemplateId(value: unknown): value is string {
  return typeof value === 'string' && CV_TEMPLATE_IDS.includes(value);
}

/**
 * The display name for an id, or null when the id is unset or a legacy one
 * that is no longer in the catalog. Never guesses: a confident wrong template
 * name is worse than "not set", and the prompt tells the model not to invent.
 */
export function cvTemplateName(id: string | null | undefined): string | null {
  return CV_TEMPLATE_CATALOG.find((template) => template.id === id)?.name ?? null;
}

/** The name to show when nothing is stored: the default the canvas renders. */
export function defaultCvTemplateName(): string {
  return cvTemplateName(FALLBACK_TEMPLATE_ID) ?? FALLBACK_TEMPLATE_ID;
}

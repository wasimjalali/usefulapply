import type { ReactNode } from 'react';

export interface GeoFaq {
  q: string;
  a: string;
}

export interface GeoSection {
  /** Tailwind background class for the section, or '' for none. */
  bg: string;
  eyebrow: string;
  heading: string;
  /** Centered header block (used by grid sections). */
  centered?: boolean;
  /** Wrap the body in a delayed ScrollReveal. */
  reveal?: boolean;
  body: ReactNode[];
}

export interface GeoContent {
  title: string;
  description: string;
  /** Route path, also the canonical URL path. */
  path: string;
  /** Visible breadcrumb label for this page. */
  crumb: string;
  /** Breadcrumb JSON-LD name when it differs from `crumb`. */
  jsonLdCrumb?: string;
  /** The hub page has one breadcrumb level fewer. */
  hub?: boolean;
  published: string;
  modified: string;
  articleHeadline: string;
  articleDescription: string;
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    leadMb4?: boolean;
    extra?: ReactNode;
    cta?: { label: string; arrow: boolean };
  };
  /** JSON-LD objects rendered between the breadcrumb and the article. */
  extraJsonLd?: object[];
  sections: GeoSection[];
  links?: {
    bg: string;
    items: { href: string; label: string }[];
  };
  faqs: GeoFaq[];
  faqSection: { bg: string; cardBg: string };
  cta: {
    heading: string;
    body: string;
    button?: { label: string; arrow: boolean };
    actions?: ReactNode;
  };
}

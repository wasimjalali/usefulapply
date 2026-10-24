import { createElement, type ComponentType, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { SEO_SITE_URL } from '@/lib/seo/site-url';
import type { GeoContent, GeoSection } from './types';

const SITE_URL = SEO_SITE_URL;
const HUB_PATH = '/ai-job-application';

// createElement with spread children can't see ScrollReveal's required `children` prop.
const Reveal = ScrollReveal as ComponentType<{ delay?: number; children?: ReactNode }>;

export function geoMetadata(c: GeoContent): Metadata {
  return buildPageMetadata({
    title: c.title,
    description: c.description,
    canonical: c.path,
  });
}

// `<` is escaped so a `</script>` or `<!--` in page copy can never end the tag early.
function jsonLdScript(data: object) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

function CenteredHeader({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  return (
    <ScrollReveal>
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">{eyebrow}</p>
        <h2 className="text-3xl md:text-4xl font-bold text-brand">{heading}</h2>
      </div>
    </ScrollReveal>
  );
}

function contentSection(s: GeoSection) {
  const header = s.centered ? (
    <CenteredHeader eyebrow={s.eyebrow} heading={s.heading} />
  ) : (
    <ScrollReveal>
      <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-3">{s.eyebrow}</p>
      <h2 className="text-3xl md:text-4xl font-bold text-brand mb-6">{s.heading}</h2>
    </ScrollReveal>
  );
  // Spread (not nested) so the children stay a flat static list, as in the original pages.
  const inner = s.reveal ? [createElement(Reveal, { delay: 150 }, ...s.body)] : s.body;
  return createElement(
    'section',
    { className: 'py-16 px-4 sm:px-6 lg:px-8' + (s.bg ? ' ' + s.bg : '') },
    createElement('div', { className: 'max-w-5xl mx-auto' }, header, ...inner),
  );
}

export function GeoPage({ content: c }: { content: GeoContent }) {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: c.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'AI Job Application',
        item: `${SITE_URL}${HUB_PATH}`,
      },
      ...(c.hub
        ? []
        : [
            {
              '@type': 'ListItem',
              position: 3,
              name: c.jsonLdCrumb ?? c.crumb,
              item: `${SITE_URL}${c.path}`,
            },
          ]),
    ],
  };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.articleHeadline,
    description: c.articleDescription,
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}${c.path}`,
    datePublished: c.published,
    dateModified: c.modified,
  };

  const scripts = [faqJsonLd, breadcrumbJsonLd, ...(c.extraJsonLd ?? []), articleJsonLd].map(jsonLdScript);

  const homeCrumb = (
    <li>
      <Link href="/" className="hover:text-brand transition-colors">
        Home
      </Link>
    </li>
  );
  const hubCrumb = (
    <li>
      <Link href="/ai-job-application" className="hover:text-brand transition-colors">
        AI Job Application
      </Link>
    </li>
  );
  // A fresh element per use: Flight dedupes a reused element into a back-reference.
  const slash = () => <li>/</li>;
  // Children are pushed into lists and spread into createElement so each stays a
  // static (key-free) child, exactly as in the hand-written pages.
  const crumbs: ReactNode[] = [];
  crumbs.push(homeCrumb, slash());
  if (!c.hub) crumbs.push(hubCrumb, slash());
  crumbs.push(<li className="text-brand font-medium">{c.crumb}</li>);
  const breadcrumb = (
    <nav
      className={
        (c.hub ? 'max-w-5xl' : 'max-w-4xl') + ' mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-2'
      }
    >
      {createElement('ol', { className: 'flex items-center gap-2 text-sm text-ink-muted' }, ...crumbs)}
    </nav>
  );

  const h = c.hero;
  const leadKids: ReactNode[] = [];
  leadKids.push(
    <p
      className={
        'text-xl text-ink-muted max-w-3xl mx-auto leading-relaxed' + (h.leadMb4 ? ' mb-4' : '')
      }
    >
      {h.lead}
    </p>,
  );
  if (h.extra) leadKids.push(h.extra);
  const heroKids: ReactNode[] = [];
  heroKids.push(
    <ScrollReveal delay={0} direction="down" distance={20}>
      <p className="text-sm font-semibold text-accent-strong uppercase tracking-widest mb-4">{h.eyebrow}</p>
    </ScrollReveal>,
    <ScrollReveal delay={150}>
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-brand mb-6 leading-tight">
        {h.title}
      </h1>
    </ScrollReveal>,
    createElement(Reveal, { delay: 300 }, ...leadKids),
  );
  if (h.cta) {
    const btnKids: ReactNode[] = [h.cta.label];
    if (h.cta.arrow) btnKids.push(<ArrowRight className="w-4 h-4" />);
    heroKids.push(
      <ScrollReveal delay={450}>
        <div className="mt-8">
          {createElement(
            Link,
            {
              href: '/dashboard',
              className:
                'inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control transition-colors duration-(--duration-fast) ease-standard shadow-elevated',
            },
            ...btnKids,
          )}
        </div>
      </ScrollReveal>,
    );
  }
  const hero = (
    <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8">
      {createElement('div', { className: 'max-w-5xl mx-auto text-center' }, ...heroKids)}
    </section>
  );

  const mainKids: ReactNode[] = [breadcrumb, hero, ...c.sections.map(contentSection)];
  if (c.links) {
    const linkKids: ReactNode[] = [];
    linkKids.push(
      <Link
        href="/ai-job-application"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-accent-strong transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> AI Job Application Hub
      </Link>,
    );
    for (const l of c.links.items) {
      linkKids.push(
        <Link
          href={l.href}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent-strong hover:text-ink-accent transition-colors"
        >
          {l.label + ' '}
          <ArrowRight className="w-4 h-4" />
        </Link>,
      );
    }
    mainKids.push(
      createElement(
        'section',
        { className: 'py-8 px-4 sm:px-6 lg:px-8' + (c.links.bg ? ' ' + c.links.bg : '') },
        createElement('div', { className: 'max-w-4xl mx-auto flex flex-wrap gap-4' }, ...linkKids),
      ),
    );
  }

  const faq = (
    <section
      className={'py-16 px-4 sm:px-6 lg:px-8' + (c.faqSection.bg ? ' ' + c.faqSection.bg : '')}
    >
      <div className="max-w-5xl mx-auto">
        <CenteredHeader eyebrow="FAQ" heading="Frequently Asked Questions" />
        <div className="space-y-6">
          {c.faqs.map((faq, i) => (
            <div
              key={i}
              itemScope
              itemType="https://schema.org/Question"
              className={c.faqSection.cardBg + ' rounded-card border border-border p-6'}
            >
              <h3 itemProp="name" className="text-lg font-bold text-ink-body mb-3">
                {faq.q}
              </h3>
              <div itemScope itemType="https://schema.org/Answer" itemProp="acceptedAnswer">
                <p itemProp="text" className="text-ink-muted leading-relaxed">
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  let ctaAction: ReactNode = c.cta.actions;
  if (c.cta.button) {
    const ctaKids: ReactNode[] = [c.cta.button.label];
    if (c.cta.button.arrow) ctaKids.push(<ArrowRight className="w-5 h-5" />);
    ctaAction = createElement(
      'a',
      {
        href: '/dashboard',
        className:
          'inline-flex items-center gap-2 px-10 py-4 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control transition-colors duration-(--duration-fast) ease-standard shadow-floating text-lg',
      },
      ...ctaKids,
    );
  }

  const cta = (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-inverse relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-pill -translate-y-1/2 translate-x-1/2 animate-float-slow" />
      <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold text-ink-inverse mb-4">{c.cta.heading}</h2>
          <p className="text-lg text-ink-inverse-muted mb-10 max-w-2xl mx-auto">{c.cta.body}</p>
          {ctaAction}
        </div>
      </ScrollReveal>
    </section>
  );

  return createElement(
    'div',
    { className: 'min-h-screen bg-canvas' },
    <Navbar />,
    ...scripts,
    createElement('main', null, ...mainKids, faq, cta),
    <Footer />,
  );
}

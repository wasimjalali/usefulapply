'use client';

/**
 * Shared job-ad rendering for the feed canvas: the work-mode label and the
 * description parser that turns a provider's run-on blob into headings and
 * bullet lists.
 */

import type { JobFeedFeedItem, JobFeedHighlight } from '@/lib/job-feed/types';

export function workModeLabel(value: JobFeedFeedItem['workMode']): string {
  switch (value) {
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    case 'onsite':
      return 'On-site';
    default:
      return 'Work mode unknown';
  }
}

// Common section headers job boards use. When a description arrives as one
// run-on blob (no line breaks), we put these on their own line so the line
// parser below can turn them into real headings + bullet lists. No lookbehind
// (older Safari throws on it at parse time, which would crash this component).
const INLINE_SECTION_HEADERS = /\s*\b(Key Responsibilities|Responsibilities|Minimum Qualifications|Preferred Qualifications|Qualifications|Requirements|What You'?ll Do|What You Will Do|What We Offer|What You Bring|What We're Looking For|Who You Are|Your Role|Your Profile|About The Role|About You|About Us|Benefits|Perks|Nice To Have|Compensation)\s*:/gi;

interface ParsedDescription {
  nodes: React.ReactNode[];
  /** True when the text produced real structure (a list, a heading, or more
   *  than one paragraph). False for a single run-on paragraph. */
  structured: boolean;
}

function parseDescriptionText(text: string): ParsedDescription {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, ' ')
    // Break a run-on blob around known section headers so it segments even
    // without source line breaks: header on its own line (so it renders as a
    // heading), content on the next.
    .replace(INLINE_SECTION_HEADERS, (_match, header: string) => `\n\n${header}:\n`);

  const lines = normalized.split(/\n/).map((line) => line.trimEnd());
  const nodes: React.ReactNode[] = [];
  let currentList: string[] = [];
  let listCount = 0;
  let headingCount = 0;
  let paragraphCount = 0;

  const flushList = () => {
    if (currentList.length === 0) return;
    const items = currentList;
    listCount += 1;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-2 ml-1 space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 text-navy-500">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
    currentList = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^\s*[•\-*►●○■▪–·]\s*(.+)/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1].trim());
      continue;
    }

    const trimmed = line.trim();
    const isHeader = (
      (trimmed.endsWith(':') && trimmed.length < 80) ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed))
    );

    if (isHeader) {
      flushList();
      headingCount += 1;
      nodes.push(
        <h4 key={`heading-${nodes.length}`} className="mb-1.5 mt-4 font-semibold text-charcoal">
          {trimmed}
        </h4>
      );
      continue;
    }

    flushList();
    paragraphCount += 1;
    nodes.push(
      <p key={`paragraph-${nodes.length}`} className="mb-2">
        {trimmed}
      </p>
    );
  }

  flushList();

  return { nodes, structured: listCount > 0 || headingCount > 0 || paragraphCount > 1 };
}

function HighlightSections({ highlights }: { highlights: JobFeedHighlight[] }) {
  return (
    <div className="space-y-4">
      {highlights.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {section.title && (
            <h4 className="mb-1.5 font-semibold text-charcoal">{section.title}</h4>
          )}
          <ul className="ml-1 space-y-1.5">
            {section.items.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 text-navy-500">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function JobFeedDescription({
  text,
  highlights = [],
}: {
  text: string | null;
  highlights?: JobFeedHighlight[];
}) {
  const parsed = text ? parseDescriptionText(text) : { nodes: [], structured: false };
  const usableHighlights = highlights.filter((section) => section.items.length > 0);

  // The free-text description already reads as structured sections — trust it.
  if (parsed.structured) {
    return <div className="space-y-0.5">{parsed.nodes}</div>;
  }

  // Run-on blob (or empty). If the provider gave structured highlights, render
  // those as clean sections, with the flat text kept as a lead-in when present.
  if (usableHighlights.length > 0) {
    return (
      <div className="space-y-4">
        {parsed.nodes.length > 0 && <div className="space-y-0.5">{parsed.nodes}</div>}
        <HighlightSections highlights={usableHighlights} />
      </div>
    );
  }

  // Nothing better available — render the flat text as-is.
  return <div className="space-y-0.5">{parsed.nodes}</div>;
}

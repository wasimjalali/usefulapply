'use client';

import { useMemo } from 'react';
import ComparisonTable from './ComparisonTable';

interface BlogContentProps {
  content: string;
  slug?: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

/**
 * Renders markdown-like blog content as HTML.
 * Supports: headings (##, ###), bold (**), italic (*), links [text](url),
 * unordered lists (- item), ordered lists (1. item), blockquotes (>),
 * inline code (`code`), code blocks (```), images (![alt](src)), paragraphs,
 * and auto-generated Table of Contents.
 */
export function BlogContent({ content, slug }: BlogContentProps) {
  const { toc, html, hasComparisonTable } = useMemo(() => {
    const tocItems = extractToc(content);
    const hasTable = content.includes('## Feature Comparison Table');
    const rendered = renderMarkdown(content, hasTable);
    return { toc: tocItems, html: rendered, hasComparisonTable: hasTable };
  }, [content]);

  // Comparison table data for AI tools post
  const comparisonTableData = slug === 'best-ai-job-application-tools-2026' ? {
    tools: [
      { name: 'Useful Apply', color: 'gold' },
      { name: 'Teal', color: 'teal' },
      { name: 'Jobscan', color: 'blue' },
      { name: 'Rezi', color: 'purple' },
      { name: 'Kickresume', color: 'pink' },
    ],
    features: [
      {
        name: 'Resume generation',
        values: [
          { status: 'yes' as const, text: 'Auto' },
          { status: 'yes' as const, text: 'Manual' },
          { status: 'no' as const },
          { status: 'yes' as const, text: 'Manual' },
          { status: 'yes' as const, text: 'Manual' },
        ],
      },
      {
        name: 'Cover letter generation',
        values: [
          { status: 'yes' as const, text: 'Auto' },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'yes' as const, text: 'Template' },
        ],
      },
      {
        name: 'Email generation',
        values: [
          { status: 'yes' as const, text: 'Auto' },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'no' as const },
        ],
      },
      {
        name: 'Follow-up email',
        values: [
          { status: 'yes' as const, text: 'Auto' },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'no' as const },
        ],
      },
      {
        name: 'ATS optimization',
        values: [
          { status: 'yes' as const, text: 'All templates' },
          { status: 'warning' as const, text: 'Some' },
          { status: 'yes' as const },
          { status: 'yes' as const },
          { status: 'warning' as const, text: 'Some' },
        ],
      },
      {
        name: 'Anti-hallucination',
        values: [
          { status: 'yes' as const, text: 'Enforced' },
          { status: 'warning' as const, text: 'Manual check' },
          { status: 'text' as const, text: 'N/A' },
          { status: 'warning' as const, text: 'Manual check' },
          { status: 'warning' as const, text: 'Manual check' },
        ],
      },
      {
        name: 'Application tracker',
        values: [
          { status: 'no' as const },
          { status: 'yes' as const },
          { status: 'no' as const },
          { status: 'no' as const },
          { status: 'no' as const },
        ],
      },
      {
        name: 'Free tier',
        values: [
          { status: 'yes' as const, text: '2/month' },
          { status: 'yes' as const, text: 'Limited' },
          { status: 'yes' as const, text: '5 scans' },
          { status: 'yes' as const, text: 'Limited' },
          { status: 'yes' as const, text: 'Limited' },
        ],
      },
      {
        name: 'Speed (per application)',
        values: [
          { status: 'text' as const, text: '90 sec' },
          { status: 'text' as const, text: '15+ min' },
          { status: 'text' as const, text: '10 min' },
          { status: 'text' as const, text: '20+ min' },
          { status: 'text' as const, text: '20+ min' },
        ],
      },
      {
        name: 'Regional support',
        values: [
          { status: 'text' as const, text: 'US/UK/CA/DE' },
          { status: 'text' as const, text: 'US/UK' },
          { status: 'text' as const, text: 'US/UK' },
          { status: 'text' as const, text: 'US/UK' },
          { status: 'text' as const, text: 'US/UK/EU' },
        ],
      },
    ],
  } : null;

  return (
    <div>
      {/* Table of Contents */}
      {toc.length > 2 && (
        <nav className="mb-10 p-6 bg-surface border border-border rounded-card" aria-label="Table of contents">
          <h2 className="text-lg font-bold text-brand-strong mb-4">Table of Contents</h2>
          <ol className="space-y-2">
            {toc.map((item, i) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`text-ink-muted hover:text-brand transition-colors text-sm leading-relaxed ${
                    item.level === 3 ? 'ml-5' : ''
                  }`}
                >
                  <span className="text-accent-strong font-medium mr-2">{i + 1}.</span>
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Article content */}
      <div>
        {html.split('<!-- COMPARISON_TABLE -->').map((part, index, arr) => (
          <div key={index}>
            <div dangerouslySetInnerHTML={{ __html: part }} />
            {index < arr.length - 1 && comparisonTableData && (
              <ComparisonTable
                tools={comparisonTableData.tools}
                features={comparisonTableData.features}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractToc(md: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = md.split('\n');
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const text = line.slice(3).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
      items.push({ id: slugify(text), text, level: 2 });
    } else if (line.startsWith('### ')) {
      const text = line.slice(4).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
      items.push({ id: slugify(text), text, level: 3 });
    }
  }
  return items;
}

function renderMarkdown(md: string, hasComparisonTable: boolean): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle comparison table replacement
    if (hasComparisonTable && line.trim() === '## Feature Comparison Table') {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const id = slugify('Feature Comparison Table');
      result.push(`<h2 id="${id}" class="text-2xl sm:text-3xl font-bold text-brand-strong mt-12 mb-4 leading-tight">Feature Comparison Table</h2>`);
      result.push('<!-- COMPARISON_TABLE -->');
      inTable = true;
      continue;
    }

    // Skip markdown table lines when we have comparison table
    if (inTable) {
      if (line.trim().startsWith('|') || line.trim().startsWith('##') || line.trim() === '') {
        if (line.trim().startsWith('##') && line.trim() !== '## Feature Comparison Table') {
          inTable = false;
          // Continue processing this line as a regular heading
        } else {
          continue;
        }
      } else {
        inTable = false;
      }
    }

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        result.push(`<pre class="bg-brand-soft border border-border rounded-control p-4 overflow-x-auto my-6"><code>${codeBlockContent.join('\n')}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        if (inList) {
          result.push(listType === 'ul' ? '</ul>' : '</ol>');
          inList = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(escapeHtml(line));
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      continue;
    }

    // Headings (with anchor IDs for TOC linking)
    if (line.startsWith('#### ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const text = line.slice(5);
      const id = slugify(text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'));
      result.push(`<h4 id="${id}" class="text-lg font-bold text-brand-strong mt-8 mb-3">${inlineFormat(text)}</h4>`);
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const text = line.slice(4);
      const id = slugify(text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'));
      result.push(`<h3 id="${id}" class="text-xl sm:text-2xl font-bold text-brand-strong mt-10 mb-4">${inlineFormat(text)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const text = line.slice(3);
      const id = slugify(text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'));
      result.push(`<h2 id="${id}" class="text-2xl sm:text-3xl font-bold text-brand-strong mt-12 mb-4 leading-tight">${inlineFormat(text)}</h2>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<blockquote class="border-l-4 border-accent pl-5 my-6 italic text-ink-muted"><p>${inlineFormat(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Image
    // Optional title: ![alt](src) keeps today's caption-from-alt behavior.
    // ![alt](src "") sets alt for accessibility and skips the visible caption.
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (imgMatch) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const alt = imgMatch[1];
      const src = imgMatch[2];
      const caption = imgMatch[3] !== undefined ? imgMatch[3] : alt;
      const captionHtml = caption
        ? `<figcaption class="text-center text-sm text-ink-muted mt-3">${escapeHtml(caption)}</figcaption>`
        : '';
      result.push(`<figure class="my-10"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="rounded-card w-full shadow-resting" loading="lazy" />${captionHtml}</figure>`);
      continue;
    }

    // Unordered list
    if (line.match(/^[-*] /)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul class="list-disc list-inside space-y-2 my-4 text-ink-body leading-relaxed">');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${inlineFormat(line.replace(/^[-*] /, ''))}</li>`);
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ol class="list-decimal list-inside space-y-2 my-4 text-ink-body leading-relaxed">');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push('<hr class="my-8 border-border" />');
      continue;
    }

    // Regular paragraph
    if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
    result.push(`<p class="text-ink-body leading-relaxed mb-4">${inlineFormat(line)}</p>`);
  }

  if (inList) {
    result.push(listType === 'ul' ? '</ul>' : '</ol>');
  }

  return result.join('\n');
}

function inlineFormat(text: string): string {
  let result = escapeHtml(text);

  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand underline hover:text-ink transition-colors">$1</a>');

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

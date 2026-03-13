'use client';

import { useMemo } from 'react';

interface BlogContentProps {
  content: string;
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
export function BlogContent({ content }: BlogContentProps) {
  const { toc, html } = useMemo(() => {
    const tocItems = extractToc(content);
    const rendered = renderMarkdown(content);
    return { toc: tocItems, html: rendered };
  }, [content]);

  return (
    <div>
      {/* Table of Contents */}
      {toc.length > 2 && (
        <nav className="mb-10 p-6 bg-cream-50 border border-cream-200 rounded-2xl" aria-label="Table of contents">
          <h2 className="text-lg font-bold text-navy-700 mb-4">Table of Contents</h2>
          <ol className="space-y-2">
            {toc.map((item, i) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`text-warm-gray hover:text-navy-600 transition-colors text-sm leading-relaxed ${
                    item.level === 3 ? 'ml-5' : ''
                  }`}
                >
                  <span className="text-gold-500 font-medium mr-2">{i + 1}.</span>
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Article content */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
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

function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        result.push(`<pre class="bg-navy-50 border border-cream-200 rounded-xl p-4 overflow-x-auto my-6"><code>${codeBlockContent.join('\n')}</code></pre>`);
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
      result.push(`<h4 id="${id}" class="text-lg font-bold text-navy-700 mt-8 mb-3">${inlineFormat(text)}</h4>`);
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const text = line.slice(4);
      const id = slugify(text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'));
      result.push(`<h3 id="${id}" class="text-xl sm:text-2xl font-bold text-navy-700 mt-10 mb-4">${inlineFormat(text)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const text = line.slice(3);
      const id = slugify(text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'));
      result.push(`<h2 id="${id}" class="text-2xl sm:text-3xl font-bold text-navy-700 mt-12 mb-4 leading-tight">${inlineFormat(text)}</h2>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<blockquote class="border-l-4 border-gold-400 pl-5 my-6 italic text-warm-gray"><p>${inlineFormat(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<figure class="my-10"><img src="${escapeHtml(imgMatch[2])}" alt="${escapeHtml(imgMatch[1])}" class="rounded-xl w-full shadow-sm" loading="lazy" />${imgMatch[1] ? `<figcaption class="text-center text-sm text-warm-gray mt-3">${escapeHtml(imgMatch[1])}</figcaption>` : ''}</figure>`);
      continue;
    }

    // Unordered list
    if (line.match(/^[-*] /)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul class="list-disc list-inside space-y-2 my-4 text-charcoal leading-relaxed">');
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
        result.push('<ol class="list-decimal list-inside space-y-2 my-4 text-charcoal leading-relaxed">');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push('<hr class="my-8 border-cream-200" />');
      continue;
    }

    // Regular paragraph
    if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
    result.push(`<p class="text-charcoal leading-relaxed mb-4">${inlineFormat(line)}</p>`);
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
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-navy-600 underline hover:text-navy-800 transition-colors">$1</a>');

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

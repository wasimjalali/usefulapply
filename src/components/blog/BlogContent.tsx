'use client';

import { useMemo } from 'react';

interface BlogContentProps {
  content: string;
}

/**
 * Renders markdown-like blog content as HTML.
 * Supports: headings (##, ###), bold (**), italic (*), links [text](url),
 * unordered lists (- item), ordered lists (1. item), blockquotes (>),
 * inline code (`code`), code blocks (```), images (![alt](src)), and paragraphs.
 */
export function BlogContent({ content }: BlogContentProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
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

    // Headings
    if (line.startsWith('#### ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<h4>${inlineFormat(line.slice(5))}</h4>`);
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<blockquote><p>${inlineFormat(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(`<figure class="my-8"><img src="${escapeHtml(imgMatch[2])}" alt="${escapeHtml(imgMatch[1])}" class="rounded-xl w-full" />${imgMatch[1] ? `<figcaption class="text-center text-sm text-warm-gray mt-2">${escapeHtml(imgMatch[1])}</figcaption>` : ''}</figure>`);
      continue;
    }

    // Unordered list
    if (line.match(/^[-*] /)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul>');
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
        result.push('<ol>');
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
    result.push(`<p>${inlineFormat(line)}</p>`);
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
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

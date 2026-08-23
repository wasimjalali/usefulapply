'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

function isSafeMarkdownHref(href: string | undefined): href is string {
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function MarkdownText({ content, className = '' }: MarkdownTextProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          // Custom styling for markdown elements
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-charcoal">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm">{children}</li>
          ),
          code: ({ children }) => (
            <code className="px-1 py-0.5 bg-cream-200 rounded text-xs font-mono">
              {children}
            </code>
          ),
          img: () => null,
          a: ({ href, children }) => (
            isSafeMarkdownHref(href) ? (
              <a
                href={href}
                className="text-navy-600 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            )
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';

interface PDFViewerProps {
  pdfUrl: string;
  fileName: string;
}

export function PDFViewer({ pdfUrl, fileName }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="h-full flex flex-col bg-cream-50">
      <div className="px-4 py-2 bg-cream-100 border-b border-cream-300 flex items-center justify-between">
        <span className="text-sm text-charcoal font-medium">{fileName}</span>
        <div className="flex gap-2">
          <a
            href={pdfUrl}
            download={fileName}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-navy-600 hover:text-navy-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-navy-600 hover:text-navy-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </a>
        </div>
      </div>
      
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600" />
          </div>
        )}
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title={fileName}
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
}

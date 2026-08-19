'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useToast } from '@/components/ui/Toast';
import { downloadBlob } from '@/lib/utils/download-pdf';
import { buildAnswersPdfBlob, formatAnswersAsText, kitFilename } from '@/lib/utils/kit-export';
import { useCVStore } from '@/store/useCVStore';

interface AnswersPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

const TOOL_CLASS = 'inline-flex h-9 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-medium text-charcoal shadow-sm hover:bg-white transition-colors duration-200 cursor-pointer flex-shrink-0';

export function AnswersPanel({ toolbarPortal }: AnswersPanelProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const structuredCV = useCVStore((s) => s.structuredCV);
  const { toast } = useToast();
  const answers = currentSession?.screeningAnswers ?? [];
  const company = currentSession?.company || '';
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const copy = async (text: string, id: string | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      if (id === 'all') {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      } else {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch (err) {
      console.error('Clipboard write failed:', err);
      toast.error('Couldn\'t copy. Select the text and copy it by hand.');
    }
  };

  const handleDownload = async () => {
    if (answers.length === 0) return;
    setDownloading(true);
    try {
      const blob = buildAnswersPdfBlob(answers, company);
      await downloadBlob(blob, kitFilename(structuredCV?.personal.fullName || 'Applicant', company, 'Screening_Answers', 'pdf'));
    } catch (err) {
      console.error('Answers PDF failed:', err);
      toast.error('The PDF didn\'t build. Copy the answers instead.');
    } finally {
      setDownloading(false);
    }
  };

  const toolbar = (
    <>
      <button type="button" onClick={() => copy(formatAnswersAsText(answers), 'all')} className={TOOL_CLASS} disabled={answers.length === 0}>
        {copiedAll ? <Check className="h-4 w-4 text-gold-600" /> : <Copy className="h-4 w-4" />}
        {copiedAll ? 'Copied' : 'Copy all'}
      </button>
      <button type="button" onClick={handleDownload} className={TOOL_CLASS} disabled={downloading || answers.length === 0}>
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download
      </button>
    </>
  );

  return (
    <>
      {toolbarPortal && createPortal(toolbar, toolbarPortal)}
      <div className="h-full overflow-auto bg-cream-100 px-5 pb-6 pt-4">
        <div className="mx-auto w-full max-w-[640px] rounded-2xl bg-white px-9 py-8 shadow-md">
          <h2 className="font-serif text-lg font-semibold text-navy-800">
            Screening answers{company ? ` · ${company}` : ''}
          </h2>
          <div className="mt-5 flex flex-col gap-3">
            {answers.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="mt-px inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-navy-600 text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="flex-1 text-[13px] font-semibold leading-snug text-navy-800">{item.question}</p>
                  <button
                    type="button"
                    onClick={() => copy(item.answer, item.id)}
                    className="inline-flex h-[30px] flex-shrink-0 items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 text-xs font-medium text-charcoal shadow-sm hover:bg-cream-50 cursor-pointer"
                  >
                    {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-gold-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === item.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-line pl-8 text-[13.5px] leading-relaxed text-charcoal">{item.answer}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-warm-gray">Paste the next question in the chat and it lands here.</p>
        </div>
      </div>
    </>
  );
}

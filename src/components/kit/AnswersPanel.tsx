'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useToast } from '@/components/ui/Toast';
import { downloadBlob } from '@/lib/utils/download-pdf';
import { formatAnswersAsText } from '@/lib/utils/kit-export';
import { isSavedApplicationId, notifyExportFailure, serverExport, trackExportFailure } from '@/lib/utils/server-export';
import { useLatest } from '@/hooks/useLatest';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { promptAccountToDownload } from '@/components/kit/account-wall';

interface AnswersPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

const TOOL_CLASS = 'inline-flex h-9 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-medium text-charcoal shadow-sm hover:bg-white transition-colors duration-200 cursor-pointer flex-shrink-0';

export function AnswersPanel({ toolbarPortal }: AnswersPanelProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
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

  // An in-flight guard a toast's Try again can't bypass (the disabled button only stops clicks).
  const downloadBusyRef = useRef(false);
  const handleDownload = async () => {
    const applicationId = currentSession?.id;
    if (answers.length === 0) return;
    if (!user) {
      // Still finding out who is signed in: a signed-in user must never see the account wall.
      if (!authLoading) promptAccountToDownload(toast, router.push, 'kit');
      return;
    }
    if (downloadBusyRef.current) return;
    if (!isSavedApplicationId(applicationId)) {
      toast.error('This application is still saving. Try again in a moment.');
      return;
    }
    downloadBusyRef.current = true;
    setDownloading(true);
    try {
      const { blob, fileName } = await serverExport({
        applicationId,
        format: 'answers_pdf',
        answers: answers.map((item) => ({ question: item.question, answer: item.answer })),
      });
      await downloadBlob(blob, fileName);
    } catch (err) {
      console.error('Answers PDF failed:', err);
      trackExportFailure('answers_pdf', err);
      notifyExportFailure(toast, err, 'PDF', () => { void latestDownload.current(); });
    } finally {
      downloadBusyRef.current = false;
      setDownloading(false);
    }
  };
  const latestDownload = useLatest(handleDownload);

  const toolbar = (
    <>
      <button type="button" onClick={() => copy(formatAnswersAsText(answers), 'all')} className={TOOL_CLASS} disabled={answers.length === 0}>
        {copiedAll ? <Check className="h-4 w-4 text-gold-600" /> : <Copy className="h-4 w-4" />}
        {copiedAll ? 'Copied' : 'Copy all'}
      </button>
      <button type="button" onClick={handleDownload} className={TOOL_CLASS} disabled={downloading || answers.length === 0 || (Boolean(user) && !isSavedApplicationId(currentSession?.id))}>
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
          <h2 className="text-lg font-semibold text-navy-800">
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

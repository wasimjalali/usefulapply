'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { useAppStore } from '@/store/useAppStore';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { formatDate, formatDayMonth, type DatePrefs } from '@/lib/utils/format-date';
import { useUIStore } from '@/store/useUIStore';
import { Mail, Download, Copy, Check, FileText, Edit3, Eye, Loader2, Maximize2, X, Zap, ChevronDown } from 'lucide-react';
import type { GeneratedCoverLetter } from '@/lib/types';
import { StepIndicator } from './StepIndicator';
import { KitDocumentError } from './KitDocumentError';
import { PdfPreviewModal } from './ui/PdfPreviewModal';
import { useToast } from './ui/Toast';
import { downloadBlob } from '@/lib/utils/download-pdf';
import {
  buildCoverLetterDocxBlob,
  buildCoverLetterPdfBlob,
  countWords,
  formatCoverLetterAsText,
  hasAddressPlaceholder as letterHasAddressPlaceholder,
} from '@/lib/utils/cover-letter-export';
import { kitFilename } from '@/lib/utils/kit-export';
import { FALLBACK_NOTICE, serverExport, shouldFallBack, trackExportFallback } from '@/lib/utils/server-export';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgementFor, commitEditorSave, editorShouldClose, getEditorStart, subscribeConflictAcknowledged, type EditorStart } from '@/lib/session-sync';

interface CoverLetterPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

const TOOL_CLASS = 'inline-flex h-9 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-medium text-charcoal shadow-sm hover:bg-white transition-colors duration-200 cursor-pointer flex-shrink-0';
const DOWNLOAD_MENU_WIDTH = 144;
const DOWNLOAD_MENU_HEIGHT = 96;

function relativeLabel(ms: number, now: number, prefs: DatePrefs): string {
  const mins = Math.floor((now - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  // Past a day "earlier" says nothing, and the stamp now survives a reload.
  // Past a year the day and month alone would read as three days ago.
  const then = new Date(ms);
  const overAYear = now - ms > 365 * 86_400_000;
  return `on ${overAYear ? formatDate(then, prefs) : formatDayMonth(then, prefs)}`;
}

/** The letter's own stamp, or null when it predates the stamp or is unreadable. */
function stampOf(letter: GeneratedCoverLetter | null | undefined): number | null {
  if (!letter?.updatedAt) return null;
  const ms = new Date(letter.updatedAt).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function CoverLetterPanel({ toolbarPortal }: CoverLetterPanelProps = {}) {
  const { currentSession, isAgentWorking, agentWorkflowPhase, structuredCV } = useAppStore();
  const setPendingApplicationAction = useUIStore((state) => state.setPendingApplicationAction);
  const datePrefs = useDatePrefs();
  const coverLetter = currentSession?.coverLetter;
  const pendingFitAnalysis = currentSession?.pendingFitAnalysis;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasFreshPendingFitAnalysis = Boolean(
    pendingFitAnalysis?.createdAt
    && nowMs < new Date(pendingFitAnalysis.createdAt).getTime() + 30 * 60 * 1000
  );
  
  const [copied, setCopied] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'docx' | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadMenuPos, setDownloadMenuPos] = useState<{ top: number; left: number } | null>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState<GeneratedCoverLetter | null>(null);
  // The draft as it is now, for the save that finishes later (the user keeps typing while it runs).
  const editedCoverLetterRef = useRef<GeneratedCoverLetter | null>(null);
  useEffect(() => { editedCoverLetterRef.current = editedCoverLetter; }, [editedCoverLetter]);
  const [showFullPreview, setShowFullPreview] = useState(false);
  // The rendered PDF the server would export, shown so people see the layout (US letter or DIN 5008) before they download.
  const [layoutPreview, setLayoutPreview] = useState<{ url: string } | null>(null);
  const [layoutPreviewLoading, setLayoutPreviewLoading] = useState(false);
  const layoutOpenerRef = useRef<HTMLElement | null>(null);
  // When the letter last changed. Seeded from the stamp the letter carries, so
  // a reload can still say it; null only for letters written before the stamp.
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(() => stampOf(coverLetter));
  const lastLetterRef = useRef<GeneratedCoverLetter | null>(null);
  // The store's letter as it is now, for the discard path in the conflict listener below.
  const currentCoverLetterRef = useRef<GeneratedCoverLetter | null>(null);
  useEffect(() => { currentCoverLetterRef.current = coverLetter ?? null; }, [coverLetter]);
  const lastSessionIdRef = useRef<string | null>(null);
  const editSessionIdRef = useRef<string | null>(null);
  // The revision the editor opened on. The draft lives here, outside the store, so
  // it is bound to that revision and checked again at save time (commitEditorSave).
  const editStartRef = useRef<EditorStart | undefined>(undefined);
  // Counts the discards of cover letter conflict text that reached this editor. A save still running when the
  // draft is discarded sees the count has moved and leaves the editor alone when its answer comes back.
  const discardEpochRef = useRef(0);
  // When the user deals with a conflict notice about the letter (restores or copies their text), what this editor
  // was opened against is stale: base it on the current revision, so its next Save is not refused again.
  // Discarding the text the editor holds drops the draft, as Cancel does. Other fields' notices leave it alone.
  useEffect(() => subscribeConflictAcknowledged((acknowledged, ack) => {
    if (editSessionIdRef.current !== acknowledged) return;
    const action = acknowledgementFor(ack, ['coverLetter'], editStartRef.current);
    if (action === 'ignore') return;
    if (action === 'reset') {
      discardEpochRef.current += 1;
      setIsEditMode(false);
      setEditedCoverLetter(currentCoverLetterRef.current);
      editSessionIdRef.current = null;
      editStartRef.current = undefined;
      return;
    }
    editStartRef.current = getEditorStart(acknowledged, editStartRef.current);
  }), []);
  const { toast } = useToast();

  // Check if cover letter still contains any address placeholder (old or new format)
  const hasAddressPlaceholder = () => Boolean(coverLetter && letterHasAddressPlaceholder(coverLetter));

  // Sync edited cover letter when cover letter changes (e.g., after regeneration)
  // Only skip sync when user is actively editing to avoid overwriting their changes
  useEffect(() => {
    if (coverLetter && !isEditMode) {
      setEditedCoverLetter(coverLetter);
    }
    const sessionId = currentSession?.id ?? null;
    if (lastSessionIdRef.current !== sessionId) {
      // Another application: its letter is not "updated just now".
      lastSessionIdRef.current = sessionId;
      lastLetterRef.current = coverLetter ?? null;
      setUpdatedAtMs(stampOf(coverLetter));
      setIsEditMode(false);
      setEditedCoverLetter(coverLetter ?? null);
      editSessionIdRef.current = null;
      return;
    }
    if (coverLetter) {
      // Identity check, so a StrictMode double-run on mount does not count as a change.
      if (lastLetterRef.current !== null && lastLetterRef.current !== coverLetter) {
        // No clock fallback. A rehydrated letter is a new object with the same
        // content, and every path that really writes one stamps it, so an
        // unstamped change is a reload and has nothing truthful to report.
        setUpdatedAtMs(stampOf(coverLetter));
      }
      lastLetterRef.current = coverLetter;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverLetter, currentSession?.id]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Fixed to the viewport so the kit toolbar's overflow-x-auto and the
  // document scroller below it cannot clip or paint over the menu.
  useLayoutEffect(() => {
    if (!showDownloadMenu) return;
    const place = () => {
      const button = downloadButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const below = rect.bottom + 6;
      const flip = below + DOWNLOAD_MENU_HEIGHT > window.innerHeight;
      setDownloadMenuPos({
        top: flip ? Math.max(8, rect.top - DOWNLOAD_MENU_HEIGHT - 6) : below,
        left: Math.min(
          Math.max(8, rect.left),
          window.innerWidth - DOWNLOAD_MENU_WIDTH - 8,
        ),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showDownloadMenu]);

  useEffect(() => {
    if (!showDownloadMenu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (downloadButtonRef.current?.contains(target)) return;
      if (downloadMenuRef.current?.contains(target)) return;
      setShowDownloadMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDownloadMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showDownloadMenu]);

  const handleCopy = async () => {
    if (coverLetter) {
      try {
        const fullText = formatCoverLetterAsText(coverLetter);
        await navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
        toast.error('Couldn\'t copy. Select the text and copy it by hand.');
      }
    }
  };

  /**
   * What the server should lay out. The rule, shared with saving: an edit to the
   * body drops `structured` (see updateField and handleSaveEdits), so a letter
   * that still carries a valid `structured` has its writer's own text, and a
   * letter without one is laid out from its body, which is then the truth.
   */
  const letterForServer = (letter: GeneratedCoverLetter) => {
    const structured = (letter as { structured?: unknown }).structured;
    if (isStructuredCoverLetter(structured)) return { structuredLetter: structured };
    return { legacyLetterText: formatCoverLetterAsText(letter) };
  };

  const openLayoutPreview = async () => {
    const letter = editedCoverLetter || coverLetter;
    const applicationId = currentSession?.id;
    if (!letter || !applicationId) return;
    layoutOpenerRef.current = document.activeElement as HTMLElement | null;
    setLayoutPreviewLoading(true);
    try {
      const { blob } = await serverExport({ applicationId, format: 'cover_letter_pdf', ...letterForServer(letter) });
      setLayoutPreview({ url: URL.createObjectURL(blob) });
    } catch (error) {
      console.error('Layout preview failed:', error);
      toast.error("The preview didn't build. Try again in a moment.");
    } finally {
      setLayoutPreviewLoading(false);
    }
  };

  const closeLayoutPreview = () => {
    if (layoutPreview) URL.revokeObjectURL(layoutPreview.url);
    setLayoutPreview(null);
  };

  const exportLetter = async (format: 'pdf' | 'docx') => {
    const letterToDownload = editedCoverLetter || coverLetter;
    if (!letterToDownload) return;
    const showAddressReminder = hasAddressPlaceholder();
    setShowDownloadMenu(false);
    setDownloadFormat(format);
    try {
      let usedFallback = false;
      let blob: Blob | null = null;
      let fileName = '';
      const applicationId = currentSession?.id;
      if (applicationId) {
        try {
          const served = await serverExport({
            applicationId,
            format: format === 'pdf' ? 'cover_letter_pdf' : 'cover_letter_docx',
            ...letterForServer(letterToDownload),
          });
          blob = served.blob;
          fileName = served.fileName;
        } catch (error) {
          if (!shouldFallBack(error)) throw error;
          trackExportFallback(format === 'pdf' ? 'cover_letter_pdf' : 'cover_letter_docx', error);
        }
      }
      if (!blob) {
        usedFallback = true;
        const applicantName =
          letterToDownload.applicantAddress.name ||
          letterToDownload.signatureName ||
          structuredCV?.personal.fullName ||
          'Applicant';
        const companyName = letterToDownload.companyAddress.companyName || currentSession?.company || 'Company';
        blob = format === 'pdf'
          ? buildCoverLetterPdfBlob(letterToDownload)
          : await buildCoverLetterDocxBlob(letterToDownload);
        fileName = kitFilename(applicantName, companyName, 'Cover_Letter', format);
      }
      await downloadBlob(blob, fileName);
      if (usedFallback && format === 'pdf') toast.warning(FALLBACK_NOTICE, 7000);
      else toast.success(`${format.toUpperCase()} downloaded.`);
      if (showAddressReminder) {
        setTimeout(() => toast.warning('Add the company address before you send it.', 6000), 500);
      }
    } catch (error) {
      console.error(`${format.toUpperCase()} generation error:`, error);
      toast.error(`The ${format.toUpperCase()} didn't build. Copy the text instead.`);
    } finally {
      setDownloadFormat(null);
    }
  };

  // Show loading indicator during agent workflow
  if (!coverLetter && isAgentWorking) {
    return (
      <StepIndicator
        stepType="cover_letter"
        isLoading={true}
        title={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing Fit' : undefined}
        message={agentWorkflowPhase === 'fit_analysis'
          ? 'Cover letter will be generated after you apply.'
          : 'Composing your tailored cover letter...'
        }
        statusLabel={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing...' : undefined}
      />
    );
  }

  if (!coverLetter && hasFreshPendingFitAnalysis) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-navy-400" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">Ready to apply?</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Your fit analysis is ready. Generate the full application to unlock your tailored cover letter.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => setPendingApplicationAction('generate-full-application')}
              className="flex items-center gap-2 rounded-full bg-gold-400 text-white px-5 py-3 text-sm font-semibold shadow-sm hover:bg-gold-500 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              Generate Kit
            </button>
            <button
              onClick={() => setPendingApplicationAction('skip-job')}
              className="flex items-center gap-2 rounded-full border border-cream-200 bg-white text-charcoal px-5 py-3 text-sm font-semibold hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer"
            >
              New Search
            </button>
          </div>
        </div>
      </div>
    );
  }

  // The last kit run delivered everything else but not this letter. Retry it
  // here on its own; the other tabs are untouched.
  if (!coverLetter && currentSession?.kitDocumentErrors?.coverLetter) {
    return (
      <KitDocumentError
        variant="panel"
        title="We couldn't write this cover letter"
        target="cover-letter"
      />
    );
  }

  // No cover letter and no pending fit analysis — the only way to get here is
  // to generate a full application from the chat panel. Do not offer a
  // standalone "Generate Cover Letter" button (it cannot work without a job
  // description + generation context).
  if (!coverLetter) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">No cover letter yet</h3>
          <p className="text-sm text-warm-gray leading-relaxed">
            Paste a job description in the chat to generate your full application kit.
          </p>
        </div>
      </div>
    );
  }

  // Get the active cover letter (edited or original)
  const activeCoverLetter = editedCoverLetter || coverLetter;

  // Update a field in the edited cover letter
  const updateField = (path: string, value: string) => {
    if (!activeCoverLetter) return;
    // Shallow-clone top level and both address sub-objects (the only nested fields)
    const newLetter: GeneratedCoverLetter = {
      ...activeCoverLetter,
      applicantAddress: { ...activeCoverLetter.applicantAddress },
      companyAddress: { ...activeCoverLetter.companyAddress },
    };
    const keys = path.split('.');
    let obj: Record<string, unknown> = newLetter as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    obj[keys[keys.length - 1]] = value;
    // The structure no longer matches an edited body: from here the body is the truth.
    if (path === 'body') delete (newLetter as { structured?: unknown }).structured;
    setEditedCoverLetter(newLetter);
  };

  // Save edited cover letter to store
  const handleSaveEdits = () => {
    if (editedCoverLetter && editSessionIdRef.current) {
      // An edited body no longer matches its structured copy, so the copy is
      // dropped and the export falls back to the body the user wrote.
      const { structured, ...rest } = editedCoverLetter;
      const keepStructured = structured && editedCoverLetter.body === coverLetter?.body;
      const sessionId = editSessionIdRef.current;
      const sentDraft = JSON.stringify(editedCoverLetter);
      const epochAtSave = discardEpochRef.current;
      // Save now, against the revision this editor opened on. If another write got
      // in first the draft is not applied: the editor stays open with the text in it.
      void commitEditorSave(sessionId, editStartRef.current, () => {
        useSessionStore.getState().updateSessionById(sessionId, {
          coverLetter: { ...rest, ...(keepStructured ? { structured } : {}), updatedAt: new Date().toISOString() },
        });
      }).then((outcome) => {
        // The draft was discarded while the save ran: the editor is already closed and nothing here reopens it.
        if (epochAtSave !== discardEpochRef.current) return;
        // Anything but a save the server confirmed leaves the editor open with the text in it.
        // So does typing during the save: the newer draft stays, now based on what was just saved.
        if (!editorShouldClose(outcome, sentDraft, JSON.stringify(editedCoverLetterRef.current))) {
          if (outcome === 'saved' || outcome === 'clean') editStartRef.current = getEditorStart(sessionId, editStartRef.current);
          return;
        }
        setIsEditMode(false);
        editSessionIdRef.current = null;
      });
    }
  };

  const renderCoverLetterContent = (letter: GeneratedCoverLetter) => {
    if (letter.applicantAddress.name) {
      return (
        <>
          <div className="text-sm text-charcoal mb-6">
            <p className="font-medium">{letter.applicantAddress.name}</p>
            {letter.applicantAddress.street && <p>{letter.applicantAddress.street}</p>}
            {letter.applicantAddress.city && <p>{letter.applicantAddress.city}</p>}
            {letter.applicantAddress.country && <p>{letter.applicantAddress.country}</p>}
            {letter.applicantAddress.phone && <p className="mt-2">{letter.applicantAddress.phone}</p>}
            {letter.applicantAddress.email && <p>{letter.applicantAddress.email}</p>}
          </div>
          {letter.date && <p className="text-sm text-charcoal mb-6">{letter.date}</p>}
          {letter.companyAddress.companyName && (
            <div className="text-sm text-charcoal mb-6">
              <p className="font-medium">{letter.companyAddress.companyName}</p>
              {letter.companyAddress.department && <p>{letter.companyAddress.department}</p>}
              {letter.companyAddress.street && <p>{letter.companyAddress.street}</p>}
              {letter.companyAddress.city && <p>{letter.companyAddress.city}</p>}
            </div>
          )}
          {letter.salutation && <p className="text-sm text-charcoal mb-4">{letter.salutation}</p>}
          <div className="text-sm text-charcoal whitespace-pre-wrap mb-6 leading-relaxed">
            {letter.body}
          </div>
          {letter.closing && <p className="text-sm text-charcoal mb-8">{letter.closing}</p>}
          {letter.signatureName && <p className="text-sm text-charcoal font-medium">{letter.signatureName}</p>}
        </>
      );
    }

    return (
      <div className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed">
        {letter.body}
      </div>
    );
  };

  const wordCount = activeCoverLetter ? countWords(formatCoverLetterAsText(activeCoverLetter)) : 0;
  const statusLabel = updatedAtMs !== null
    ? `Updated ${relativeLabel(updatedAtMs, nowMs, datePrefs)} · ${wordCount} words`
    : `${wordCount} words`;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = (
    <>
      {isEditMode ? (
        <>
          <span className="text-sm font-semibold text-navy-600 flex-shrink-0">Editing</span>
          <button
            type="button"
            onClick={handleSaveEdits}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-navy-600 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 transition-colors duration-200 cursor-pointer flex-shrink-0"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => { setIsEditMode(false); setEditedCoverLetter(coverLetter); }}
            className="h-9 px-3.5 text-sm font-medium text-warm-gray hover:text-charcoal rounded-full hover:bg-cream-100 transition-colors duration-200 cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => {
            editSessionIdRef.current = currentSession?.id ?? null;
            editStartRef.current = currentSession ? getEditorStart(currentSession.id) : undefined;
            setIsEditMode(true);
          }} className={TOOL_CLASS}>
            <Edit3 className="w-4 h-4 text-navy-500" />
            Edit
          </button>
          <button type="button" onClick={handleCopy} className={TOOL_CLASS}>
            {copied ? <Check className="w-4 h-4 text-gold-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={openLayoutPreview}
            disabled={layoutPreviewLoading || !currentSession?.id}
            className={`${TOOL_CLASS} disabled:opacity-60 disabled:cursor-wait`}
          >
            {layoutPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview layout
          </button>
          <div className="relative flex-shrink-0">
            <button
              ref={downloadButtonRef}
              type="button"
              onClick={() => setShowDownloadMenu((v) => !v)}
              disabled={downloadFormat !== null}
              aria-haspopup="menu"
              aria-expanded={showDownloadMenu}
              className={`${TOOL_CLASS} disabled:cursor-wait`}
            >
              <Download className="w-4 h-4" />
              {downloadFormat ? `Building ${downloadFormat.toUpperCase()}` : 'Download'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showDownloadMenu && typeof document !== 'undefined' && createPortal(
              <div
                ref={downloadMenuRef}
                role="menu"
                style={{
                  position: 'fixed',
                  top: downloadMenuPos?.top ?? -9999,
                  left: downloadMenuPos?.left ?? -9999,
                  width: DOWNLOAD_MENU_WIDTH,
                }}
                className="z-[60] overflow-hidden rounded-lg border border-cream-200 bg-cream-50 py-1 shadow-md"
              >
                <button type="button" role="menuitem" onClick={() => exportLetter('pdf')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-charcoal hover:bg-white cursor-pointer">
                  <FileText className="w-4 h-4 text-navy-500" />
                  PDF
                </button>
                <button type="button" role="menuitem" onClick={() => exportLetter('docx')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-charcoal hover:bg-white cursor-pointer">
                  <FileText className="w-4 h-4 text-navy-500" />
                  DOCX
                </button>
              </div>,
              document.body,
            )}
          </div>
          <span className="ml-auto flex-shrink-0 pl-2 text-[13px] text-warm-gray">{statusLabel}</span>
        </>
      )}
    </>
  );

  return (
    <>
    {/* Toolbar: portal to tab bar on desktop, inline on mobile */}
    {toolbarPortal && createPortal(toolbarContent, toolbarPortal)}

    <div className="h-full flex flex-col bg-cream-50">
      {/* Inline toolbar for mobile only (no portal) */}
      {!toolbarPortal && (
        <div className="px-3 sm:px-5 py-2.5 bg-cream-100 border-b border-gold-300/60 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {toolbarContent}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-cream-100 px-3 pb-4 pt-1 sm:px-6 sm:pb-6 sm:pt-3">
            <div className="relative mx-auto w-full max-w-2xl">
              {!isEditMode && activeCoverLetter && (
                <button
                  type="button"
                  onClick={() => setShowFullPreview(true)}
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-md cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Full Preview
                </button>
              )}
              <Card className="border-cream-200 bg-white p-8 shadow-md">
              {isEditMode ? (
                /* Edit Mode */
                <div className="space-y-2">
                  <p className="text-xs text-warm-gray mb-2">
                    Edit your cover letter content below. The full letter including salutation and closing is included.
                  </p>
                  <textarea
                    value={activeCoverLetter?.body || ''}
                    onChange={(e) => updateField('body', e.target.value)}
                    className="w-full text-sm text-charcoal leading-relaxed bg-cream-50 border border-cream-300 rounded px-3 py-3 focus:border-navy-400 focus:outline-none resize-none"
                    rows={20}
                    placeholder="Cover letter content..."
                  />
                </div>
              ) : (
                /* View Mode */
                activeCoverLetter ? renderCoverLetterContent(activeCoverLetter) : null
              )}
              </Card>
            </div>
      </div>



      {layoutPreview && <PdfPreviewModal url={layoutPreview.url} title="Cover letter layout" onClose={closeLayoutPreview} returnFocusTo={layoutOpenerRef.current} />}

      {showFullPreview && activeCoverLetter && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px]">
          <div className="relative flex h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[24px] border border-cream-200 bg-cream-100 shadow-lg">
            <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-charcoal">Cover Letter Full Preview</h2>
                <p className="text-xs text-warm-gray">Focused reading mode with the surrounding dashboard hidden.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullPreview(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream-200 bg-white text-warm-gray transition-colors hover:border-navy-200 hover:text-navy-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-cream-100 p-4 sm:p-6">
              <Card className="mx-auto w-full max-w-3xl p-8 sm:p-10 shadow-md">
                {renderCoverLetterContent(activeCoverLetter)}
              </Card>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </>
  );
}

'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { openSettings } from '@/store/useSettingsStore';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';

import { CVTemplateRenderer } from './cv-templates';
import { getTemplateById, hasDachPersonalData } from '@/lib/cv-templates/types';
import { TemplateStrip } from './cv-templates/TemplateStrip';
import { buildCvData } from '@/lib/cv-templates/build-cv-data';
import { writeDefaultTemplate } from '@/lib/cv-templates/default-template';
import type { CVData } from '@/lib/cv-templates/types';
import { useUIStore } from '@/store/useUIStore';
import {
  FileText,
  FileType2,
  Eye,
  ImagePlus,
  Download,
  Copy,
  Check,
  ArrowRight,
  Layout,
  ChevronDown,
  ChevronUp,
  Loader2,
  Edit3,
  Maximize2,
  X,
  Shield,
} from 'lucide-react';
import { EditableCVCanvas, EditableCVCanvasRef } from './EditableCVCanvas';
import { StepIndicator } from './StepIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './ui/Toast';
import { downloadBlob } from '@/lib/utils/download-pdf';
import { PdfPreviewModal } from './ui/PdfPreviewModal';
import { isSavedApplicationId, notifyExportFailure, serverExport, ServerExportError, trackExportFailure } from '@/lib/utils/server-export';
import { useRouter } from 'next/navigation';
import { promptAccountToDownload } from '@/components/kit/account-wall';
import { useLatest } from '@/hooks/useLatest';
import type { Profile } from '@/db/types';
import { acknowledgedStart, acknowledgementFor, afterClosedEditorSave, commitEditorSave, discardedSinceSave, editorSaveSucceeded, getEditorStart, persistSessionEdits, rebaseEditorStart, subscribeConflictAcknowledged, type EditorStart } from '@/lib/session-sync';

interface CVPanelProps {
  toolbarPortal?: HTMLDivElement | null;
  /** Row under the kit tabs: Original/Tailored toggle and the ATS chip. */
  headerPortal?: HTMLDivElement | null;
  /** True while the ATS "what changed" view covers the CV. */
  atsOpen?: boolean;
  onOpenAts?: () => void;
}

export function CVPanel({ toolbarPortal, headerPortal, atsOpen = false, onOpenAts }: CVPanelProps = {}) {
  const {
    currentCV,
    structuredCV,
    currentSession,
    isGenerating,
    isAnalyzing,
    isAgentWorking,
    agentWorkflowPhase,
    profilePhoto,
    setProfilePhoto,
  } = useAppStore();
  const editedOriginalCVData = useCVStore(state => state.editedOriginalCVData);

  const { user, profile, updateProfile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const generatedCV = currentSession?.generatedCV;
  const optimizedCVData = currentSession?.optimizedCVData;  // Solution B: Structured JSON from AI
  
  const [showOptimized, setShowOptimized] = useState(true);
  // The template lives in the UI store so Download all renders the same one
  // from every kit tab. The picked template also becomes the saved default.
  const selectedTemplateId = useUIStore((s) => s.cvTemplateId);
  const setCvTemplateId = useUIStore((s) => s.setCvTemplateId);
  const setSelectedTemplateId = (id: string) => {
    setCvTemplateId(id);
    // The application stores its own template too, so the chat can answer
    // "which template is this using" without guessing.
    useSessionStore.getState().updateCurrentSession({ selectedTemplate: id });
    const templateSessionId = useSessionStore.getState().currentSession?.id;
    if (templateSessionId) void persistSessionEdits(templateSessionId);
    writeDefaultTemplate(id);
  };
  const [showTemplates, setShowTemplates] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);
  // In-flight guards that a toast's Try again can't bypass (the disabled button only stops clicks).
  const pdfBusyRef = useRef(false);
  const wordBusyRef = useRef(false);
  // The rendered PDF the server would export, shown with its real page breaks before anyone downloads.
  const [pdfPreview, setPdfPreview] = useState<{ url: string } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewOpenerRef = useRef<HTMLElement | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = useRef(false);
  useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);
  const [showFullPreview, setShowFullPreview] = useState(false);
  // Compact, the canvas folds with this panel still mounted behind its rail.
  // The full preview is portaled out of the canvas, where inert can't reach
  // it, so it closes with the fold.
  const canvasCollapsed = useUIStore((s) => s.canvasCollapsed);
  useEffect(() => {
    if (canvasCollapsed) setShowFullPreview(false);
  }, [canvasCollapsed]);
  const [editedCVData, setEditedCVData] = useState<CVData | null>(null);
  const editableCVRef = useRef<EditableCVCanvasRef>(null);
  const editSessionIdRef = useRef<string | null>(null);
  // The revision the editor opened on; the draft lives outside the store (see commitEditorSave).
  const editStartRef = useRef<EditorStart | undefined>(undefined);
  // Counts the discards of CV conflict text that reached this editor. A save that is still running when the
  // draft is discarded sees the count has moved and does not reopen the draft when its answer comes back.
  const discardEpochRef = useRef(0);
  // When the user deals with a conflict notice this editor's CV draft produced (restores or copies the text), the
  // editor is based on the CV version that notice showed, so its next Save is not refused again for the same change.
  // Discarding that text drops the draft, as Cancel does. Other editors' notices and other fields' leave it alone.
  useEffect(() => subscribeConflictAcknowledged((acknowledged, ack) => {
    if (editSessionIdRef.current !== acknowledged) return;
    const action = acknowledgementFor(ack, ['cv'], editStartRef.current);
    if (action === 'ignore') return;
    if (action === 'reset') {
      discardEpochRef.current += 1;
      setIsEditMode(false);
      setEditedCVData(null);
      editSessionIdRef.current = null;
      editStartRef.current = undefined;
      return;
    }
    editStartRef.current = acknowledgedStart(ack, ['cv'], editStartRef.current);
  }), []);
  useEffect(() => {
    if (editSessionIdRef.current === null || editSessionIdRef.current === currentSession?.id) return;
    editSessionIdRef.current = null;
    setIsEditMode(false);
    setEditedCVData(null);
  }, [currentSession?.id]);

  // Responsive CV scaling — JS-based because CSS transform: scale can't dynamically
  // compensate for the CV template's fixed width (8.5in / 210mm).
  const cvContainerRef = useRef<HTMLDivElement>(null);
  // The view container mounts only once there is a CV to show, which on a
  // fresh device is after the session loads. Held in state too, so the scale
  // effect runs again when it appears instead of never observing it.
  const [cvContainerNode, setCvContainerNode] = useState<HTMLDivElement | null>(null);
  const attachCvContainer = useCallback((node: HTMLDivElement | null) => {
    cvContainerRef.current = node;
    setCvContainerNode(node);
  }, []);
  const cvWrapperRef = useRef<HTMLDivElement>(null);
  const [cvScale, setCvScale] = useState(1);
  const [cvScaledHeight, setCvScaledHeight] = useState<number | null>(null);

  // A layout effect, so the first paint already has the page scaled: measured
  // only after paint, a canvas narrower than the page flashed it at full size.
  useLayoutEffect(() => {
    let rafId: number | null = null;

    const measure = () => {
      if (!cvContainerRef.current || !cvWrapperRef.current) return;
      const containerWidth = cvContainerRef.current.clientWidth;
      // scrollWidth gives the actual rendered width, unaffected by transform: scale
      const naturalWidth = cvWrapperRef.current.scrollWidth;
      const naturalHeight = cvWrapperRef.current.scrollHeight;
      if (containerWidth > 0 && naturalWidth > 0 && containerWidth < naturalWidth) {
        const newScale = containerWidth / naturalWidth;
        setCvScale(newScale);
        setCvScaledHeight(naturalHeight > 0 ? Math.ceil(naturalHeight * newScale) : null);
      } else {
        setCvScale(1);
        setCvScaledHeight(null);
      }
    };

    const updateScale = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    measure();
    // Measure again once fonts and the photo have settled the template's size
    const timer = setTimeout(updateScale, 50);
    // Watch container width changes (window resize, chat panel resize)
    const roContainer = new ResizeObserver(updateScale);
    // Watch CV wrapper height changes (content switches: original ↔ optimized)
    const roWrapper = new ResizeObserver(updateScale);
    if (cvContainerRef.current) roContainer.observe(cvContainerRef.current);
    if (cvWrapperRef.current) roWrapper.observe(cvWrapperRef.current);
    return () => {
      clearTimeout(timer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      roContainer.disconnect();
      roWrapper.disconnect();
    };
  // selectedTemplateId triggers re-mount of CVTemplateRenderer, and the view
  // container can mount late (see attachCvContainer); ResizeObserver handles rest
  }, [selectedTemplateId, cvContainerNode]);

  // Refresh photo URL when a Supabase signed URL has expired (long sessions).
  // base64 data URLs are always valid; only re-check external URLs.
  useEffect(() => {
    if (!user || !profilePhoto?.dataUrl) return;
    if (profilePhoto.dataUrl.startsWith('data:')) return;

    let cancelled = false;
    const img = new Image();
    img.onerror = async () => {
      try {
        const { getProfilePhotoUrl } = await import('@/lib/supabase/storage');
        const { url } = await getProfilePhotoUrl(user.id);
        // A remove (or newer photo) changed the store meanwhile: stay out.
        if (url && !cancelled) {
          setProfilePhoto({ ...profilePhoto, dataUrl: url });
        }
      } catch { /* ignore */ }
    };
    img.src = profilePhoto.dataUrl;
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profilePhoto?.dataUrl]);

  const photoDataUrl = profilePhoto?.dataUrl;

  const cvData: CVData | null = useMemo(() => buildCvData({
    structuredCV,
    optimizedCVData,
    showOptimized,
    editedOriginalCVData,
    photoDataUrl,
    profile,
  }), [structuredCV, showOptimized, photoDataUrl, optimizedCVData, profile, editedOriginalCVData]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
      toast.error('Couldn\'t copy. Select the text and copy it by hand.');
    }
  };

  // A saved application exports through its row; otherwise the signed-in user's own base CV
  // (POST /api/exports with no applicationId). The canvas goes along either way.
  const exportApplicationId = (): string | undefined => {
    const id = currentSession?.id;
    return isSavedApplicationId(id) ? id : undefined;
  };

  // How many base exports in a row found no saved CV. Reset by any other outcome.
  const noSavedCvRef = useRef(0);
  const notifyCvExportFailure = (err: unknown, applicationId: string | undefined, label: string, retry: () => void) => {
    if (!applicationId && err instanceof ServerExportError && err.code === 'NO_CV') {
      noSavedCvRef.current += 1;
      // Right after sign-up the CV carried over from this browser can still be saving. A second miss means it
      // never reached the account, and another wait won't change that.
      if (noSavedCvRef.current === 1) {
        toast.error('Your CV is still saving. Try again in a moment.', 10000, [{ label: 'Try again', onClick: retry }]);
      } else {
        toast.error("We couldn't find your saved CV. Upload it again in Settings, then download.", 8000);
      }
      return;
    }
    noSavedCvRef.current = 0;
    notifyExportFailure(toast, err, label, retry);
  };

  const handleDownloadPDF = async () => {
    if (!cvData || pdfBusyRef.current) return;
    if (!user) {
      promptAccountToDownload(toast, router.push, 'CV', authLoading);
      return;
    }
    const applicationId = exportApplicationId();
    pdfBusyRef.current = true;
    setIsDownloading(true);
    try {
      // The server renders the same template to a text PDF. What the canvas shows
      // goes along, so a download right after an edit matches the screen.
      const { blob, fileName } = await serverExport({
        applicationId,
        format: 'cv_pdf',
        templateId: selectedTemplateId,
        variant: showOptimized ? 'tailored' : 'original',
        cv: cvData,
      });
      await downloadBlob(blob, fileName);
      noSavedCvRef.current = 0;
      toast.success('PDF downloaded.');
    } catch (err) {
      console.error('PDF export failed:', err);
      trackExportFailure('cv_pdf', err);
      notifyCvExportFailure(err, applicationId, 'PDF', () => { void latestDownloadPDF.current(); });
    } finally {
      pdfBusyRef.current = false;
      setIsDownloading(false);
    }
  };

  const handlePreviewPdf = async () => {
    if (!cvData) return;
    if (!user) {
      promptAccountToDownload(toast, router.push, 'CV', authLoading);
      return;
    }
    const applicationId = exportApplicationId();
    previewOpenerRef.current = document.activeElement as HTMLElement | null;
    setIsPreviewing(true);
    try {
      const { blob } = await serverExport({
        applicationId,
        format: 'cv_pdf',
        templateId: selectedTemplateId,
        variant: showOptimized ? 'tailored' : 'original',
        cv: cvData,
      });
      setPdfPreview({ url: URL.createObjectURL(blob) });
    } catch (err) {
      console.error('PDF preview failed:', err);
      toast.error("The preview didn't build. Try again in a moment.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const closePdfPreview = () => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const handleDownloadWord = async () => {
    if (!cvData || wordBusyRef.current) return;
    if (!user) {
      promptAccountToDownload(toast, router.push, 'CV', authLoading);
      return;
    }
    const applicationId = exportApplicationId();
    wordBusyRef.current = true;
    setIsDownloadingWord(true);
    try {
      const { blob, fileName } = await serverExport({
        applicationId,
        format: 'cv_docx',
        templateId: selectedTemplateId,
        variant: showOptimized ? 'tailored' : 'original',
        cv: cvData,
      });
      await downloadBlob(blob, fileName);
      noSavedCvRef.current = 0;
      toast.success('Word file downloaded.');
    } catch (err) {
      console.error('Word export failed:', err);
      trackExportFailure('cv_docx', err);
      notifyCvExportFailure(err, applicationId, 'Word file', () => { void latestDownloadWord.current(); });
    } finally {
      wordBusyRef.current = false;
      setIsDownloadingWord(false);
    }
  };
  // A toast's Try again runs the handler as it is now (the current application, template and edits).
  const latestDownloadPDF = useLatest(handleDownloadPDF);
  const latestDownloadWord = useLatest(handleDownloadWord);

  if (!currentCV) {
    return (
      <div className="h-full flex items-center justify-center bg-surface p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-card bg-canvas flex items-center justify-center mx-auto mb-5">
            <FileText className="w-8 h-8 text-ink-ghost" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-ink-body mb-2">No CV uploaded</h3>
          <p className="text-sm text-ink-muted mb-6 leading-relaxed">
            Upload your CV in Settings to get started.
          </p>
          <Button variant="gold" onClick={() => openSettings('cv')}>
            Upload your CV
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <p className="text-xs text-ink-muted/80 mt-4 leading-relaxed">
            Then paste a job description and Useful Apply tailors your CV, cover letter and emails.
          </p>
        </div>
      </div>
    );
  }

  const isLoading = isAnalyzing || isGenerating || isAgentWorking;
  const displayContent = showOptimized && generatedCV ? generatedCV.content : currentCV.rawText;
  // The edited buffer only ever paints the edit canvas. Outside edit mode the
  // store is the source of truth: a chat edit applied while a stale buffer
  // lingered would otherwise stay invisible until a reload.
  const previewCVData = isEditMode ? (editedCVData || cvData) : cvData;
  const atsScore = optimizedCVData?.analysis?.ats_compatibility ?? null;
  const hasAtsInsights = Boolean(optimizedCVData?.analysis || generatedCV?.changes?.length);
  const TOOL_CLASS = 'flex items-center gap-2 h-9 px-3.5 text-sm font-medium bg-surface border border-border rounded-pill hover:bg-surface-raised transition-colors duration-(--duration-base) cursor-pointer flex-shrink-0 shadow-resting text-ink-body';

  // Row under the kit tabs: which version, whose job, and the way into the
  // ATS view. Only meaningful once a tailored CV exists.
  const headerContent = generatedCV ? (
    <>
      <div className="flex items-center bg-surface border border-border rounded-pill p-0.5 shadow-resting flex-shrink-0">
        <button
          type="button"
          onClick={() => { setShowOptimized(false); setEditedCVData(null); }}
          className={`px-3.5 py-1.5 text-sm rounded-pill transition-colors duration-(--duration-base) cursor-pointer ${
            !showOptimized ? 'bg-surface-raised text-ink shadow-resting font-semibold' : 'font-medium text-ink-muted hover:text-ink-body'
          }`}
        >
          Original
        </button>
        <button
          type="button"
          onClick={() => { setShowOptimized(true); setEditedCVData(null); }}
          className={`px-3.5 py-1.5 text-sm rounded-pill transition-colors duration-(--duration-base) cursor-pointer ${
            showOptimized ? 'bg-surface-raised text-ink shadow-resting font-semibold' : 'font-medium text-ink-muted hover:text-ink-body'
          }`}
        >
          Tailored
        </button>
      </div>
      {/* Only where the row has room for it: squeezed, it shrank to a stray glyph. */}
      {currentSession?.company && (
        <span className="hidden truncate text-[13px] text-ink-muted @[35rem]:block">Tailored for {currentSession.company}.</span>
      )}
      <div className="flex-1" />
      {(atsScore !== null || hasAtsInsights) && onOpenAts && (
        <button
          type="button"
          onClick={onOpenAts}
          className={`inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-pill bg-success-soft px-3 text-[13px] font-semibold text-success-strong cursor-pointer ${
            atsOpen ? 'ring-[1.5px] ring-inset ring-border-success' : ''
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          {atsScore !== null ? `ATS ${atsScore}%` : 'ATS insights'}
          <span className="font-medium opacity-85">· see every change</span>
        </button>
      )}
    </>
  ) : null;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = (
    <>
      {/* Templates strip toggle */}
      {!isEditMode && (
        <button
          type="button"
          onClick={() => setShowTemplates((v) => !v)}
          aria-expanded={showTemplates}
          className={`${TOOL_CLASS} ${showTemplates ? 'bg-surface-raised border-border-accent-soft text-ink' : ''}`}
        >
          <Layout className="w-4 h-4 text-brand-mid" />
          <span>Templates</span>
          {showTemplates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}

      {/* Edit button */}
      {!isEditMode && cvData && (
        <button
          type="button"
          onClick={() => {
            setIsEditMode(true);
            editSessionIdRef.current = currentSession?.id ?? null;
            editStartRef.current = currentSession ? getEditorStart(currentSession.id) : undefined;
            setShowTemplates(false);
            if (cvData && !editedCVData) setEditedCVData(cvData);
          }}
          className={TOOL_CLASS}
        >
          <Edit3 className="w-4 h-4 text-brand-mid" />
          <span>Edit</span>
        </button>
      )}

      {/* Edit mode indicators */}
      {isEditMode && (
        <>
          <span className="text-sm font-semibold text-brand flex-shrink-0">Editing</span>
          <button
            type="button"
            onClick={() => { setIsEditMode(false); setEditedCVData(null); }}
            className="h-9 px-3.5 text-sm font-medium text-ink-muted hover:text-ink-body rounded-pill hover:bg-canvas transition-colors duration-(--duration-base) cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              // Save changes via ref, then exit edit mode
              editableCVRef.current?.save();
              setEditedCVData(null);
              setIsEditMode(false);
            }}
            className="h-9 px-3.5 text-sm font-semibold text-brand-ink bg-brand hover:bg-brand-strong rounded-pill transition-colors duration-(--duration-base) cursor-pointer flex-shrink-0 shadow-resting"
          >
            <Check className="w-4 h-4 inline mr-1.5" />
            Save changes
          </button>
        </>
      )}

      {/* Action buttons — visible when not editing */}
      {!isEditMode && (
        <>
          <button
            type="button"
            onClick={() => handleCopy(displayContent)}
            title="Copy to clipboard"
            className={TOOL_CLASS}
          >
            {copied ? <Check className="w-4 h-4 text-ink-accent" /> : <Copy className="w-4 h-4" />}
            Copy
          </button>
          {/* A template with a photo slot and no photo yet: the way to add one lives here, so the page itself never
              shows a placeholder the PDF would not have. */}
          {getTemplateById(selectedTemplateId)?.includesPhoto && !cvData?.personal.photoUrl && (
            <button
              type="button"
              onClick={() => openSettings('general')}
              title="Add your photo in Settings"
              className={TOOL_CLASS}
            >
              <ImagePlus className="w-4 h-4" />
              Add photo
            </button>
          )}
          <button
            type="button"
            onClick={handlePreviewPdf}
            disabled={isPreviewing || !cvData}
            title="Preview the PDF with its page breaks"
            className={`${TOOL_CLASS} disabled:opacity-60 disabled:cursor-wait`}
          >
            {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={isDownloading || !cvData}
            title="Download as PDF"
            className={`${TOOL_CLASS} disabled:opacity-60 disabled:cursor-wait`}
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {/* A narrow toolbar drops the shared "Download" (the icon and the title carry it), so the row breaks
                into two clean lines instead of orphaning a button. Screen readers still hear the whole name. */}
            <span><span className="@max-[50rem]:sr-only">Download </span>PDF</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadWord}
            disabled={isDownloadingWord || !cvData}
            title="Download as Word"
            className={`${TOOL_CLASS} disabled:opacity-60 disabled:cursor-wait`}
          >
            {isDownloadingWord ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileType2 className="w-4 h-4" />
            )}
            <span><span className="@max-[50rem]:sr-only">Download </span>Word</span>
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="h-full flex flex-col bg-surface">
      {pdfPreview && <PdfPreviewModal url={pdfPreview.url} title="CV preview" onClose={closePdfPreview} returnFocusTo={previewOpenerRef.current} />}
      {/* Header row + toolbar: portal to the canvas chrome on desktop, inline on mobile */}
      {headerContent && headerPortal && createPortal(headerContent, headerPortal)}
      {toolbarContent && toolbarPortal && createPortal(toolbarContent, toolbarPortal)}
      {toolbarContent && !toolbarPortal && (
        <div className="px-3 sm:px-5 py-2.5 bg-canvas border-b border-border-accent/60 flex-shrink-0 relative">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pr-6">
            {headerContent}
            {toolbarContent}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading && !currentCV ? (
          <StepIndicator
            stepType="cv"
            isLoading={true}
            title={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing Fit' : undefined}
            message={agentWorkflowPhase === 'fit_analysis'
              ? 'Matching your profile to this role...'
              : isAnalyzing
                ? 'Understanding job requirements...'
                : 'Tailoring your CV for this role...'
            }
            statusLabel={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing...' : undefined}
          />
        ) : (
          <div className="h-full flex flex-col">

            {/* Pre-generation state. Without this, a freshly uploaded CV renders
                as a finished, typeset document and the whole left column reads
                "you're done" — which is why users never notice that pasting a
                job ad in the chat panel is the point of the product.

                The condition mirrors ChatPanel's launchpad state on purpose, so
                the CTA always lands on a mounted, enabled job-description
                field. Keying on `!generatedCV` alone would show it after a fit
                analysis too, where the real next action is "Generate Kit" and
                re-pasting the job ad silently discards the 0.5 credits the user
                already spent. */}
            {!generatedCV
              && !isEditMode
              && !currentSession?.jobDescription
              && !currentSession?.chatMessages?.length && (
              <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-2.5 sm:px-6">
                <p className="text-sm text-ink-muted">
                  <span className="font-semibold text-ink">Base CV.</span>{' '}
                  Not tailored to this job yet.
                </p>
              </div>
            )}

            {/* The last kit run delivered the other documents but not the
                tailored CV. There is no single-document CV regenerate, so
                there is no retry here: the base CV stays usable and the
                chat names what happened. */}
            {!generatedCV && !isEditMode && currentSession?.kitDocumentErrors?.cv && (
              <div role="alert" className="flex-shrink-0 border-b border-border bg-surface px-4 py-2.5 sm:px-6">
                <p className="text-sm text-ink-muted">
                  <span className="font-semibold text-ink">We couldn&apos;t tailor your CV for this job.</span>{' '}
                  This is your base CV. To try again, paste the job ad in the chat for a new kit.
                </p>
              </div>
            )}

            {showTemplates && !isEditMode && (
              <TemplateStrip
                selectedTemplateId={selectedTemplateId}
                onSelect={setSelectedTemplateId}
                hasDachData={Boolean(cvData && hasDachPersonalData(cvData.personal))}
              />
            )}

            {/* CV Content - View Mode or Edit Mode */}
            <div className="flex-1 overflow-auto bg-canvas p-2 sm:p-6">
              {isEditMode && cvData ? (
                /* Edit Mode - Editable Canvas */
                <div className="flex flex-col h-full">
                  <EditableCVCanvas
                    ref={editableCVRef}
                    cvData={editedCVData || cvData}
                    onSave={(updatedData) => {
                      setEditedCVData(updatedData);

                      // Persist edits to store and Supabase
                      if (showOptimized && generatedCV) {
                        // For optimized CV, update session store (auto-syncs to Supabase)
                        // Preserve analysis, sectionHeaders, localizedStrings from original optimizedCVData
                        const editSessionId = editSessionIdRef.current;
                        if (!editSessionId) return;
                        const epochAtSave = discardEpochRef.current;
                        const startAtSave = editStartRef.current;
                        const sessionState = useSessionStore.getState();
                        const existingSession = sessionState.sessions.find((session) => session.id === editSessionId)
                          ?? (sessionState.currentSession?.id === editSessionId ? sessionState.currentSession : undefined);
                        const existing = existingSession?.optimizedCVData;
                        // Save now, against the revision this editor opened on. If another
                        // write got in first the draft is not applied: the editor reopens
                        // with the text in it so it can be copied.
                        void commitEditorSave(editSessionId, startAtSave, () => {
                          // This runs once the sync lock is free. A draft discarded since the click is not written.
                          if (discardedSinceSave(epochAtSave, discardEpochRef.current)) return;
                          useSessionStore.getState().updateSessionById(editSessionId, {
                            optimizedCVData: {
                              ...updatedData,
                              analysis: existing?.analysis,
                              sectionHeaders: existing?.sectionHeaders,
                              localizedStrings: existing?.localizedStrings,
                            } as ApplicationSession['optimizedCVData'],
                          });
                        }).then((outcome) => {
                          // Anything but a save the server confirmed reopens the editor with the text in it.
                          if (editorSaveSucceeded(outcome)) {
                            // An editor the user opened again while this save ran was opened on the draft this save
                            // wrote, against the old revision; the save landed, so base exactly those columns on it.
                            if (isEditModeRef.current && editSessionIdRef.current === editSessionId && editStartRef.current) {
                              editStartRef.current = rebaseEditorStart(editSessionId, editStartRef.current, startAtSave?.lineage.columns ?? []);
                            }
                            return;
                          }
                          // The user may have opened the editor again while this save ran; theirs stands.
                          if (isEditModeRef.current) return;
                          // A discard while the save ran threw this draft away: it must not come back. A draft
                          // that does come back always has a start, so its next Save is checked against the server.
                          const again = afterClosedEditorSave(outcome, epochAtSave, discardEpochRef.current, editStartRef.current);
                          if (!again.reopen) return;
                          editStartRef.current = again.start;
                          editSessionIdRef.current = editSessionId;
                          setEditedCVData(updatedData);
                          setIsEditMode(true);
                        });
                      } else {
                        // For original CV, persist to CV store (syncs to Supabase via useSupabaseSync)
                        useCVStore.getState().setEditedOriginalCVData(updatedData);
                      }

                      // Save personal links to profiles table
                      const p = updatedData.personal;
                      const linkUpdates: Partial<Profile> = {};
                      if (p.linkedIn !== undefined) linkUpdates.linkedin_url = p.linkedIn || null;
                      if (p.github !== undefined) linkUpdates.github_url = p.github || null;
                      if (p.portfolio !== undefined) linkUpdates.portfolio_url = p.portfolio || null;
                      if (p.website !== undefined) linkUpdates.website_url = p.website || null;
                      if (p.dateOfBirth !== undefined) linkUpdates.date_of_birth = p.dateOfBirth || null;
                      if (p.nationality !== undefined) linkUpdates.nationality = p.nationality || null;
                      if (Object.keys(linkUpdates).length > 0) {
                        updateProfile(linkUpdates).catch((err: unknown) =>
                          console.error('[CVPanel] Failed to save personal links:', err)
                        );
                      }
                    }}
                    onAIImprove={async (section, content) => {
                      return content;
                    }}
                  />
                </div>
              ) : cvData ? (
                /* View Mode - Template Preview */
                <div ref={attachCvContainer} className="flex flex-col items-center">
                  {/* Size wrapper: reserves the correct visual space after scaling,
                      and clips the layout overflow that transform: scale doesn't affect */}
                  <div
                    className="relative"
                    style={{
                      width: cvScale < 1 ? Math.ceil((cvWrapperRef.current?.scrollWidth ?? 816) * cvScale) : undefined,
                      height: cvScaledHeight ?? undefined,
                      overflow: cvScale < 1 ? 'hidden' : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowFullPreview(true)}
                      className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-brand-strong shadow-resting transition-[box-shadow,border-color] duration-(--duration-base) ease-standard hover:border-border-accent-soft hover:shadow-elevated cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Full Preview
                    </button>
                    <div
                      ref={cvWrapperRef}
                      className="relative bg-document shadow-elevated"
                      style={cvScale < 1 ? {
                        transform: `scale(${cvScale})`,
                        transformOrigin: 'top left',
                        willChange: 'transform',
                      } : undefined}
                    >
                      <div>
                        <CVTemplateRenderer data={cvData} templateId={selectedTemplateId} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Card className="bg-document">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink-body leading-relaxed">
                    {displayContent}
                  </pre>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sign Up Wall Modal */}
      {showFullPreview && previewCVData && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-surface-inverse-strong/45 p-4">
          <div className="relative flex h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-modal border border-border bg-canvas shadow-floating">
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-ink-body">CV Full Preview</h2>
                <p className="text-xs text-ink-muted">Focused reading mode with the surrounding dashboard hidden.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullPreview(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-surface-raised text-ink-muted transition-colors hover:border-border-brand-soft hover:text-brand-strong cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
              <div className="mx-auto w-fit bg-document shadow-elevated">
                <CVTemplateRenderer data={previewCVData} templateId={selectedTemplateId} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';

import { CVTemplateRenderer } from './cv-templates';
import { TemplateStrip } from './cv-templates/TemplateStrip';
import { buildCvData } from '@/lib/cv-templates/build-cv-data';
import { writeDefaultTemplate } from '@/lib/cv-templates/default-template';
import type { CVData } from '@/lib/cv-templates/types';
import { useUIStore } from '@/store/useUIStore';
import { CV_PAGE_GUTTER_PX, generateCvPdfBlob } from '@/lib/utils/cv-pdf';
import { kitFilename } from '@/lib/utils/kit-export';
import {
  FileText,
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
  Camera,
  Trash2,
  Shield,
} from 'lucide-react';
import { uploadProfilePhoto } from '@/lib/supabase/storage';
import type { ProfilePhoto } from '@/store/useCVStore';
import { EditableCVCanvas, EditableCVCanvasRef } from './EditableCVCanvas';
import { StepIndicator } from './StepIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './ui/Toast';
import { downloadBlob } from '@/lib/utils/download-pdf';

const PHOTO_TEMPLATE_IDS = new Set(['german-ats', 'german-classic']);

function resizeImage(file: File, maxSize: number, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image load failed'));
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * (maxSize / w)); w = maxSize; }
          else { w = Math.round(w * (maxSize / h)); h = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not get 2d context'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface CVPanelProps {
  toolbarPortal?: HTMLDivElement | null;
  /** Row under the kit tabs: Original/Tailored toggle and the ATS chip. */
  headerPortal?: HTMLDivElement | null;
  /** True while the ATS "what changed" view covers the CV. */
  atsOpen?: boolean;
  onOpenAts?: () => void;
}

export function CVPanel({ toolbarPortal, headerPortal, atsOpen = false, onOpenAts }: CVPanelProps = {}) {
  const router = useRouter();
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

  const { user, profile, updateProfile } = useAuth();
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
    writeDefaultTemplate(id);
  };
  const [showTemplates, setShowTemplates] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [editedCVData, setEditedCVData] = useState<CVData | null>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const cvTemplateRef = useRef<HTMLDivElement>(null);
  const editableCVRef = useRef<EditableCVCanvasRef>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isPhotoTemplate = PHOTO_TEMPLATE_IDS.has(selectedTemplateId);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      const dataUrl = await resizeImage(file, 800);
      const photo: ProfilePhoto = {
        id: `photo-${Date.now()}`,
        fileName: file.name,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
      setProfilePhoto(photo);

      if (user) {
        try {
          const { url, error } = await uploadProfilePhoto(user.id, file);
          if (error) {
            console.error('Photo upload to Supabase failed:', error);
            toast.warning('Photo saved locally — cloud sync failed');
          } else if (url) {
            setProfilePhoto({ ...photo, dataUrl: url });
          }
        } catch (err) {
          console.error('Photo upload exception:', err);
        }
      }
    } catch {
      toast.error('Failed to process image');
    }
  };

  // Responsive CV scaling — JS-based because CSS transform: scale can't dynamically
  // compensate for the CV template's fixed width (8.5in / 210mm).
  const cvContainerRef = useRef<HTMLDivElement>(null);
  const cvWrapperRef = useRef<HTMLDivElement>(null);
  const [cvScale, setCvScale] = useState(1);
  const [cvScaledHeight, setCvScaledHeight] = useState<number | null>(null);

  useEffect(() => {
    let rafId: number | null = null;

    const updateScale = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
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
        // Page break indicator positions (in natural pixels, before any CSS transform).
        // Use contentHeightPx (not full pageHeightPx) so the line matches the PDF cut point.
        const isGerman = selectedTemplateId.startsWith('german');
        const pageHeightPx = isGerman ? Math.round((297 / 25.4) * 96) : 1056;
        const contentHeightPx = pageHeightPx - 2 * CV_PAGE_GUTTER_PX;
        const breaks: number[] = [];
        for (let y = contentHeightPx; y < naturalHeight; y += contentHeightPx) {
          breaks.push(y);
        }
        setPageBreaks(breaks);
      });
    };

    // Delay slightly so the CV template renders at its natural size first
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
  // selectedTemplateId triggers re-mount of CVTemplateRenderer; ResizeObserver handles rest
  }, [selectedTemplateId]);

  // Refresh photo URL when a Supabase signed URL has expired (long sessions).
  // base64 data URLs are always valid; only re-check external URLs.
  useEffect(() => {
    if (!user || !profilePhoto?.dataUrl) return;
    if (profilePhoto.dataUrl.startsWith('data:')) return;

    const img = new Image();
    img.onerror = async () => {
      try {
        const { getProfilePhotoUrl } = await import('@/lib/supabase/storage');
        const { url } = await getProfilePhotoUrl(user.id);
        if (url) {
          setProfilePhoto({ ...profilePhoto, dataUrl: url });
        }
      } catch { /* ignore */ }
    };
    img.src = profilePhoto.dataUrl;
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

  const handleDownloadPDF = async () => {
    if (!cvTemplateRef.current || !cvData) return;

    setIsDownloading(true);
    // The step name lands in the error toast so a failure can be placed.
    let step = 'init';
    try {
      const filename = kitFilename(
        cvData.personal.fullName || 'Applicant',
        showOptimized ? (currentSession?.company || '') : '',
        'CV',
        'pdf',
      );
      const blob = await generateCvPdfBlob(cvTemplateRef.current, {
        templateId: selectedTemplateId,
        photoUrl: cvData.personal.photoUrl,
        onStep: (name) => { step = name; },
      });
      await downloadBlob(blob, filename);
      toast.success('PDF downloaded.');
    } catch (err) {
      console.error('PDF generation failed:', err);
      const errMsg = err instanceof Error ? err.message.slice(0, 80) : 'Unknown error';
      toast.error(`PDF failed at [${step}]: ${errMsg}`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!currentCV) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <FileText className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">No CV uploaded</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Upload your CV from the Documents library to get started with AI-powered optimization.
          </p>
          <Button variant="gold" onClick={() => router.push('/documents')}>
            Open Documents
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <p className="text-xs text-warm-gray/80 mt-4 leading-relaxed">
            Then paste a job description and Useful Apply tailors your CV, cover letter and emails.
          </p>
        </div>
      </div>
    );
  }

  const isLoading = isAnalyzing || isGenerating || isAgentWorking;
  const displayContent = showOptimized && generatedCV ? generatedCV.content : currentCV.rawText;
  const previewCVData = editedCVData || cvData;
  const atsScore = optimizedCVData?.analysis?.ats_compatibility ?? null;
  const hasAtsInsights = Boolean(optimizedCVData?.analysis || generatedCV?.changes?.length);
  const TOOL_CLASS = 'flex items-center gap-2 h-9 px-3.5 text-sm font-medium bg-cream-50 border border-cream-200 rounded-full hover:bg-white transition-colors duration-200 cursor-pointer flex-shrink-0 shadow-sm text-charcoal';

  // Row under the kit tabs: which version, whose job, and the way into the
  // ATS view. Only meaningful once a tailored CV exists.
  const headerContent = generatedCV ? (
    <>
      <div className="flex items-center bg-cream-50 border border-cream-200 rounded-full p-0.5 shadow-sm flex-shrink-0">
        <button
          type="button"
          onClick={() => { setShowOptimized(false); setEditedCVData(null); }}
          className={`px-3.5 py-1.5 text-sm rounded-full transition-colors duration-200 cursor-pointer ${
            !showOptimized ? 'bg-white text-navy-800 shadow-sm font-semibold' : 'font-medium text-warm-gray hover:text-charcoal'
          }`}
        >
          Original
        </button>
        <button
          type="button"
          onClick={() => { setShowOptimized(true); setEditedCVData(null); }}
          className={`px-3.5 py-1.5 text-sm rounded-full transition-colors duration-200 cursor-pointer ${
            showOptimized ? 'bg-white text-navy-800 shadow-sm font-semibold' : 'font-medium text-warm-gray hover:text-charcoal'
          }`}
        >
          Tailored
        </button>
      </div>
      {currentSession?.company && (
        <span className="truncate text-[13px] text-warm-gray">Tailored for {currentSession.company}.</span>
      )}
      <div className="flex-1" />
      {(atsScore !== null || hasAtsInsights) && onOpenAts && (
        <button
          type="button"
          onClick={onOpenAts}
          className={`inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full bg-sage-50 px-3 text-[13px] font-semibold text-sage-700 cursor-pointer ${
            atsOpen ? 'ring-[1.5px] ring-inset ring-sage-300' : ''
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
          className={`${TOOL_CLASS} ${showTemplates ? 'bg-white border-gold-200 text-navy-800' : ''}`}
        >
          <Layout className="w-4 h-4 text-navy-500" />
          <span>Templates</span>
          {showTemplates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}

      {/* Photo upload button — only for photo-supporting templates */}
      {!isEditMode && isPhotoTemplate && (
        <>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          {profilePhoto ? (
            <div className="group relative flex-shrink-0">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-300 bg-gold-50 text-navy-600 shadow-sm transition-all hover:bg-gold-100 hover:border-gold-400"
                title={`Change photo (${profilePhoto.fileName})`}
                aria-label={`Change photo (${profilePhoto.fileName})`}
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setProfilePhoto(null); }}
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-warm-gray opacity-0 shadow ring-1 ring-cream-300 transition-opacity hover:text-red-500 group-hover:opacity-100"
                title="Remove photo"
                aria-label="Remove photo"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cream-200 bg-white text-navy-500 shadow-sm transition-all hover:bg-cream-50 hover:border-gold-300 flex-shrink-0"
              title="Upload photo for CV"
              aria-label="Upload photo for CV"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      {/* Edit button */}
      {!isEditMode && cvData && (
        <button
          type="button"
          onClick={() => {
            setIsEditMode(true);
            setShowTemplates(false);
            if (cvData && !editedCVData) setEditedCVData(cvData);
          }}
          className={TOOL_CLASS}
        >
          <Edit3 className="w-4 h-4 text-navy-500" />
          <span>Edit</span>
        </button>
      )}

      {/* Edit mode indicators */}
      {isEditMode && (
        <>
          <span className="text-sm font-semibold text-navy-600 flex-shrink-0">Editing</span>
          <button
            type="button"
            onClick={() => { setIsEditMode(false); setEditedCVData(null); }}
            className="h-9 px-3.5 text-sm font-medium text-warm-gray hover:text-charcoal rounded-full hover:bg-cream-100 transition-colors duration-200 cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              // Save changes via ref, then exit edit mode
              editableCVRef.current?.save();
              setIsEditMode(false);
            }}
            className="h-9 px-3.5 text-sm font-semibold text-white bg-navy-600 hover:bg-navy-700 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 shadow-sm"
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
            {copied ? <Check className="w-4 h-4 text-gold-600" /> : <Copy className="w-4 h-4" />}
            Copy
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
            Download PDF
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Header row + toolbar: portal to the canvas chrome on desktop, inline on mobile */}
      {headerContent && headerPortal && createPortal(headerContent, headerPortal)}
      {toolbarContent && toolbarPortal && createPortal(toolbarContent, toolbarPortal)}
      {toolbarContent && !toolbarPortal && (
        <div className="px-3 sm:px-5 py-2.5 bg-cream-100 border-b border-gold-300/60 flex-shrink-0 relative">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pr-6">
            {headerContent}
            {toolbarContent}
          </div>
          {/* Right-fade hint that toolbar is scrollable on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-cream-100/80 to-transparent pointer-events-none sm:hidden" />
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
              <div className="flex-shrink-0 border-b border-cream-200 bg-cream-50 px-4 py-2.5 sm:px-6">
                <p className="text-sm text-warm-gray">
                  <span className="font-semibold text-navy-800">Base CV.</span>{' '}
                  Not tailored to this job yet.
                </p>
              </div>
            )}

            {showTemplates && !isEditMode && (
              <TemplateStrip
                selectedTemplateId={selectedTemplateId}
                onSelect={setSelectedTemplateId}
              />
            )}

            {/* CV Content - View Mode or Edit Mode */}
            <div className="flex-1 overflow-auto bg-cream-100 p-2 sm:p-6">
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
                        const existing = useSessionStore.getState().currentSession?.optimizedCVData;
                        useSessionStore.getState().updateCurrentSession({
                          optimizedCVData: {
                            ...updatedData,
                            analysis: existing?.analysis,
                            sectionHeaders: existing?.sectionHeaders,
                            localizedStrings: existing?.localizedStrings,
                          } as any
                        });
                      } else {
                        // For original CV, persist to CV store (syncs to Supabase via useSupabaseSync)
                        useCVStore.getState().setEditedOriginalCVData(updatedData);
                      }

                      // Save personal links to profiles table
                      const p = updatedData.personal;
                      const linkUpdates: Record<string, string | null> = {};
                      if (p.linkedIn !== undefined) linkUpdates.linkedin_url = p.linkedIn || null;
                      if (p.github !== undefined) linkUpdates.github_url = p.github || null;
                      if (p.portfolio !== undefined) linkUpdates.portfolio_url = p.portfolio || null;
                      if (p.website !== undefined) linkUpdates.website_url = p.website || null;
                      if (p.dateOfBirth !== undefined) linkUpdates.date_of_birth = p.dateOfBirth || null;
                      if (p.nationality !== undefined) linkUpdates.nationality = p.nationality || null;
                      if (Object.keys(linkUpdates).length > 0) {
                        updateProfile(linkUpdates as any).catch((err: any) =>
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
                <div ref={cvContainerRef} className="flex flex-col items-center">
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
                      className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-md cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Full Preview
                    </button>
                    <div
                      ref={cvWrapperRef}
                      className="relative bg-white shadow-md"
                      style={cvScale < 1 ? {
                        transform: `scale(${cvScale})`,
                        transformOrigin: 'top left',
                        willChange: 'transform',
                      } : undefined}
                    >
                      <div ref={cvTemplateRef}>
                        <CVTemplateRenderer data={editedCVData || cvData} templateId={selectedTemplateId} />
                      </div>
                      {/* Page break indicators — outside cvTemplateRef so not captured in PDF.
                          Keep the marker minimal so it communicates the split without obscuring content. */}
                      {pageBreaks.map((y, i) => (
                        <div
                          key={y}
                          style={{
                            position: 'absolute',
                            top: y,
                            right: 10,
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            zIndex: 10,
                          }}
                        >
                          <span style={{
                            fontSize: 11,
                            color: '#B8891C',
                            background: 'rgba(248, 244, 234, 0.96)',
                            padding: '3px 8px',
                            borderRadius: 999,
                            fontWeight: 600,
                            lineHeight: 1.2,
                            border: '1px solid rgba(212, 175, 55, 0.45)',
                            boxShadow: '0 8px 18px -14px rgba(30, 58, 95, 0.25)',
                          }}>
                            Page {i + 1} → {i + 2}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Card className="bg-white">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-charcoal leading-relaxed">
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
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px]">
          <div className="relative flex h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[24px] border border-cream-200 bg-cream-100 shadow-lg">
            <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-charcoal">CV Full Preview</h2>
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
              <div className="mx-auto w-fit bg-white shadow-md">
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

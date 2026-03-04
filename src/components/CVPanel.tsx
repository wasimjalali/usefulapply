'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { CVTemplateRenderer, CV_TEMPLATE_DEFINITIONS } from './cv-templates';
import { TemplateSelector } from './cv-templates/TemplateSelector';
import { parsedCVToCVData, structuredCVToCVData } from '@/lib/cv-templates/parser';
import { parseOptimizedCVToData } from '@/lib/cv-parser/parse-optimized-cv';
import type { CVData } from '@/lib/cv-templates/types';
import {
  FileText,
  Download,
  CheckCircle,
  TrendingUp,
  Eye,
  FileOutput,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Layout,
  ChevronDown,
  ChevronUp,
  Loader2,
  Edit3
} from 'lucide-react';
import { EditableCVCanvas } from './EditableCVCanvas';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { SignUpWallModal } from '@/components/SignUpWallModal';
import { useToast } from './ui/Toast';
import Link from 'next/link';

interface CVPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

export function CVPanel({ toolbarPortal }: CVPanelProps = {}) {
  const { 
    currentCV,
    structuredCV,
    currentSession,
    isGenerating,
    isAnalyzing,
    isAgentWorking,
    profilePhoto,
  } = useAppStore();
  const { user, profile, updateProfile } = useAuth();
  const { toast } = useToast();
  const [showSignUpWall, setShowSignUpWall] = useState(false);
  
  const generatedCV = currentSession?.generatedCV;
  const optimizedCVData = currentSession?.optimizedCVData;  // Solution B: Structured JSON from AI
  const gaps = currentSession?.gaps;
  const changes = generatedCV?.changes || [];
  
  const [activeTab, setActiveTab] = useState<'content' | 'changes'>('content');
  const [showOptimized, setShowOptimized] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('premium-ats');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCVData, setEditedCVData] = useState<CVData | null>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const cvTemplateRef = useRef<HTMLDivElement>(null);

  // Responsive CV scaling — JS-based because CSS transform: scale can't dynamically
  // compensate for the CV template's fixed width (8.5in / 210mm).
  const cvContainerRef = useRef<HTMLDivElement>(null);
  const cvWrapperRef = useRef<HTMLDivElement>(null);
  const [cvScale, setCvScale] = useState(1);
  const [cvScaledHeight, setCvScaledHeight] = useState<number | null>(null);

  useEffect(() => {
    const updateScale = () => {
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
      // Page break indicator positions (in natural pixels, before any CSS transform)
      const isGerman = selectedTemplateId.startsWith('german');
      const pageHeightPx = isGerman ? Math.round((297 / 25.4) * 96) : 1056;
      const breaks: number[] = [];
      for (let y = pageHeightPx; y < naturalHeight; y += pageHeightPx) {
        breaks.push(y);
      }
      setPageBreaks(breaks);
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
      roContainer.disconnect();
      roWrapper.disconnect();
    };
  // selectedTemplateId triggers re-mount of CVTemplateRenderer; ResizeObserver handles rest
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);
  
  // Extract stable values from generatedCV to prevent unnecessary re-parses
  // This ensures parsing only happens when content actually changes, not on every render
  const optimizedContent = generatedCV?.content;
  const optimizedTagline = generatedCV?.optimizedTagline;
  const photoDataUrl = profilePhoto?.dataUrl;

  // Parse CV data for template rendering
  // PRIORITY: Use structuredCV (from AI parsing) when available - it has proper skills/languages arrays
  // FALLBACK: Use parsedCVToCVData (re-parses raw text) if structuredCV not available
  const cvData: CVData | null = useMemo(() => {
    if (!currentCV && !structuredCV) return null;
    
    // Use structuredCV if available (properly parsed with arrays for skills, languages, etc.)
    // Otherwise fall back to re-parsing the raw text
    let parsed: CVData;
    if (structuredCV) {
      parsed = structuredCVToCVData(structuredCV);
    } else if (currentCV) {
      parsed = parsedCVToCVData(currentCV);
    } else {
      return null;
    }
    
    // Add profile photo if available
    if (photoDataUrl) {
      parsed.personal.photoUrl = photoDataUrl;
    }
    
    // Load personal links from Supabase profile (persisted across sessions)
    if (profile) {
      parsed.personal.linkedIn = parsed.personal.linkedIn || (profile as any).linkedin_url || '';
      parsed.personal.github = parsed.personal.github || (profile as any).github_url || '';
      parsed.personal.portfolio = parsed.personal.portfolio || (profile as any).portfolio_url || '';
      parsed.personal.website = parsed.personal.website || (profile as any).website_url || '';
    }
    
    // SOLUTION B: If we have optimizedCVData (structured JSON from AI), use it directly
    // This eliminates text parsing and prevents duplication issues
    if (showOptimized && optimizedCVData) {
      // Convert optimizedCVData to CVData format
      // IMPORTANT: Preserve personal links from original CV if AI didn't return them
      // This prevents users from re-entering LinkedIn/GitHub/Portfolio/Website for each application
      const directData: CVData = {
        personal: {
          fullName: optimizedCVData.personal.fullName,
          email: optimizedCVData.personal.email,
          phone: optimizedCVData.personal.phone || '',
          currentTitle: optimizedCVData.personal.currentTitle,
          address: optimizedCVData.personal.address || parsed?.personal.address,
          city: optimizedCVData.personal.city || parsed?.personal.city,
          country: optimizedCVData.personal.country || parsed?.personal.country,
          linkedIn: optimizedCVData.personal.linkedIn || parsed?.personal.linkedIn,
          website: optimizedCVData.personal.website || parsed?.personal.website,
          github: optimizedCVData.personal.github || parsed?.personal.github,
          portfolio: parsed?.personal.portfolio,
          photoUrl: photoDataUrl,
        },
        summary: optimizedCVData.summary,
        experience: optimizedCVData.experience,
        education: optimizedCVData.education,
        skills: optimizedCVData.skills,
        languages: optimizedCVData.languages,
        certifications: optimizedCVData.certifications,
        additionalInfo: optimizedCVData.additionalInfo || (optimizedCVData.personal.driverLicense
          ? [`Driver's License: ${optimizedCVData.personal.driverLicense}`]
          : undefined),
        sectionHeaders: optimizedCVData.sectionHeaders,
        localizedStrings: optimizedCVData.localizedStrings,
      };
      
      return directData;
    }
    
    // FALLBACK: If no optimizedCVData, use legacy text parsing
    if (showOptimized && optimizedContent) {
      const optimizedData = parseOptimizedCVToData(optimizedContent, parsed);
      
      if (optimizedTagline) {
        optimizedData.personal.currentTitle = optimizedTagline;
      }
      
      if (photoDataUrl) {
        optimizedData.personal.photoUrl = photoDataUrl;
      }
      
      // Preserve personal links from original CV if not in optimized
      if (parsed) {
        optimizedData.personal.linkedIn = optimizedData.personal.linkedIn || parsed.personal.linkedIn;
        optimizedData.personal.github = optimizedData.personal.github || parsed.personal.github;
        optimizedData.personal.website = optimizedData.personal.website || parsed.personal.website;
        optimizedData.personal.portfolio = optimizedData.personal.portfolio || parsed.personal.portfolio;
      }
      
      return optimizedData;
    }
    
    return parsed;
  }, [currentCV, structuredCV, optimizedContent, optimizedTagline, showOptimized, photoDataUrl, optimizedCVData, profile]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleDownloadPDF = async () => {
    // Gate: Anonymous users must sign up to download
    if (!user) {
      setShowSignUpWall(true);
      return;
    }
    if (!cvTemplateRef.current || !cvData) return;

    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const sanitize = (s: string) =>
        s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const applicantName = sanitize(cvData.personal.fullName || 'Applicant');
      const companyName = sanitize(currentSession?.company || '');
      const filename =
        showOptimized && companyName
          ? `${applicantName}_${companyName}_CV.pdf`
          : `${applicantName}_CV.pdf`;

      const isGerman = selectedTemplateId.startsWith('german');
      const pageWidthMm = isGerman ? 210 : 215.9;
      const pageHeightMm = isGerman ? 297 : 279.4;
      // Page height in natural pixels at 96 dpi
      const pageHeightNaturalPx = isGerman ? Math.round((297 / 25.4) * 96) : 1056;
      const captureScale = 2;

      // html2canvas 1.4.1 can't parse CSS Color Level 4 functions (oklch, lab, etc.)
      // used by Tailwind v4. Pre-fetch all stylesheets, replace unsupported color values,
      // then inject the cleaned CSS in onclone (which is synchronous — can't fetch inside it).
      const unsupportedColorRe = /\b(?:oklch|oklab|lab|lch)\s*\([^)]*\)/g;
      const linkEls = Array.from(
        document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
      );
      const cssMap = new Map<string, string>();
      await Promise.allSettled(
        linkEls.map(async (link) => {
          try {
            const res = await fetch(link.href);
            const css = await res.text();
            cssMap.set(link.href, css.replace(unsupportedColorRe, 'inherit'));
          } catch { /* leave out of map — link will be replaced with empty style */ }
        })
      );

      const el = cvTemplateRef.current;
      const canvas = await html2canvas(el, {
        scale: captureScale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        onclone: (_doc: Document, clonedEl: HTMLElement) => {
          clonedEl.style.boxShadow = 'none';
          if (clonedEl.parentElement) {
            clonedEl.parentElement.style.transform = 'none';
            clonedEl.parentElement.style.boxShadow = 'none';
          }
          // Replace every <link rel="stylesheet"> with the pre-cleaned inline <style>
          // so html2canvas never encounters unsupported color functions when parsing CSS.
          _doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
            const style = _doc.createElement('style');
            style.textContent = cssMap.get(link.href) ?? '';
            link.parentNode?.replaceChild(style, link);
          });
          // Also clean any inline <style> tags (dev mode inlines Tailwind)
          _doc.querySelectorAll('style').forEach((style) => {
            if (style.textContent) {
              style.textContent = style.textContent.replace(unsupportedColorRe, 'inherit');
            }
          });
        },
      });

      const doc = new jsPDF({
        format: isGerman ? 'a4' : 'letter',
        unit: 'mm',
        orientation: 'portrait',
      });

      const pageCanvasHeight = pageHeightNaturalPx * captureScale;
      const totalPages = Math.ceil(canvas.height / pageCanvasHeight);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) doc.addPage();
        const srcY = page * pageCanvasHeight;
        const srcH = Math.min(pageCanvasHeight, canvas.height - srcY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = pageCanvasHeight;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        }
        doc.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
      }

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const selectedTemplate = CV_TEMPLATE_DEFINITIONS.find(t => t.id === selectedTemplateId);

  if (!currentCV) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <FileText className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">No CV uploaded</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Upload your CV in the Documents section to get started with AI-powered optimization.
          </p>
          <Link href="/documents">
            <Button variant="gold">
              Go to Documents
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isLoading = isAnalyzing || isGenerating || isAgentWorking;
  const displayContent = showOptimized && generatedCV ? generatedCV.content : currentCV.rawText;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = !isLoading ? (
    <>
      {/* Original/Optimized Toggle */}
      {generatedCV && (
        <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => { setShowOptimized(false); setEditedCVData(null); }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              !showOptimized ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Original
          </button>
          <button
            onClick={() => { setShowOptimized(true); setEditedCVData(null); }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              showOptimized ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Optimized
          </button>
        </div>
      )}

      {/* Content/Changes Toggle — only when Optimized is selected */}
      {showOptimized && generatedCV && (
        <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'content' ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            <Eye className="w-3 h-3" />
            Content
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'changes' ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            <Sparkles className={`w-3 h-3 ${activeTab === 'changes' ? 'text-gold-500' : ''}`} />
            Changes {changes.length > 0 && `(${changes.length})`}
          </button>
        </div>
      )}

      {/* Template selector button */}
      {activeTab === 'content' && !isEditMode && (
        <button
          onClick={() => setShowTemplateSelector(!showTemplateSelector)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-cream-200 rounded-lg hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0"
        >
          <Layout className="w-3 h-3 text-navy-500" />
          <span className="hidden sm:inline">{selectedTemplate?.name || 'Template'}</span>
          {showTemplateSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      {/* Edit button */}
      {activeTab === 'content' && !isEditMode && cvData && (
        <button
          onClick={() => {
            setIsEditMode(true);
            if (cvData && !editedCVData) setEditedCVData(cvData);
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-cream-200 rounded-lg hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0"
        >
          <Edit3 className="w-3 h-3 text-navy-500" />
          <span className="hidden sm:inline">Edit</span>
        </button>
      )}

      {/* Edit mode indicators */}
      {isEditMode && (
        <>
          <span className="text-xs font-medium text-navy-600 flex-shrink-0">Editing</span>
          <button
            onClick={() => { setIsEditMode(false); setEditedCVData(null); }}
            className="px-2.5 py-1.5 text-xs font-medium text-warm-gray hover:text-charcoal rounded-md hover:bg-cream-100 transition-all cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
          <button
            onClick={() => setIsEditMode(false)}
            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-gold-500 hover:bg-gold-600 rounded-md transition-all cursor-pointer flex-shrink-0"
          >
            <Check className="w-3 h-3 inline mr-1" />
            Save
          </button>
        </>
      )}

      {/* Action buttons — visible when content tab is active and not editing */}
      {activeTab === 'content' && !isEditMode && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(displayContent)}
            title="Copy to clipboard"
            className="flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-sage-600" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isDownloading || !cvData}
            title="Download as PDF"
            className="flex-shrink-0"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="ml-1 hidden sm:inline">PDF</span>
          </Button>
        </>
      )}
    </>
  ) : null;

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Toolbar: portal to tab bar on desktop, inline on mobile */}
      {toolbarContent && toolbarPortal && createPortal(toolbarContent, toolbarPortal)}
      {toolbarContent && !toolbarPortal && (
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 glass-toolbar flex-shrink-0 relative">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pr-6">
            {toolbarContent}
          </div>
          {/* Right-fade hint that toolbar is scrollable on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 to-transparent pointer-events-none sm:hidden" />
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <KarkoAIStepIndicator 
            stepType="cv" 
            isLoading={true}
            message={isAnalyzing 
              ? 'Understanding job requirements and matching with your profile...'
              : 'Tailoring your CV for maximum impact and ATS compatibility...'
            }
          />
        ) : activeTab === 'content' ? (
          <div className="h-full flex flex-col">
            {/* Template Selector Dropdown - Scrollable */}
            {showTemplateSelector && !isEditMode && (
              <div className="px-4 py-4 bg-white border-b border-cream-300 shadow-sm max-h-[60vh] overflow-y-auto">
                <TemplateSelector
                  selectedTemplateId={selectedTemplateId}
                  onSelect={(id) => {
                    setSelectedTemplateId(id);
                    setShowTemplateSelector(false);
                  }}
                />
              </div>
            )}

            {/* CV Content - View Mode or Edit Mode */}
            <div className="flex-1 overflow-auto p-2 sm:p-6 bg-gray-100">
              {isEditMode && cvData ? (
                /* Edit Mode - Editable Canvas */
                <div className="flex flex-col h-full">
                  <EditableCVCanvas
                    cvData={editedCVData || cvData}
                    onSave={(updatedData) => {
                      setEditedCVData(updatedData);
                      const p = updatedData.personal;
                      const linkUpdates: Record<string, string | null> = {};
                      if (p.linkedIn !== undefined) linkUpdates.linkedin_url = p.linkedIn || null;
                      if (p.github !== undefined) linkUpdates.github_url = p.github || null;
                      if (p.portfolio !== undefined) linkUpdates.portfolio_url = p.portfolio || null;
                      if (p.website !== undefined) linkUpdates.website_url = p.website || null;
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
                    style={{
                      width: cvScale < 1 ? Math.ceil((cvWrapperRef.current?.scrollWidth ?? 816) * cvScale) : undefined,
                      height: cvScaledHeight ?? undefined,
                      overflow: cvScale < 1 ? 'hidden' : undefined,
                    }}
                  >
                    <div
                      ref={cvWrapperRef}
                      className="relative bg-white shadow-lg"
                      style={cvScale < 1 ? {
                        transform: `scale(${cvScale})`,
                        transformOrigin: 'top left',
                      } : undefined}
                    >
                      <div ref={cvTemplateRef}>
                        <CVTemplateRenderer data={editedCVData || cvData} templateId={selectedTemplateId} />
                      </div>
                      {/* Page break indicators — outside cvTemplateRef so not captured in PDF */}
                      {pageBreaks.map((y, i) => (
                        <div
                          key={y}
                          style={{
                            position: 'absolute',
                            top: y,
                            left: 0,
                            right: 0,
                            pointerEvents: 'none',
                            zIndex: 10,
                          }}
                        >
                          <div style={{ borderTop: '2px dashed #CBD5E0', width: '100%' }} />
                          <span style={{
                            position: 'absolute',
                            top: 3,
                            right: 8,
                            fontSize: 10,
                            color: '#94A3B8',
                            background: 'white',
                            padding: '0 4px',
                            lineHeight: 1,
                          }}>
                            Page {i + 1} | Page {i + 2}
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
        ) : (
          <div className="h-full overflow-auto p-6">
            {/* NEW: Use analysis from optimizedCVData (Solution B) */}
            {optimizedCVData?.analysis ? (
              <div className="space-y-6">
                {/* 1. Strategy Summary */}
                <div className="bg-gradient-to-r from-navy-50 to-navy-100 p-4 rounded-lg border border-navy-200">
                  <h3 className="font-bold text-navy-800 mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gold-600" />
                    Optimization Strategy
                  </h3>
                  <p className="text-navy-700 text-sm">{optimizedCVData.analysis.summary}</p>
                </div>

                {/* 2. ATS Compatibility Score */}
                <div className="bg-cream-50 p-4 rounded-lg border border-cream-200">
                  <h3 className="font-bold text-navy-800 mb-2">ATS Compatibility</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-cream-200 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-gold-400 to-gold-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${optimizedCVData.analysis.ats_compatibility}%` }}
                      />
                    </div>
                    <span className="font-bold text-navy-700 text-lg">
                      {optimizedCVData.analysis.ats_compatibility}%
                    </span>
                  </div>
                </div>

                {/* 3. Key Changes List */}
                <div>
                  <h3 className="font-bold mb-3 flex items-center gap-2 text-navy-800">
                    <Sparkles className="w-4 h-4 text-gold-500" />
                    Key Improvements Made
                  </h3>
                  <ul className="space-y-2">
                    {optimizedCVData.analysis.key_changes.map((change, i) => (
                      <li key={i} className="flex items-start gap-2 p-3 bg-white rounded-lg border border-cream-200 shadow-sm">
                        <CheckCircle className="w-4 h-4 text-gold-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-charcoal">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Missing Keywords Added */}
                {optimizedCVData.analysis.missing_keywords_added.length > 0 && (
                  <div>
                    <h3 className="font-bold mb-3 text-navy-800">Keywords Added for ATS</h3>
                    <div className="flex flex-wrap gap-2">
                      {optimizedCVData.analysis.missing_keywords_added.map((keyword, i) => (
                        <span 
                          key={i} 
                          className="px-3 py-1.5 bg-gold-50 text-gold-700 rounded-full text-sm font-medium border border-gold-200"
                        >
                          + {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : changes.length > 0 ? (
              /* Fallback: Legacy changes format */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-navy-600" />
                  <h3 className="font-medium text-charcoal">
                    {changes.length} strategic changes made
                  </h3>
                </div>
                {changes.map((change, index) => (
                  <Card key={index} padding="sm" className="border-l-4 border-l-navy-500">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-navy-100 rounded">
                        <FileOutput className="w-3.5 h-3.5 text-navy-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal">{change.section}</p>
                        <p className="text-xs text-warm-gray mb-2">{change.reason}</p>
                        {change.original && (
                          <div className="space-y-2">
                            <div className="p-2 bg-red-50 rounded text-xs text-red-700 border border-red-100">
                              <span className="font-medium">Before: </span>
                              {change.original}
                            </div>
                            <div className="p-2 bg-sage-50 rounded text-xs text-sage-700 border border-sage-100">
                              <span className="font-medium">After: </span>
                              {change.updated}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Sparkles className="w-12 h-12 text-cream-400 mb-4" />
                <h3 className="font-medium text-charcoal">No changes yet</h3>
                <p className="text-sm text-warm-gray mt-1">
                  Paste a job description in the chat to optimize your CV
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sign Up Wall Modal */}
      <SignUpWallModal
        isOpen={showSignUpWall}
        onClose={() => setShowSignUpWall(false)}
        trigger="download"
      />
    </div>
  );
}

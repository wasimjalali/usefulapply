'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
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
  AlertCircle,
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
import Link from 'next/link';

export function CVPanel() {
  const { 
    currentCV,
    structuredCV,
    currentSession,
    isGenerating,
    isAnalyzing,
    isAgentWorking,
    profilePhoto,
  } = useAppStore();
  const { profile, updateProfile } = useAuth();
  
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
  const cvTemplateRef = useRef<HTMLDivElement>(null);
  
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
      console.log('[CVPanel] Using SOLUTION B - Structured JSON from AI (no parsing needed)');
      
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
      };
      
      console.log('=== CV RENDER DEBUG (Solution B) ===');
      console.log('[CVPanel] Experience entries:', directData.experience?.length);
      console.log('[CVPanel] Skills categories:', directData.skills?.length);
      console.log('[CVPanel] Languages:', directData.languages?.length);
      console.log('=== END CV DEBUG ===');
      
      return directData;
    }
    
    // FALLBACK: If no optimizedCVData, use legacy text parsing
    if (showOptimized && optimizedContent) {
      console.log('[CVPanel] FALLBACK: Using text parsing for optimized CV');
      
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
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = async () => {
    if (!cvTemplateRef.current || !cvData) return;
    
    setIsDownloading(true);
    try {
      // Create a new window with just the CV content for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to download PDF');
        return;
      }
      
      // Get the CV template HTML
      const cvContent = cvTemplateRef.current.innerHTML;
      const isUSTemplate = selectedTemplateId.startsWith('us-');
      const pageWidth = isUSTemplate ? '8.5in' : '210mm';
      
      // Create print-optimized HTML with CSS to hide browser headers/footers
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${cvData.personal.fullName || 'CV'} - Resume</title>
          <style>
            /* Critical: Hide browser headers and footers */
            @page {
              size: ${isUSTemplate ? 'letter' : 'A4'};
              margin: 0.5in 0.75in; /* Professional standard: 0.5in top/bottom, 0.75in left/right */
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            html, body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 10.5pt; /* Base body text size */
              line-height: 1.4;
              color: #1a1a1a;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              background: white;
            }
            
            .cv-container {
              width: 100%;
              max-width: ${pageWidth};
              margin: 0 auto;
              background: white;
              padding: 0;
            }
            
            /* ===========================================
               PROFESSIONAL CV TYPOGRAPHY (HR Standard)
               - Name: 20pt (bold)
               - Section Headers: 12pt (bold, uppercase)
               - Job/Degree Titles: 11pt (bold)
               - Category Headers: 9pt (bold, uppercase)
               - Body Text: 10.5pt (summary, bullets, skills)
               - Secondary Text: 9pt (dates, locations)
               =========================================== */
            
            /* Name - 20pt bold */
            h1 { 
              font-size: 20pt !important; 
              font-weight: bold !important; 
              margin-bottom: 4pt !important; 
              letter-spacing: -0.3pt !important;
            }
            
            /* Section Headers - 12pt bold uppercase */
            h2 { 
              font-size: 12pt !important; 
              font-weight: bold !important; 
              text-transform: uppercase !important; 
              letter-spacing: 1pt !important; 
              margin-bottom: 8pt !important; 
              padding-bottom: 4pt !important; 
            }
            
            /* Job/Degree Titles - 11pt bold */
            h3 { 
              font-size: 11pt !important; 
              font-weight: bold !important; 
              margin-bottom: 2pt !important; 
            }
            
            /* Category Headers (skills) - 9pt bold uppercase */
            h4 { 
              font-size: 9pt !important; 
              font-weight: bold !important; 
              text-transform: uppercase !important; 
              letter-spacing: 0.5pt !important; 
              margin-bottom: 4pt !important; 
            }
            
            /* Body Text - 10.5pt */
            p, li, span { 
              font-size: 10.5pt !important; 
              line-height: 1.4 !important; 
            }
            
            /* Ensure divs don't override body text size (except for containers) */
            div:not(.cv-container):not(.cv-template) { 
              font-size: inherit !important; 
            }
            
            /* Bold text styling */
            strong, b { 
              font-weight: bold !important; 
            }
            
            /* Override ALL inline fontSize styles for consistency */
            [style*="fontSize: '10px'"], 
            [style*="fontSize: '11px'"], 
            [style*="fontSize: '12px'"], 
            [style*="fontSize: '13px'"] { 
              font-size: 10.5pt !important; 
            }
            
            [style*="fontSize: '14px'"] { 
              font-size: 12pt !important; 
            }
            
            [style*="fontSize: '28px'"], 
            [style*="fontSize: '24px'"] { 
              font-size: 20pt !important; 
            }
            
            /* Spacing */
            section { margin-bottom: 12pt !important; }
            ul { padding-left: 12pt !important; margin: 0 !important; }
            li { margin-bottom: 2pt !important; }
            
            /* Grid layouts */
            .grid { display: grid; }
            .flex { display: flex; }
            .gap-2 { gap: 6pt !important; }
            .gap-3 { gap: 8pt !important; }
            .gap-4 { gap: 10pt !important; }
            .gap-6 { gap: 14pt !important; }
            
            /* Padding overrides */
            .px-8 { padding-left: 16pt !important; padding-right: 16pt !important; }
            .py-6 { padding-top: 12pt !important; padding-bottom: 12pt !important; }
            .py-5 { padding-top: 10pt !important; padding-bottom: 10pt !important; }
            .p-6 { padding: 12pt !important; }
            .space-y-5 > * + * { margin-top: 10pt !important; }
            .space-y-4 > * + * { margin-top: 8pt !important; }
            .space-y-3 > * + * { margin-top: 6pt !important; }
            .mb-6 { margin-bottom: 12pt !important; }
            .mb-4 { margin-bottom: 8pt !important; }
            .mb-3 { margin-bottom: 6pt !important; }
            .mt-4 { margin-top: 8pt !important; }
            
            /* Tailwind text size overrides - standardize to our scale */
            .text-3xl { font-size: 20pt !important; } /* Name */
            .text-2xl { font-size: 12pt !important; } /* Section headers */
            .text-xl { font-size: 11pt !important; }  /* Job titles */
            .text-lg { font-size: 10.5pt !important; } /* Body */
            .text-base { font-size: 10.5pt !important; } /* Body */
            .text-sm { font-size: 10pt !important; }  /* Slightly smaller */
            .text-xs { font-size: 9pt !important; }   /* Dates, secondary */
            
            /* Colors - preserve print colors */
            [style*="background"] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            [style*="color"] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            
            /* Images */
            img { max-width: 100%; height: auto; -webkit-print-color-adjust: exact !important; }
            .w-28 { width: 80pt !important; }
            .h-36 { height: 100pt !important; }
            .w-32 { width: 90pt !important; }
            .h-40 { height: 110pt !important; }
            
            /* Hide scrollbars */
            ::-webkit-scrollbar { display: none; }
            
            /* Remove shadows */
            .shadow-lg, .shadow-md, .shadow, [class*="shadow"] {
              box-shadow: none !important;
            }
            
            /* Template styling */
            .cv-template {
              box-shadow: none !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              min-height: auto !important;
              /* Keep template padding for proper page margins */
            }
            
            .mx-auto {
              margin-left: 0 !important;
              margin-right: 0 !important;
            }
            
            .cv-template header {
              padding-left: 0 !important;
              padding-right: 0 !important;
            }
            
            .cv-template > div:not(header) {
              padding-left: 0 !important;
              padding-right: 0 !important;
            }
            
            /* Print-specific styles */
            @media print {
              html, body {
                width: 100%;
                margin: 0;
                padding: 0;
              }
              
              .cv-container {
                width: 100%;
              }
              
              /* Ensure @page margins are respected */
              .cv-template {
                padding: 0 !important; /* Let @page margin handle all margins for print */
              }
              
              /* Allow sections to break naturally across pages */
              section { 
                page-break-inside: auto;
                break-inside: auto;
              }
              
              /* Keep headers with following content */
              h2, h3 { 
                page-break-after: avoid;
                break-after: avoid;
              }
              
              /* Individual entries can break if needed */
              .mb-4, .mb-3 {
                page-break-inside: auto;
                break-inside: auto;
              }
              
              /* Experience/education items - avoid break only if short */
              .experience-item, .education-item {
                page-break-inside: auto;
                break-inside: auto;
              }
              
              /* Skill categories can break */
              .skill-category {
                page-break-inside: auto;
                break-inside: auto;
              }
              
              /* Bullets can break across pages */
              ul, li {
                page-break-inside: auto;
                break-inside: auto;
                orphans: 2;
                widows: 2;
              }
              
              .cv-template {
                page-break-before: auto;
                page-break-after: auto;
              }
            }
          </style>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        </head>
        <body>
          <div class="cv-container">
            ${cvContent}
          </div>
          <script>
            window.onload = function() {
              // Wait for styles to load, then print
              setTimeout(function() {
                window.print();
                setTimeout(function() { window.close(); }, 100);
              }, 800);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
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

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Compact Single-Row Toolbar — always visible when not loading */}
      {!isLoading && (
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/90 backdrop-blur-sm border-b border-cream-200/60 flex-shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {/* Content/Changes Toggle */}
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

            {activeTab === 'content' && (
              <>
                {/* Divider */}
                <div className="w-px h-5 bg-cream-200 flex-shrink-0" />

                {/* Original/Optimized Toggle */}
                {generatedCV && (
                  <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
                    <button
                      onClick={() => setShowOptimized(false)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        !showOptimized ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => setShowOptimized(true)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        showOptimized ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
                      }`}
                    >
                      Optimized
                    </button>
                  </div>
                )}
                
                {/* Template Selector Toggle */}
                <button
                  onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-cream-50 border border-cream-200 rounded-lg hover:bg-cream-100 transition-all cursor-pointer flex-shrink-0"
                >
                  <Layout className="w-3.5 h-3.5 text-navy-500" />
                  <span className="hidden sm:inline">{selectedTemplate?.name || 'Template'}</span>
                  <span className="sm:hidden">Tmpl</span>
                  {showTemplateSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {/* Spacer */}
                <div className="flex-1 min-w-2" />

                {/* View/Edit Mode Toggle */}
                <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
                  <button
                    onClick={() => setIsEditMode(false)}
                    className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      !isEditMode ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
                    }`}
                    title="View mode"
                  >
                    <Eye className="w-3 h-3" />
                    <span className="hidden sm:inline">View</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsEditMode(true);
                      if (cvData && !editedCVData) {
                        setEditedCVData(cvData);
                      }
                    }}
                    className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      isEditMode ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
                    }`}
                    title="Edit mode"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                </div>
                
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
          </div>
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
                <EditableCVCanvas
                  cvData={editedCVData || cvData}
                  onSave={(updatedData) => {
                    setEditedCVData(updatedData);
                    // Persist personal links to Supabase profiles table
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
                    // TODO: Call AI to improve the section
                    return content;
                  }}
                />
              ) : cvData ? (
                /* View Mode - Template Preview */
                <div className="flex flex-col items-center gap-4">
                  {/* Page container - scales down on mobile to fit screen */}
                  <div className="cv-pages-container w-full max-w-[800px] origin-top">
                    <div className="cv-page-wrapper relative bg-white shadow-lg cv-mobile-scale">
                      <div ref={cvTemplateRef}>
                        <CVTemplateRenderer data={editedCVData || cvData} templateId={selectedTemplateId} />
                      </div>
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
    </div>
  );
}

'use client';

import { useState, useMemo, useRef } from 'react';
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
import Link from 'next/link';

// NOTE: Old patching functions (applyChangesToCVData, parseLanguagesFromText, etc.) 
// have been removed in favor of the Full Re-parse Architecture.
// The optimized CV is now fully parsed via parseOptimizedCVToData() instead of patching.

export function CVPanel() {
  const { 
    currentCV,
    structuredCV,
    currentSession,
    isGenerating,
    isAnalyzing,
    profilePhoto,
  } = useAppStore();
  
  const generatedCV = currentSession?.generatedCV;
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
  
  // Track content hash to prevent duplicate parsing logs
  const lastChangesHashRef = useRef<string>('');

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
    if (profilePhoto?.dataUrl) {
      parsed.personal.photoUrl = profilePhoto.dataUrl;
    }
    
    // If we have optimized content, use FULL RE-PARSE architecture
    if (showOptimized && generatedCV?.content) {
      // Check if content has changed to prevent duplicate parsing
      const contentHash = generatedCV.content.substring(0, 100);
      if (contentHash !== lastChangesHashRef.current) {
        console.log('[CVPanel] Using FULL RE-PARSE for optimized CV');
        lastChangesHashRef.current = contentHash;
      }
      
      // FULL RE-PARSE: Parse the complete optimized CV text into CVData
      // This replaces the old patching approach with a clean single-source parse
      const optimizedData = parseOptimizedCVToData(generatedCV.content, parsed);
      
      // Apply headline if provided separately (takes priority)
      if (generatedCV.optimizedTagline) {
        optimizedData.personal.currentTitle = generatedCV.optimizedTagline;
      }
      
      // Preserve profile photo from original
      if (profilePhoto?.dataUrl) {
        optimizedData.personal.photoUrl = profilePhoto.dataUrl;
      }
      
      return optimizedData;
    }
    
    return parsed;
  }, [currentCV, structuredCV, generatedCV, showOptimized, profilePhoto]);

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
              margin: 0.5in;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            html, body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12pt;
              line-height: 1.4;
              color: #1a1a2e;
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
            
            /* Typography */
            h1 { font-size: 28pt; font-weight: bold; margin-bottom: 4pt; }
            h2 { font-size: 18pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3pt; margin-bottom: 6pt; padding-bottom: 2pt; }
            h3 { font-size: 14pt; font-weight: bold; margin-bottom: 2pt; }
            p, li, span { font-size: 12pt; line-height: 1.4; }
            
            /* Spacing */
            section { margin-bottom: 10pt; }
            ul { padding-left: 10pt; margin: 0; }
            li { margin-bottom: 2pt; }
            
            /* Grid layouts */
            .grid { display: grid; }
            .flex { display: flex; }
            .gap-2 { gap: 6px; }
            .gap-3 { gap: 8px; }
            .gap-4 { gap: 10px; }
            .gap-6 { gap: 14px; }
            
            /* Padding overrides */
            .px-8 { padding-left: 20px !important; padding-right: 20px !important; }
            .py-6 { padding-top: 12px !important; padding-bottom: 12px !important; }
            .py-5 { padding-top: 10px !important; padding-bottom: 10px !important; }
            .p-6 { padding: 12px !important; }
            .space-y-5 > * + * { margin-top: 10px !important; }
            .space-y-4 > * + * { margin-top: 8px !important; }
            .space-y-3 > * + * { margin-top: 6px !important; }
            .mb-6 { margin-bottom: 12px !important; }
            .mb-4 { margin-bottom: 8px !important; }
            .mb-3 { margin-bottom: 6px !important; }
            .mt-4 { margin-top: 8px !important; }
            
            /* Text sizes */
            .text-3xl { font-size: 28pt !important; }
            .text-2xl { font-size: 18pt !important; }
            .text-sm { font-size: 11pt !important; }
            .text-xs { font-size: 10pt !important; }
            
            /* Colors */
            [style*="background"] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            
            /* Images */
            img { max-width: 100%; height: auto; -webkit-print-color-adjust: exact !important; }
            .w-28 { width: 80px !important; }
            .h-36 { height: 100px !important; }
            .w-32 { width: 90px !important; }
            .h-40 { height: 110px !important; }
            
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
              padding: 0 !important;
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
              
              section { 
                page-break-inside: avoid;
              }
              
              h2, h3 { 
                page-break-after: avoid;
              }
              
              .mb-4, .mb-3 {
                page-break-inside: avoid;
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
      <div className="h-full flex items-center justify-center bg-cream-100 p-8">
        <div className="text-center">
          <FileText className="w-12 h-12 text-cream-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-warm-gray">No CV uploaded</h3>
          <p className="text-sm text-warm-gray mt-1 mb-4">
            Upload your CV in the Documents section to get started
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

  const isLoading = isAnalyzing || isGenerating;
  const displayContent = showOptimized && generatedCV ? generatedCV.content : currentCV.rawText;

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-cream-300">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-navy-600" />
            <h2 className="text-lg font-semibold text-charcoal">
              {generatedCV ? 'Optimized CV' : 'Your CV'}
            </h2>
          </div>
          
          {/* Sub-tabs */}
          <div className="flex bg-cream-200 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('content')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'content' ? 'bg-white text-charcoal shadow-sm' : 'text-warm-gray hover:text-charcoal'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Content
            </button>
            <button
              onClick={() => setActiveTab('changes')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'changes' ? 'bg-white text-charcoal shadow-sm' : 'text-warm-gray hover:text-charcoal'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Changes {changes.length > 0 && `(${changes.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full bg-cream-50">
            <div className="bg-white rounded-xl shadow-sm border border-cream-200 p-8 max-w-md text-center">
              {/* Subtle pulsing icon */}
              <div className="relative mb-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-navy-50 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-navy-600" />
                </div>
                <div className="absolute inset-0 w-16 h-16 mx-auto rounded-full bg-navy-100 animate-ping opacity-20" />
              </div>
              
              {/* Status text */}
              <h3 className="text-lg font-semibold text-charcoal mb-2">
                {isAnalyzing ? 'Analyzing Job Requirements' : 'Optimizing Your CV'}
              </h3>
              <p className="text-sm text-warm-gray mb-4">
                {isAnalyzing 
                  ? 'Understanding the role requirements and matching with your profile...'
                  : 'Tailoring your CV for maximum impact and ATS compatibility...'
                }
              </p>
              
              {/* Progress indicator */}
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-navy-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-navy-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-navy-400 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        ) : activeTab === 'content' ? (
          <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="px-4 py-2 bg-cream-100 border-b border-cream-300 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                {/* Original/Optimized Toggle */}
                {generatedCV && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowOptimized(false)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                        !showOptimized ? 'bg-navy-600 text-white' : 'bg-cream-200 text-warm-gray hover:bg-cream-300'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => setShowOptimized(true)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                        showOptimized ? 'bg-navy-600 text-white' : 'bg-cream-200 text-warm-gray hover:bg-cream-300'
                      }`}
                    >
                      Optimized
                    </button>
                  </div>
                )}
                
                {/* Template Selector Toggle */}
                <button
                  onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-white border border-cream-300 rounded hover:bg-cream-50 transition-colors cursor-pointer"
                >
                  <Layout className="w-3.5 h-3.5" />
                  {selectedTemplate?.name || 'Select Template'}
                  {showTemplateSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                {/* View/Edit Mode Toggle */}
                <div className="flex items-center gap-1 mr-2">
                  <button
                    onClick={() => setIsEditMode(false)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                      !isEditMode ? 'bg-navy-600 text-white' : 'bg-cream-200 text-warm-gray hover:bg-cream-300'
                    }`}
                    title="View mode"
                  >
                    <Eye className="w-3 h-3" />
                    View
                  </button>
                  <button
                    onClick={() => {
                      setIsEditMode(true);
                      if (cvData && !editedCVData) {
                        setEditedCVData(cvData);
                      }
                    }}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                      isEditMode ? 'bg-navy-600 text-white' : 'bg-cream-200 text-warm-gray hover:bg-cream-300'
                    }`}
                    title="Edit mode - Make changes directly"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleCopy(displayContent)}
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-4 h-4 text-sage-600" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button 
                  variant="gold" 
                  size="sm" 
                  onClick={handleDownloadPDF}
                  disabled={isDownloading || !cvData}
                  title="Download as PDF"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">PDF</span>
                </Button>
              </div>
            </div>
            
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
            <div className="flex-1 overflow-auto p-6 bg-gray-100">
              {isEditMode && cvData ? (
                /* Edit Mode - Editable Canvas */
                <EditableCVCanvas
                  cvData={editedCVData || cvData}
                  onSave={(updatedData) => {
                    setEditedCVData(updatedData);
                    // TODO: Persist changes to store
                  }}
                  onAIImprove={async (section, content) => {
                    // TODO: Call AI to improve the section
                    return content;
                  }}
                />
              ) : cvData ? (
                /* View Mode - Template Preview */
                <div className="flex flex-col items-center gap-4">
                  {/* Page container - full width display */}
                  <div className="cv-pages-container w-full max-w-[800px]">
                    {/* The template will naturally flow and create pages */}
                    <div className="cv-page-wrapper relative bg-white shadow-lg">
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
            {changes.length > 0 ? (
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

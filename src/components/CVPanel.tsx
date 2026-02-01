'use client';

import { useState, useMemo, useRef } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { CVTemplateRenderer, CV_TEMPLATE_DEFINITIONS } from './cv-templates';
import { TemplateSelector } from './cv-templates/TemplateSelector';
import { parsedCVToCVData, structuredCVToCVData } from '@/lib/cv-templates/parser';
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
import type { CVChange } from '@/lib/types';

// Helper function to extract summary from optimized CV text
function extractSummaryFromOptimized(content: string): string | undefined {
  const summaryPatterns = [
    /(?:professional\s*summary|summary|profile|objective|berufsprofil)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:experience|education|skills|work|employment|berufserfahrung|ausbildung|kenntnisse)|$)/i,
  ];
  
  for (const pattern of summaryPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const summary = match[1].trim().split('\n').slice(0, 5).join(' ').trim();
      if (summary.length > 50) return summary;
    }
  }
  
  return undefined;
}

// Parse skills from AI-generated format: "**Category:** skill1, skill2 - **Category2:** skill3, skill4"
function parseSkillsFromAIFormat(text: string): Array<{ category: string; items: string[] }> {
  const skills: Array<{ category: string; items: string[] }> = [];
  
  // Pattern: **Category Name:** items - or Category Name: items
  // Split by " - " which separates categories in the AI output
  const categoryBlocks = text.split(/\s+-\s+/);
  
  for (const block of categoryBlocks) {
    // Match **Category:** or Category: pattern
    const match = block.match(/\*\*([^*:]+)\*\*[:\s]*(.+)|^([^:]+):\s*(.+)/);
    if (match) {
      const category = (match[1] || match[3] || '').trim();
      const itemsText = (match[2] || match[4] || '').trim();
      
      if (category && itemsText) {
        // Split items by comma, clean up each item
        const items = itemsText
          .split(/,/)
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('**')); // Filter out empty and markdown artifacts
        
        if (items.length > 0) {
          skills.push({ category, items });
        }
      }
    }
  }
  
  return skills;
}

// Apply changes from the Changes tab to the CV data
function applyChangesToCVData(cvData: CVData, changes: CVChange[]): CVData {
  if (!changes || changes.length === 0) return cvData;
  
  const result = { ...cvData, personal: { ...cvData.personal } };
  
  for (const change of changes) {
    const sectionLower = change.section.toLowerCase();
    
    // Apply headline/tagline changes
    if (sectionLower.includes('headline') || sectionLower.includes('tagline') || sectionLower.includes('title')) {
      if (change.updated) {
        result.personal.currentTitle = change.updated;
      }
    }
    
    // Apply summary changes
    if (sectionLower.includes('summary') || sectionLower.includes('profile') || sectionLower.includes('berufsprofil')) {
      if (change.updated && change.updated.length > 50) {
        result.summary = change.updated;
      }
    }
    
    // Apply skills/competencies changes - parse into clean grouped format
    if (sectionLower.includes('skill') || sectionLower.includes('competenc') || sectionLower.includes('kenntnisse')) {
      // Parse skills from the updated text - handle bullet point format
      const skillText = change.updated
        .replace(/\*\*/g, '') // Remove markdown bold
        .replace(/\n/g, ' '); // Normalize newlines
      
      // Split by bullet points (•) and clean up
      const skillItems = skillText
        .split(/[•·]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 100); // Filter out empty and too-long items
      
      if (skillItems.length > 0) {
        // Group skills into categories of 4-5 items each for clean display
        const groupSize = 5;
        const groups: Array<{ category: string; items: string[] }> = [];
        
        for (let i = 0; i < skillItems.length; i += groupSize) {
          const groupItems = skillItems.slice(i, i + groupSize);
          groups.push({
            category: '', // No category header for cleaner look
            items: groupItems,
          });
        }
        
        result.skills = groups;
      }
    }
    
    // Apply certification changes
    if (sectionLower.includes('certification') || sectionLower.includes('zertifikat')) {
      // Parse certifications - handle both bullet-separated and comma/newline formats
      let certItems: string[] = [];
      
      // Try splitting by bullet points first
      if (change.updated.includes('•') || change.updated.includes('·')) {
        certItems = change.updated.split(/[•·]/)
          .map(s => s.trim())
          .filter(s => s.length > 5);
      } else {
        // Fall back to comma/newline split
        certItems = change.updated.split(/[,\n]/)
          .map(s => s.trim())
          .filter(s => s.length > 5);
      }
      
      if (certItems.length > 0) {
        result.certifications = certItems.map((cert, idx) => {
          // Try to parse "Cert Name - Issuer, Date" format
          const parts = cert.split(/\s*[-–]\s*/);
          const name = parts[0]?.replace(/^[-•]\s*/, '').trim() || cert;
          const issuer = parts[1]?.trim() || '';
          const date = parts[2]?.trim();
          
          return {
            id: `cert-opt-${idx}`,
            name,
            issuer,
            date,
          };
        });
      }
    }
    
    // Apply experience changes - match by company/position
    if (sectionLower.includes('experience') || sectionLower.includes('berufserfahrung')) {
      // Try to find the matching experience entry
      const expIndex = result.experience.findIndex(exp => 
        change.section.toLowerCase().includes(exp.company.toLowerCase()) ||
        change.section.toLowerCase().includes(exp.position.toLowerCase())
      );
      
      if (expIndex >= 0 && change.updated) {
        result.experience = [...result.experience];
        // Parse bullets - handle both newline-separated and bullet-separated formats
        let bullets: string[] = [];
        
        // First try splitting by newlines
        const newlineBullets = change.updated.split(/\n/).filter(b => b.trim().startsWith('-') || b.trim().startsWith('•'));
        if (newlineBullets.length > 0) {
          bullets = newlineBullets.map(b => b.replace(/^[-•]\s*/, '').trim());
        } else {
          // Try splitting by bullet points (•) inline
          const inlineBullets = change.updated.split(/[•·]/).slice(1); // Skip first part (header info)
          if (inlineBullets.length > 0) {
            bullets = inlineBullets.map(b => b.trim()).filter(b => b.length > 10);
          }
        }
        
        if (bullets.length > 0) {
          result.experience[expIndex] = {
            ...result.experience[expIndex],
            bullets: bullets,
          };
        }
      }
    }
    
    // Apply education changes
    if (sectionLower.includes('education') || sectionLower.includes('ausbildung')) {
      // Try to find the matching education entry
      const eduIndex = result.education.findIndex(edu => 
        change.section.toLowerCase().includes(edu.institution?.toLowerCase() || '') ||
        change.section.toLowerCase().includes(edu.degree?.toLowerCase() || '')
      );
      
      if (eduIndex >= 0 && change.updated) {
        result.education = [...result.education];
        // Update the education entry with optimized content
        const lines = change.updated.split(/\n/).filter(l => l.trim());
        if (lines.length > 0) {
          // Try to parse degree, field, institution from the updated text
          const degreeMatch = lines[0].match(/^([^,]+),?\s*(.*)$/);
          if (degreeMatch) {
            result.education[eduIndex] = {
              ...result.education[eduIndex],
              degree: degreeMatch[1].trim(),
              field: degreeMatch[2]?.trim() || result.education[eduIndex].field,
            };
          }
        }
      }
    }
    
    // Apply language changes
    if (sectionLower.includes('language') || sectionLower.includes('sprach')) {
      // Parse languages from the updated text
      const langLines = change.updated.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 0);
      if (langLines.length > 0) {
        result.languages = langLines.map(line => {
          // Parse format: "Language – Level" or "Language (Level)"
          const match = line.match(/([^–(]+)[–(]\s*([^)]+)\)?/);
          if (match) {
            return {
              language: match[1].trim(),
              proficiency: match[2].trim(),
            };
          }
          return { language: line, proficiency: '' };
        });
      }
    }
  }
  
  return result;
}

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
    
    // If we have optimized content, apply ALL changes from the Changes tab
    if (showOptimized && generatedCV) {
      // First, try to extract summary from the content text
      let optimized = { ...parsed };
      
      // Apply optimized tagline if available
      if (generatedCV.optimizedTagline) {
        optimized.personal = {
          ...optimized.personal,
          currentTitle: generatedCV.optimizedTagline,
        };
      }
      
      if (generatedCV.content) {
        const extractedSummary = extractSummaryFromOptimized(generatedCV.content);
        if (extractedSummary) {
          optimized.summary = extractedSummary;
        }
      }
      
      // Then apply all changes from the changes array (skills, certifications, experience, etc.)
      if (generatedCV.changes && generatedCV.changes.length > 0) {
        optimized = applyChangesToCVData(optimized, generatedCV.changes);
      }
      
      return optimized;
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

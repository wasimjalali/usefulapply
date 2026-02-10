'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { Mail, Download, Copy, Check, RefreshCw, ChevronDown, FileText, File, Edit3, Eye } from 'lucide-react';
import type { GeneratedCoverLetter } from '@/lib/types';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';
import { useToast } from './ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { SignUpWallModal } from '@/components/SignUpWallModal';

export function CoverLetterPanel() {
  const { user } = useAuth();
  const { currentSession, isGenerating, isAgentWorking, setCoverLetter, currentCV, structuredCV } = useAppStore();
  const [showSignUpWall, setShowSignUpWall] = useState(false);
  const coverLetter = currentSession?.coverLetter;
  const generatedCV = currentSession?.generatedCV;
  const requirements = currentSession?.requirements;
  const jobDescription = currentSession?.jobDescription;
  const companyResearch = currentSession?.companyResearch;
  
  const [copied, setCopied] = useState(false);
  const [isLoadingCoverLetter, setIsLoadingCoverLetter] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState<GeneratedCoverLetter | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Check if cover letter still contains any address placeholder (old or new format)
  const hasAddressPlaceholder = () => {
    if (!coverLetter) return false;
    const fullText = formatCoverLetterAsText(coverLetter);
    return fullText.includes('[Company Address') || fullText.includes('[Insert Company Address');
  };

  // Initialize edited cover letter when cover letter changes
  useEffect(() => {
    if (coverLetter && !editedCoverLetter) {
      setEditedCoverLetter(coverLetter);
    }
  }, [coverLetter, editedCoverLetter]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatCoverLetterAsText = (letter: GeneratedCoverLetter) => {
    // If body contains the full letter (3-agent architecture), return it directly
    if (!letter.applicantAddress.name && letter.body) {
      return letter.body;
    }
    // Otherwise, format structured data
    return `${letter.applicantAddress.name}
${letter.applicantAddress.street}
${letter.applicantAddress.city}
${letter.applicantAddress.country}
${letter.applicantAddress.phone}
${letter.applicantAddress.email}

${letter.date}

${letter.companyAddress.companyName}
${letter.companyAddress.department || ''}
${letter.companyAddress.street || ''}
${letter.companyAddress.city || ''}

${letter.salutation}

${letter.body}

${letter.closing}

${letter.signatureName}`;
  };

  const handleCopy = async () => {
    if (coverLetter) {
      const fullText = formatCoverLetterAsText(coverLetter);
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadPDF = async () => {
    // Gate: Anonymous users must sign up to download
    if (!user) {
      setShowSignUpWall(true);
      setShowDownloadMenu(false);
      return;
    }
    const letterToDownload = editedCoverLetter || coverLetter;
    if (!letterToDownload) return;
    const showAddressReminder = hasAddressPlaceholder();
    
    setIsDownloading(true);
    setShowDownloadMenu(false);
    
    try {
      const companyName = (letterToDownload.companyAddress.companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '-');
      const doc = new jsPDF();
      
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const maxWidth = pageWidth - margin * 2;
      let yPos = margin;
      const lineHeight = 6;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      // Check if this is body-only format (3-agent architecture)
      if (!letterToDownload.applicantAddress.name && letterToDownload.body) {
        // Body contains the full letter - just render it
        const bodyLines = doc.splitTextToSize(letterToDownload.body, maxWidth);
        for (const line of bodyLines) {
          if (yPos > 270) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(line, margin, yPos);
          yPos += lineHeight;
        }
      } else {
        // Structured format - render each section
        // Applicant Address
        doc.setFont('helvetica', 'bold');
        doc.text(letterToDownload.applicantAddress.name, margin, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += lineHeight;
        if (letterToDownload.applicantAddress.street) {
          doc.text(letterToDownload.applicantAddress.street, margin, yPos);
          yPos += lineHeight;
        }
        if (letterToDownload.applicantAddress.city) {
          doc.text(letterToDownload.applicantAddress.city, margin, yPos);
          yPos += lineHeight;
        }
        if (letterToDownload.applicantAddress.country) {
          doc.text(letterToDownload.applicantAddress.country, margin, yPos);
          yPos += lineHeight;
        }
        if (letterToDownload.applicantAddress.phone) {
          doc.text(letterToDownload.applicantAddress.phone, margin, yPos);
          yPos += lineHeight;
        }
        if (letterToDownload.applicantAddress.email) {
          doc.text(letterToDownload.applicantAddress.email, margin, yPos);
          yPos += lineHeight;
        }
        yPos += lineHeight;
        
        // Date
        if (letterToDownload.date) {
          doc.text(letterToDownload.date, margin, yPos);
          yPos += lineHeight * 2;
        }
        
        // Company Address
        if (letterToDownload.companyAddress.companyName) {
          doc.setFont('helvetica', 'bold');
          doc.text(letterToDownload.companyAddress.companyName, margin, yPos);
          doc.setFont('helvetica', 'normal');
          yPos += lineHeight;
        }
        if (letterToDownload.companyAddress.department) {
          doc.text(letterToDownload.companyAddress.department, margin, yPos);
          yPos += lineHeight;
        }
        if (letterToDownload.companyAddress.street) {
          doc.text(letterToDownload.companyAddress.street, margin, yPos);
          yPos += lineHeight;
        }
        if (letterToDownload.companyAddress.city) {
          doc.text(letterToDownload.companyAddress.city, margin, yPos);
          yPos += lineHeight;
        }
        yPos += lineHeight;
        
        // Salutation
        if (letterToDownload.salutation) {
          doc.text(letterToDownload.salutation, margin, yPos);
          yPos += lineHeight * 2;
        }
        
        // Body - split into lines
        const bodyLines = doc.splitTextToSize(letterToDownload.body, maxWidth);
        for (const line of bodyLines) {
          if (yPos > 270) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(line, margin, yPos);
          yPos += lineHeight;
        }
        yPos += lineHeight;
        
        // Closing
        if (letterToDownload.closing) {
          doc.text(letterToDownload.closing, margin, yPos);
          yPos += lineHeight * 3;
        }
        
        // Signature
        if (letterToDownload.signatureName) {
          doc.setFont('helvetica', 'bold');
          doc.text(letterToDownload.signatureName, margin, yPos);
        }
      }
      
      // Use blob download for maximum browser compatibility
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Cover-Letter-${companyName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully!');
      if (showAddressReminder) {
        setTimeout(() => toast.warning("Don't forget to add the company address before sending!", 6000), 500);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to download PDF. Try copying the text instead.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadDOCX = async () => {
    // Gate: Anonymous users must sign up to download
    if (!user) {
      setShowSignUpWall(true);
      setShowDownloadMenu(false);
      return;
    }
    const letterToDownload = editedCoverLetter || coverLetter;
    if (!letterToDownload) return;
    const showAddressReminder = hasAddressPlaceholder();
    
    setIsDownloading(true);
    setShowDownloadMenu(false);
    
    try {
      const companyName = (letterToDownload.companyAddress.companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '-');
      
      // Check if this is body-only format (3-agent architecture)
      const isBodyOnly = !letterToDownload.applicantAddress.name && letterToDownload.body;
      
      let children: Paragraph[];
      
      if (isBodyOnly) {
        // Body contains the full letter - split by paragraphs
        children = letterToDownload.body.split('\n\n').map(para => 
          new Paragraph({ 
            children: [new TextRun(para.trim())],
            spacing: { after: 200 },
          })
        );
      } else {
        // Structured format - render each section
        children = [
          // Applicant Address
          new Paragraph({
            children: [new TextRun({ text: letterToDownload.applicantAddress.name, bold: true })],
          }),
          ...(letterToDownload.applicantAddress.street ? [new Paragraph({ children: [new TextRun(letterToDownload.applicantAddress.street)] })] : []),
          ...(letterToDownload.applicantAddress.city ? [new Paragraph({ children: [new TextRun(letterToDownload.applicantAddress.city)] })] : []),
          ...(letterToDownload.applicantAddress.country ? [new Paragraph({ children: [new TextRun(letterToDownload.applicantAddress.country)] })] : []),
          ...(letterToDownload.applicantAddress.phone ? [new Paragraph({ children: [new TextRun(letterToDownload.applicantAddress.phone)] })] : []),
          ...(letterToDownload.applicantAddress.email ? [new Paragraph({ children: [new TextRun(letterToDownload.applicantAddress.email)] })] : []),
          new Paragraph({ children: [] }), // Empty line
          
          // Date
          ...(letterToDownload.date ? [new Paragraph({ children: [new TextRun(letterToDownload.date)] })] : []),
          new Paragraph({ children: [] }), // Empty line
          
          // Company Address
          ...(letterToDownload.companyAddress.companyName ? [new Paragraph({
            children: [new TextRun({ text: letterToDownload.companyAddress.companyName, bold: true })],
          })] : []),
          ...(letterToDownload.companyAddress.department ? [new Paragraph({ children: [new TextRun(letterToDownload.companyAddress.department)] })] : []),
          ...(letterToDownload.companyAddress.street ? [new Paragraph({ children: [new TextRun(letterToDownload.companyAddress.street)] })] : []),
          ...(letterToDownload.companyAddress.city ? [new Paragraph({ children: [new TextRun(letterToDownload.companyAddress.city)] })] : []),
          new Paragraph({ children: [] }), // Empty line
          
          // Salutation
          ...(letterToDownload.salutation ? [new Paragraph({ children: [new TextRun(letterToDownload.salutation)] })] : []),
          new Paragraph({ children: [] }), // Empty line
          
          // Body - split by paragraphs
          ...letterToDownload.body.split('\n\n').map(para => 
            new Paragraph({ 
              children: [new TextRun(para.trim())],
              spacing: { after: 200 },
            })
          ),
          
          // Closing
          ...(letterToDownload.closing ? [new Paragraph({ children: [new TextRun(letterToDownload.closing)] })] : []),
          new Paragraph({ children: [] }), // Empty line
          new Paragraph({ children: [] }), // Empty line
          
          // Signature
          ...(letterToDownload.signatureName ? [new Paragraph({
            children: [new TextRun({ text: letterToDownload.signatureName, bold: true })],
          })] : []),
        ];
      }
      
      const doc = new Document({
        sections: [{
          properties: {},
          children,
        }],
      });
      
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Cover-Letter-${companyName}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('DOCX downloaded successfully!');
      if (showAddressReminder) {
        setTimeout(() => toast.warning("Don't forget to add the company address before sending!", 6000), 500);
      }
    } catch (error) {
      console.error('DOCX generation error:', error);
      toast.error('Failed to download DOCX. Try copying the text instead.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!jobDescription || !currentCV) return;

    setIsLoadingCoverLetter(true);
    try {
      // Build context for Writer Agent
      const context = {
        sessionId: currentSession?.id || 'regenerate',
        jobDescription,
        rawCV: currentCV.rawText,
        applicant: structuredCV?.personal ? {
          name: structuredCV.personal.fullName || '',
          email: structuredCV.personal.email || '',
          phone: structuredCV.personal.phone || '',
          address: [
            structuredCV.personal.address,
            structuredCV.personal.city,
            structuredCV.personal.country
          ].filter(Boolean).join(', '),
          skills: [],
          tools: [],
          languages: [],
          experiences: [],
          certifications: [],
        } : undefined,
        job: requirements ? {
          title: requirements.title || '',
          companyName: requirements.company || '',
          location: requirements.location,
          workType: requirements.workType,
          requiredSkills: requirements.hardSkills || [],
          niceToHaveSkills: requirements.niceToHave || [],
          responsibilities: requirements.responsibilities || [],
          startDate: requirements.startDate,
          expectedSalary: requirements.expectedSalary,
        } : undefined,
        companyResearch: companyResearch || undefined,
      };

      // Use new regenerate API with Writer Agent
      const response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cover-letter',
          context,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Store as body-only format (3-agent architecture)
        const newCoverLetter: GeneratedCoverLetter = {
          applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
          date: '',
          companyAddress: { companyName: '', street: '' },
          salutation: '',
          body: data.coverLetter,
          closing: '',
          signatureName: '',
        };
        setCoverLetter(newCoverLetter);
        setEditedCoverLetter(null);
      } else {
        console.error('Cover letter generation failed:', await response.text());
      }
    } catch (error) {
      console.error('Cover letter generation error:', error);
    } finally {
      setIsLoadingCoverLetter(false);
    }
  };

  // Show loading indicator during full generation workflow
  if (!coverLetter && isAgentWorking) {
    return (
      <KarkoAIStepIndicator 
        stepType="cover_letter" 
        isLoading={true}
        message="Composing your tailored cover letter..."
      />
    );
  }

  // Show generate button if CV is ready but no cover letter yet
  if (!coverLetter && currentCV && jobDescription) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-navy-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">Generate Cover Letter</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Create a personalized cover letter tailored to this job application.
          </p>
          <Button 
            variant="gold" 
            size="lg"
            onClick={handleGenerateCoverLetter}
            isLoading={isLoadingCoverLetter}
          >
            <Mail className="w-4 h-4 mr-2" />
            Generate Cover Letter
          </Button>
        </div>
      </div>
    );
  }

  // Show placeholder if CV not ready
  if (!coverLetter) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">No cover letter yet</h3>
          <p className="text-sm text-warm-gray leading-relaxed">
            Analyze a job to generate a personalized cover letter
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
    
    const newLetter = JSON.parse(JSON.stringify(activeCoverLetter));
    const keys = path.split('.');
    let obj = newLetter;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setEditedCoverLetter(newLetter);
  };

  // Save edited cover letter to store
  const handleSaveEdits = () => {
    if (editedCoverLetter) {
      setCoverLetter(editedCoverLetter);
      setIsEditMode(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Compact Single-Row Toolbar */}
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 glass-toolbar flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
            {/* View/Edit Toggle */}
            <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
              <button
                onClick={() => setIsEditMode(false)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  !isEditMode ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
                }`}
                title="View mode"
              >
                <Eye className="w-3 h-3" />
                View
              </button>
              <button
                onClick={() => setIsEditMode(true)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  isEditMode ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
                }`}
                title="Edit mode"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
            </div>
            
            {isEditMode && (
              <Button variant="primary" size="sm" onClick={handleSaveEdits} className="flex-shrink-0">
                <Check className="w-4 h-4 mr-1" />
                Save
              </Button>
            )}

            {/* Divider */}
            <div className="w-px h-5 bg-cream-200 flex-shrink-0" />

            {/* Spacer */}
            <div className="flex-1 min-w-2" />

            {/* Action Buttons */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGenerateCoverLetter}
              isLoading={isLoadingCoverLetter}
              className="flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Regenerate</span>
              <span className="sm:hidden">Regen</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0">
              {copied ? <Check className="w-4 h-4 text-sage-600" /> : <Copy className="w-4 h-4" />}
              <span className="ml-1 hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
            </Button>
          </div>
          
          {/* Download Dropdown — OUTSIDE overflow container so it's never clipped */}
          <div className="relative flex-shrink-0" ref={downloadMenuRef}>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-1" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              <span className="hidden sm:inline">Download</span>
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
            
            {showDownloadMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-cream-200 py-1 z-50">
                <button
                  onClick={handleDownloadPDF}
                  className="w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-cream-100 flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-red-500" />
                  Download as PDF
                </button>
                <button
                  onClick={handleDownloadDOCX}
                  className="w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-cream-100 flex items-center gap-2 cursor-pointer"
                >
                  <File className="w-4 h-4 text-blue-500" />
                  Download as DOCX
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {isGenerating || isLoadingCoverLetter || isAgentWorking ? (
          <KarkoAIStepIndicator 
            stepType="cover_letter" 
            isLoading={true}
            message="Crafting a personalized cover letter that highlights your qualifications..."
          />
        ) : (
          <Card className="max-w-2xl mx-auto p-8">
            {isEditMode ? (
              /* Edit Mode - Single textarea for full cover letter content */
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
              <>
                {/* Check if we have structured data or just the body (3-agent architecture) */}
                {activeCoverLetter?.applicantAddress.name ? (
                  <>
                    {/* Applicant Address - only show if we have structured data */}
                    <div className="text-sm text-charcoal mb-6">
                      <p className="font-medium">{activeCoverLetter?.applicantAddress.name}</p>
                      {activeCoverLetter?.applicantAddress.street && <p>{activeCoverLetter.applicantAddress.street}</p>}
                      {activeCoverLetter?.applicantAddress.city && <p>{activeCoverLetter.applicantAddress.city}</p>}
                      {activeCoverLetter?.applicantAddress.country && <p>{activeCoverLetter.applicantAddress.country}</p>}
                      {activeCoverLetter?.applicantAddress.phone && <p className="mt-2">{activeCoverLetter.applicantAddress.phone}</p>}
                      {activeCoverLetter?.applicantAddress.email && <p>{activeCoverLetter.applicantAddress.email}</p>}
                    </div>

                    {/* Date */}
                    {activeCoverLetter?.date && <p className="text-sm text-charcoal mb-6">{activeCoverLetter.date}</p>}

                    {/* Company Address */}
                    {activeCoverLetter?.companyAddress.companyName && (
                      <div className="text-sm text-charcoal mb-6">
                        <p className="font-medium">{activeCoverLetter.companyAddress.companyName}</p>
                        {activeCoverLetter.companyAddress.department && <p>{activeCoverLetter.companyAddress.department}</p>}
                        {activeCoverLetter.companyAddress.street && <p>{activeCoverLetter.companyAddress.street}</p>}
                        {activeCoverLetter.companyAddress.city && <p>{activeCoverLetter.companyAddress.city}</p>}
                      </div>
                    )}

                    {/* Salutation */}
                    {activeCoverLetter?.salutation && <p className="text-sm text-charcoal mb-4">{activeCoverLetter.salutation}</p>}

                    {/* Body */}
                    <div className="text-sm text-charcoal whitespace-pre-wrap mb-6 leading-relaxed">
                      {activeCoverLetter?.body}
                    </div>

                    {/* Closing */}
                    {activeCoverLetter?.closing && <p className="text-sm text-charcoal mb-8">{activeCoverLetter.closing}</p>}

                    {/* Signature */}
                    {activeCoverLetter?.signatureName && <p className="text-sm text-charcoal font-medium">{activeCoverLetter.signatureName}</p>}
                  </>
                ) : (
                  /* 3-Agent Architecture: Body contains the full formatted letter */
                  <div className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed">
                    {activeCoverLetter?.body}
                  </div>
                )}
              </>
            )}
          </Card>
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

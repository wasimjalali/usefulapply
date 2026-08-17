'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import { Mail, Download, Copy, Check, RefreshCw, FileText, Edit3, Maximize2, X, Zap } from 'lucide-react';
import type { GeneratedCoverLetter } from '@/lib/types';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { StepIndicator } from './StepIndicator';
import { useToast } from './ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { downloadBlob } from '@/lib/utils/download-pdf';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';
import { generateRequestId } from '@/lib/utils/requestId';

interface CoverLetterPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

export function CoverLetterPanel({ toolbarPortal }: CoverLetterPanelProps = {}) {
  const { user } = useAuth();
  const { currentSession, isGenerating, isAgentWorking, agentWorkflowPhase, setCoverLetter, currentCV, structuredCV, masterCV } = useAppStore();
  const setPendingApplicationAction = useUIStore((state) => state.setPendingApplicationAction);
  const coverLetter = currentSession?.coverLetter;
  const requirements = currentSession?.requirements;
  const jobDescription = currentSession?.jobDescription;
  const companyResearch = currentSession?.companyResearch;
  const pendingFitAnalysis = currentSession?.pendingFitAnalysis;
  const hasFreshPendingFitAnalysis = Boolean(
    pendingFitAnalysis?.createdAt
    && Date.now() < new Date(pendingFitAnalysis.createdAt).getTime() + 30 * 60 * 1000
  );
  
  const [copied, setCopied] = useState(false);
  const [isLoadingCoverLetter, setIsLoadingCoverLetter] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'docx' | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState<GeneratedCoverLetter | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const { toast } = useToast();

  // Check if cover letter still contains any address placeholder (old or new format)
  const hasAddressPlaceholder = () => {
    if (!coverLetter) return false;
    const fullText = formatCoverLetterAsText(coverLetter);
    return fullText.includes('[Company Address') || fullText.includes('[Insert Company Address');
  };

  // Sync edited cover letter when cover letter changes (e.g., after regeneration)
  // Only skip sync when user is actively editing to avoid overwriting their changes
  useEffect(() => {
    if (coverLetter && !isEditMode) {
      setEditedCoverLetter(coverLetter);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverLetter]);

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
      try {
        const fullText = formatCoverLetterAsText(coverLetter);
        await navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
  };

  const handleDownloadPDF = async () => {
    const letterToDownload = editedCoverLetter || coverLetter;
    if (!letterToDownload) return;
    const showAddressReminder = hasAddressPlaceholder();
    
    setDownloadFormat('pdf');
    
    try {
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const applicantName = sanitize(
        letterToDownload.applicantAddress.name ||
        letterToDownload.signatureName ||
        structuredCV?.personal.fullName ||
        'Applicant'
      );
      const companyName = sanitize(
        letterToDownload.companyAddress.companyName ||
        currentSession?.company ||
        'Company'
      );
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
      
      // Use cross-browser download utility (handles iOS Safari)
      const pdfBlob = doc.output('blob');
      await downloadBlob(pdfBlob, `${applicantName}_${companyName}_Cover_Letter.pdf`);
      toast.success('PDF downloaded successfully!');
      if (showAddressReminder) {
        setTimeout(() => toast.warning("Don't forget to add the company address before sending!", 6000), 500);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to download PDF. Try copying the text instead.');
    } finally {
      setDownloadFormat(null);
    }
  };

  const handleDownloadDOCX = async () => {
    const letterToDownload = editedCoverLetter || coverLetter;
    if (!letterToDownload) return;
    const showAddressReminder = hasAddressPlaceholder();
    
    setDownloadFormat('docx');
    
    try {
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const applicantName = sanitize(
        letterToDownload.applicantAddress.name ||
        letterToDownload.signatureName ||
        structuredCV?.personal.fullName ||
        'Applicant'
      );
      const companyName = sanitize(
        letterToDownload.companyAddress.companyName ||
        currentSession?.company ||
        'Company'
      );
      
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
      await downloadBlob(blob, `${applicantName}_${companyName}_Cover_Letter.docx`);
      toast.success('DOCX downloaded successfully!');
      if (showAddressReminder) {
        setTimeout(() => toast.warning("Don't forget to add the company address before sending!", 6000), 500);
      }
    } catch (error) {
      console.error('DOCX generation error:', error);
      toast.error('Failed to download DOCX. Try copying the text instead.');
    } finally {
      setDownloadFormat(null);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!jobDescription || !currentCV) return;

    setIsLoadingCoverLetter(true);
    try {
      // Build context for Writer Agent
      // CRITICAL: Include masterCV and match data so anti-hallucination rules
      // have the same source documents and verified skill constraints as first generation
      const context = {
        sessionId: currentSession?.id || 'regenerate',
        jobDescription,
        rawCV: currentCV.rawText,
        masterCV: masterCV?.rawText,
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
        match: (currentSession?.matchingSkills || currentSession?.missingSkills) ? {
          score: currentSession?.matchScore ?? 0,
          matchingSkills: currentSession?.matchingSkills || [],
          missingSkills: currentSession?.missingSkills || [],
        } : undefined,
        companyResearch: companyResearch || undefined,
      };

      // Use new regenerate API with Writer Agent
      const response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-request-id': generateRequestId() },
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
        triggerCreditUpdate();
      } else {
        console.error('Cover letter generation failed:', await response.text());
      }
    } catch (error) {
      console.error('Cover letter generation error:', error);
    } finally {
      setIsLoadingCoverLetter(false);
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
    setEditedCoverLetter(newLetter);
  };

  // Save edited cover letter to store
  const handleSaveEdits = () => {
    if (editedCoverLetter) {
      setCoverLetter(editedCoverLetter);
      setIsEditMode(false);
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

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = (
    <>
      {/* Edit mode controls */}
      {isEditMode && (
        <>
          <span className="text-sm font-semibold text-navy-600 flex-shrink-0">Editing</span>
          <Button variant="primary" size="sm" onClick={handleSaveEdits} className="flex-shrink-0 rounded-2xl shadow-sm">
            <Check className="w-4 h-4 mr-1" />
            Save
          </Button>
          <button
            onClick={() => { setIsEditMode(false); setEditedCoverLetter(coverLetter); }}
            className="px-3.5 py-2 text-sm font-medium text-warm-gray hover:text-charcoal rounded-2xl hover:bg-cream-100 transition-all cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
        </>
      )}

      {/* Edit button (view mode) */}
      {!isEditMode && coverLetter && (
        <button
          onClick={() => setIsEditMode(true)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-white border border-cream-200 rounded-2xl hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0 shadow-sm"
        >
          <Edit3 className="w-4 h-4 text-navy-500" />
          <span>Edit</span>
        </button>
      )}

      {/* Action Buttons (view mode) */}
      {!isEditMode && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateCoverLetter}
            isLoading={isLoadingCoverLetter}
            className="flex-shrink-0 rounded-2xl bg-white shadow-sm"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            <span>Regenerate</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0 rounded-2xl bg-white shadow-sm">
            {copied ? <Check className="w-4 h-4 text-gold-600" /> : <Copy className="w-4 h-4" />}
            <span className="ml-1">{copied ? 'Copied!' : 'Copy'}</span>
          </Button>
        </>
      )}

      {/* Download actions (view mode) */}
      {!isEditMode && (
        <>
          <Button
            variant="gold"
            size="sm"
            onClick={handleDownloadPDF}
            isLoading={downloadFormat === 'pdf'}
            disabled={downloadFormat !== null}
            className="flex-shrink-0 rounded-2xl shadow-sm"
          >
            {downloadFormat !== 'pdf' && <Download className="w-4 h-4 mr-1" />}
            <span>Download PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadDOCX}
            isLoading={downloadFormat === 'docx'}
            disabled={downloadFormat !== null}
            className="flex-shrink-0 rounded-2xl bg-white shadow-sm"
          >
            {downloadFormat !== 'docx' && <FileText className="w-4 h-4 mr-1" />}
            <span>Download DOCX</span>
          </Button>
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
        {isGenerating || isLoadingCoverLetter || isAgentWorking ? (
          <StepIndicator
            stepType="cover_letter"
            isLoading={true}
            title={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing Fit' : undefined}
            message={agentWorkflowPhase === 'fit_analysis'
              ? 'Cover letter will be generated after you apply.'
              : 'Crafting a personalized cover letter...'
            }
            statusLabel={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing...' : undefined}
          />
        ) : (
          <>
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
              <Card className="p-8">
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

          </>
        )}
      </div>



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

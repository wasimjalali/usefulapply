'use client';

import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { Send, Copy, Check, Mail, RefreshCw, Edit3, Eye } from 'lucide-react';
import type { GeneratedEmail } from '@/lib/types';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';

export function EmailPanel() {
  const { 
    currentSession,
    updateCurrentSession,
    isGenerating,
    isAgentWorking,
  } = useAppStore();
  
  const email = currentSession?.email;
  const generatedCV = currentSession?.generatedCV;
  const requirements = currentSession?.requirements;
  const jobDescription = currentSession?.jobDescription;
  const companyResearch = currentSession?.companyResearch;

  // Update email using session update
  const setEmail = (newEmail: GeneratedEmail) => {
    updateCurrentSession({ email: newEmail });
  };

  const [copied, setCopied] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEmail, setEditedEmail] = useState<GeneratedEmail | null>(null);

  // Get active email (edited or original)
  const activeEmail = editedEmail || email;

  // Update edited email field
  const updateEmailField = (field: 'subject' | 'body', value: string) => {
    if (!activeEmail) return;
    setEditedEmail({ ...activeEmail, [field]: value });
  };

  // Save edited email
  const handleSaveEdits = () => {
    if (editedEmail) {
      setEmail(editedEmail);
      setIsEditMode(false);
    }
  };

  const handleGenerateEmail = async () => {
    if (!jobDescription) return;
    
    // Get currentCV and structuredCV from store
    const { currentCV, structuredCV } = useAppStore.getState();
    if (!currentCV) return;

    setIsLoadingEmail(true);
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
          skills: [],
          tools: [],
          languages: [],
          experiences: [],
          certifications: [],
        } : undefined,
        job: requirements ? {
          title: requirements.title || '',
          companyName: requirements.company || '',
          requiredSkills: requirements.hardSkills || [],
          niceToHaveSkills: requirements.niceToHave || [],
          responsibilities: requirements.responsibilities || [],
        } : undefined,
        companyResearch: companyResearch || undefined,
      };

      // Use new regenerate API with Writer Agent
      const response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          context,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Email now comes as { subject, body } from Writer Agent
        setEmail({
          subject: data.email.subject,
          body: data.email.body,
          attachmentNote: 'Please find my CV and cover letter attached.',
        });
        setEditedEmail(null);
      } else {
        console.error('Email generation failed:', await response.text());
      }
    } catch (error) {
      console.error('Email generation error:', error);
    } finally {
      setIsLoadingEmail(false);
    }
  };

  const handleCopyBody = async () => {
    if (email) {
      await navigator.clipboard.writeText(email.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopySubject = async () => {
    if (email) {
      await navigator.clipboard.writeText(email.subject);
      setCopiedSubject(true);
      setTimeout(() => setCopiedSubject(false), 2000);
    }
  };

  const handleCopyAll = async () => {
    if (email) {
      // Format: Subject line followed by blank line and body
      const fullEmail = `Subject: ${email.subject}\n\n${email.body}`;
      await navigator.clipboard.writeText(fullEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenInEmail = () => {
    // Use activeEmail which respects edited content
    const emailToUse = activeEmail || email;
    
    if (!emailToUse?.subject || !emailToUse?.body) {
      alert('Email content is not ready yet. Please wait for the email to be generated.');
      return;
    }
    
    // Properly encode subject and body for mailto link
    const encodedSubject = encodeURIComponent(emailToUse.subject);
    
    // Truncate body if too long (mailto has ~2000 char limit in some browsers)
    let bodyToEncode = emailToUse.body;
    const maxBodyLength = 1500; // Leave room for subject and mailto: prefix
    if (bodyToEncode.length > maxBodyLength) {
      bodyToEncode = bodyToEncode.substring(0, maxBodyLength) + '\n\n[Email truncated - please paste the full content from the app]';
    }
    
    const encodedBody = encodeURIComponent(bodyToEncode);
    const mailtoLink = `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
    
    // Create a hidden anchor element and click it
    // This is the most reliable way to trigger mailto links across browsers
    const link = document.createElement('a');
    link.href = mailtoLink;
    link.target = '_blank'; // Opens in new tab/window if mailto fails
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Show loading indicator during full generation workflow
  if (!email && isAgentWorking) {
    return (
      <KarkoAIStepIndicator 
        stepType="email" 
        isLoading={true}
        message="Generating your application email..."
      />
    );
  }

  // Show generate button if job description is available but no email yet
  if (!email && jobDescription) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center mx-auto mb-5">
            <Send className="w-8 h-8 text-navy-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">Generate Application Email</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Create a professional email to send with your CV and cover letter.
          </p>
          <Button 
            variant="gold" 
            size="lg"
            onClick={handleGenerateEmail}
            isLoading={isLoadingEmail}
          >
            <Send className="w-4 h-4 mr-2" />
            Generate Email
          </Button>
        </div>
      </div>
    );
  }

  // Show placeholder if CV not ready
  if (!email) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <Send className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">No email yet</h3>
          <p className="text-sm text-warm-gray leading-relaxed">
            Generate a cover letter first, then create an application email
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Compact Single-Row Toolbar */}
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/50 backdrop-blur-2xl border-b border-white/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] flex-shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
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
              onClick={() => {
                setIsEditMode(true);
                if (email && !editedEmail) {
                  setEditedEmail(email);
                }
              }}
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
            onClick={handleGenerateEmail}
            isLoading={isLoadingEmail}
            className="flex-shrink-0"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Regenerate</span>
            <span className="sm:hidden">Regen</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyAll} className="flex-shrink-0">
            {copied ? <Check className="w-4 h-4 text-sage-600" /> : <Copy className="w-4 h-4" />}
            <span className="ml-1 hidden sm:inline">{copied ? 'Copied!' : 'Copy All'}</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenInEmail} className="flex-shrink-0">
            <Mail className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Open in Email</span>
            <span className="sm:hidden">Email</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {isLoadingEmail || isGenerating || isAgentWorking ? (
          <KarkoAIStepIndicator 
            stepType="email" 
            isLoading={true}
            message="Composing a professional application email..."
          />
        ) : (
          <Card className="max-w-2xl mx-auto">
            {/* Subject Line */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-warm-gray uppercase tracking-wide">
                  Subject Line
                </label>
                <button
                  onClick={handleCopySubject}
                  className="text-xs text-navy-600 hover:text-navy-700 flex items-center gap-1"
                >
                  {copiedSubject ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedSubject ? 'Copied' : 'Copy'}
                </button>
              </div>
              {isEditMode ? (
                <input
                  type="text"
                  value={activeEmail?.subject || ''}
                  onChange={(e) => updateEmailField('subject', e.target.value)}
                  className="w-full bg-cream-50 rounded-lg p-3 border border-cream-300 text-charcoal font-medium focus:border-navy-400 focus:outline-none"
                  placeholder="Email subject..."
                />
              ) : (
                <div className="bg-cream-100 rounded-lg p-3 border border-cream-300">
                  <p className="text-charcoal font-medium">{activeEmail?.subject}</p>
                </div>
              )}
            </div>

            {/* Email Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-warm-gray uppercase tracking-wide">
                  Email Body
                </label>
                <button
                  onClick={handleCopyBody}
                  className="text-xs text-navy-600 hover:text-navy-700 flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {isEditMode ? (
                <textarea
                  value={activeEmail?.body || ''}
                  onChange={(e) => updateEmailField('body', e.target.value)}
                  className="w-full bg-cream-50 rounded-lg p-4 border border-cream-300 text-charcoal text-sm leading-relaxed focus:border-navy-400 focus:outline-none resize-none"
                  rows={10}
                  placeholder="Email body..."
                />
              ) : (
                <div className="bg-cream-100 rounded-lg p-4 border border-cream-300">
                  <div className="whitespace-pre-wrap text-charcoal text-sm leading-relaxed">
                    {activeEmail?.body}
                  </div>
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="mt-6 p-4 bg-gradient-to-br from-navy-50 to-cream-50 rounded-xl border border-navy-100">
              <h4 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gold-100 flex items-center justify-center text-xs">💡</span>
                Tips for sending
              </h4>
              <ul className="text-xs text-navy-600 space-y-2">
                <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Attach your optimized CV and cover letter as PDFs</li>
                <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Double-check the recipient&apos;s email address</li>
                <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Send during business hours for best visibility</li>
                <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Attach relevant certifications mentioned in your CV</li>
                <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Follow up after 5-7 business days if no response</li>
              </ul>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

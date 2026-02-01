'use client';

import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { Send, Copy, Check, Mail, RefreshCw, Edit3, Eye } from 'lucide-react';
import type { GeneratedEmail } from '@/lib/types';

export function EmailPanel() {
  const { 
    currentSession,
    updateCurrentSession,
    isGenerating 
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
      const fullEmail = `Subject: ${email.subject}\n\n${email.body}`;
      await navigator.clipboard.writeText(fullEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenInEmail = () => {
    if (email) {
      const mailtoLink = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      window.open(mailtoLink, '_blank');
    }
  };

  // Show generate button if job description is available but no email yet
  if (!email && jobDescription) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-100 p-8">
        <div className="text-center max-w-md">
          <Send className="w-12 h-12 text-navy-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-charcoal mb-2">Generate Application Email</h3>
          <p className="text-sm text-warm-gray mb-6">
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
      <div className="h-full flex items-center justify-center bg-cream-100 p-8">
        <div className="text-center">
          <Send className="w-12 h-12 text-cream-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-warm-gray">No email yet</h3>
          <p className="text-sm text-warm-gray mt-1">
            Generate a cover letter first, then create an application email
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cream-50">
      <div className="px-6 py-4 border-b border-cream-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-navy-600" />
            <h2 className="text-lg font-semibold text-charcoal">Application Email</h2>
          </div>
          <div className="flex gap-2">
            {/* View/Edit Mode Toggle */}
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => setIsEditMode(false)}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
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
                  if (email && !editedEmail) {
                    setEditedEmail(email);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  isEditMode ? 'bg-navy-600 text-white' : 'bg-cream-200 text-warm-gray hover:bg-cream-300'
                }`}
                title="Edit mode - Make changes directly"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
            </div>
            
            {isEditMode && (
              <Button variant="primary" size="sm" onClick={handleSaveEdits}>
                <Check className="w-4 h-4 mr-1" />
                Save
              </Button>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGenerateEmail}
              isLoading={isLoadingEmail}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              {copied ? <Check className="w-4 h-4 mr-1 text-sage-600" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? 'Copied!' : 'Copy All'}
            </Button>
            <Button variant="primary" size="sm" onClick={handleOpenInEmail}>
              <Mail className="w-4 h-4 mr-1" />
              Open in Email
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoadingEmail ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-600 mb-4"></div>
            <p className="text-warm-gray">Composing email...</p>
          </div>
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
            <div className="mt-6 p-4 bg-sage-50 rounded-lg border border-sage-200">
              <h4 className="text-sm font-medium text-sage-700 mb-2">Tips for sending</h4>
              <ul className="text-xs text-sage-600 space-y-1">
                <li>• Attach your optimized CV and cover letter as PDFs</li>
                <li>• Double-check the recipient&apos;s email address</li>
                <li>• Send during business hours for best visibility</li>
                <li>• Follow up after 5-7 business days if no response</li>
              </ul>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

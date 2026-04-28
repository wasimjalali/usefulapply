'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { Send, Copy, Check, RefreshCw, Edit3, Clock } from 'lucide-react';
import type { GeneratedEmail } from '@/lib/types';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';
import { useToast } from './ui/Toast';
import { PortalTooltip } from './ui/PortalTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { usePostHog } from 'posthog-js/react';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';

interface EmailPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

export function EmailPanel({ toolbarPortal }: EmailPanelProps = {}) {
  const { user } = useAuth();
  const posthog = usePostHog();
  const { 
    currentSession,
    updateCurrentSession,
    isGenerating,
    isAgentWorking,
    agentWorkflowPhase,
  } = useAppStore();
  const email = currentSession?.email;
  const followUpEmail = currentSession?.followUpEmail;
  const requirements = currentSession?.requirements;
  const jobDescription = currentSession?.jobDescription;
  const companyResearch = currentSession?.companyResearch;

  // Update email using session update
  const setEmail = (newEmail: GeneratedEmail) => {
    updateCurrentSession({ email: newEmail });
  };

  const [copied, setCopied] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedFollowUpSubject, setCopiedFollowUpSubject] = useState(false);
  const [copiedFollowUpBody, setCopiedFollowUpBody] = useState(false);
  const [copiedFullPrimary, setCopiedFullPrimary] = useState(false);
  const [copiedFullFollowUp, setCopiedFullFollowUp] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingFollowUp, setIsLoadingFollowUp] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeEmailTab, setActiveEmailTab] = useState<'primary' | 'follow-up'>('primary');
  const [editedEmail, setEditedEmail] = useState<GeneratedEmail | null>(null);
  const [editedFollowUp, setEditedFollowUp] = useState<{ subject: string; body: string; recommendedDelay: number } | null>(null);
  const { toast } = useToast();

  // Get active email (edited or original)
  const activeEmail = editedEmail || email;
  const activeFollowUp = editedFollowUp || followUpEmail;

  useEffect(() => {
    if (!followUpEmail && activeEmailTab === 'follow-up') {
      setActiveEmailTab('primary');
    }
  }, [followUpEmail, activeEmailTab]);

  // Update edited email field
  const updateEmailField = (field: 'subject' | 'body', value: string) => {
    if (!activeEmail) return;
    setEditedEmail({ ...activeEmail, [field]: value });
  };

  // Update edited follow-up email field
  const updateFollowUpField = (field: 'subject' | 'body', value: string) => {
    if (!activeFollowUp) return;
    setEditedFollowUp({ ...activeFollowUp, [field]: value });
  };

  // Save all edits (primary + follow-up)
  const handleSaveEdits = () => {
    if (editedEmail) {
      setEmail(editedEmail);
    }
    if (editedFollowUp) {
      updateCurrentSession({ followUpEmail: editedFollowUp });
    }
    setIsEditMode(false);
  };

  const handleGenerateEmail = async () => {
    if (!jobDescription) return;
    
    // Get currentCV and structuredCV from store
    const { currentCV, structuredCV } = useAppStore.getState();
    if (!currentCV) return;

    posthog?.capture('regeneration_requested', { section: 'email' });
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
        triggerCreditUpdate();
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
      try {
        await navigator.clipboard.writeText(email.body);
        posthog?.capture('document_copied', { document_type: 'email_body' });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
  };

  const handleCopySubject = async () => {
    if (email) {
      try {
        await navigator.clipboard.writeText(email.subject);
        setCopiedSubject(true);
        setTimeout(() => setCopiedSubject(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
  };

  const handleCopyFollowUpSubject = async () => {
    if (followUpEmail) {
      try {
        await navigator.clipboard.writeText(followUpEmail.subject);
        setCopiedFollowUpSubject(true);
        setTimeout(() => setCopiedFollowUpSubject(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
  };

  const handleCopyFollowUpBody = async () => {
    if (followUpEmail) {
      try {
        await navigator.clipboard.writeText(followUpEmail.body);
        setCopiedFollowUpBody(true);
        setTimeout(() => setCopiedFollowUpBody(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
  };

  const handleRegenerateFollowUp = async () => {
    if (!jobDescription) return;
    
    const { currentCV, structuredCV } = useAppStore.getState();
    if (!currentCV) return;

    posthog?.capture('regeneration_requested', { section: 'follow_up_email' });
    setIsLoadingFollowUp(true);
    try {
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
        applicationEmail: email ? { subject: email.subject, body: email.body } : undefined,
      };

      const response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'follow_up_email',
          context,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        updateCurrentSession({
          followUpEmail: {
            subject: data.followUpEmail.subject,
            body: data.followUpEmail.body,
            recommendedDelay: data.followUpEmail.recommendedDelay || 5,
          },
        });
        triggerCreditUpdate();
      } else {
        console.error('Follow-up email regeneration failed:', await response.text());
        toast.error('Failed to regenerate follow-up email. Please try again.');
      }
    } catch (error) {
      console.error('Follow-up email regeneration error:', error);
      toast.error('An error occurred while regenerating the follow-up email.');
    } finally {
      setIsLoadingFollowUp(false);
    }
  };

  const handleCopyFullPrimary = async () => {
    const emailToUse = activeEmail || email;
    if (!emailToUse?.subject || !emailToUse?.body) {
      toast.error('Email content is not ready yet. Please wait for the email to be generated.');
      return;
    }
    const fullText = `Subject: ${emailToUse.subject}\n\n${emailToUse.body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      posthog?.capture('document_copied', { document_type: 'email' });
      setCopiedFullPrimary(true);
      toast.success('Primary email copied to clipboard.');
      setTimeout(() => setCopiedFullPrimary(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleCopyFullFollowUp = async () => {
    const followUp = activeFollowUp || followUpEmail;
    if (!followUp?.subject || !followUp?.body) {
      toast.error('Follow-up email content is not ready yet.');
      return;
    }
    const fullText = `Subject: ${followUp.subject}\n\n${followUp.body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      posthog?.capture('document_copied', { document_type: 'follow_up_email' });
      setCopiedFullFollowUp(true);
      toast.success('Follow-up email copied to clipboard.');
      setTimeout(() => setCopiedFullFollowUp(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  // Show loading indicator during agent workflow
  if (!email && isAgentWorking) {
    return (
      <KarkoAIStepIndicator
        stepType="email"
        isLoading={true}
        title={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing Fit' : undefined}
        message={agentWorkflowPhase === 'fit_analysis'
          ? 'Email will be generated after you apply.'
          : 'Generating your application email...'
        }
        statusLabel={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing...' : undefined}
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
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">Generate Application Email</h3>
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
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">No email yet</h3>
          <p className="text-sm text-warm-gray leading-relaxed">
            Generate a cover letter first, then create an application email
          </p>
        </div>
      </div>
    );
  }

  const isFollowUpView = activeEmailTab === 'follow-up' && !!followUpEmail;
  const activeCopyHandler = isFollowUpView ? handleCopyFullFollowUp : handleCopyFullPrimary;
  const activeCopyTooltip = isFollowUpView ? 'Copy full follow-up email' : 'Copy full primary email';
  const activeCopyLabel = isFollowUpView
    ? (copiedFullFollowUp ? 'Copied' : 'Copy Follow-Up')
    : (copiedFullPrimary ? 'Copied' : 'Copy Email');
  const activeCopyState = isFollowUpView ? copiedFullFollowUp : copiedFullPrimary;
  const activeRegenerateHandler = isFollowUpView ? handleRegenerateFollowUp : handleGenerateEmail;
  const activeRegenerateLabel = isFollowUpView ? 'Regenerate Follow-Up' : 'Regenerate Email';
  const activeRegenerateLoading = isFollowUpView ? isLoadingFollowUp : isLoadingEmail;
  const followUpDelay = activeFollowUp?.recommendedDelay || followUpEmail?.recommendedDelay || 5;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = (
    <>
      {followUpEmail && (
        <div className="flex items-center bg-cream-50 border border-cream-200 rounded-2xl p-0.5 shadow-sm flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveEmailTab('primary')}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              activeEmailTab === 'primary'
                ? 'bg-navy-700 text-white shadow-sm'
                : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Application Email
          </button>
          <button
            type="button"
            onClick={() => setActiveEmailTab('follow-up')}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              activeEmailTab === 'follow-up'
                ? 'bg-navy-700 text-white shadow-sm'
                : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Follow-Up Email
          </button>
        </div>
      )}

      {isEditMode && (
        <>
          <span className="text-sm font-semibold text-navy-600 flex-shrink-0">Editing</span>
          <Button variant="primary" size="sm" onClick={handleSaveEdits} className="flex-shrink-0 rounded-2xl shadow-sm">
            <Check className="w-4 h-4 mr-1.5" />
            Save
          </Button>
          <button
            onClick={() => {
              setIsEditMode(false);
              setEditedEmail(null);
              setEditedFollowUp(null);
            }}
            className="px-3.5 py-2 text-sm font-medium text-warm-gray hover:text-charcoal rounded-2xl hover:bg-cream-100 transition-all cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
        </>
      )}

      {!isEditMode && email && (
        <button
          onClick={() => {
            setIsEditMode(true);
            if (email && !editedEmail) setEditedEmail(email);
            if (followUpEmail && !editedFollowUp) setEditedFollowUp(followUpEmail);
          }}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-white border border-cream-200 rounded-2xl hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0 shadow-sm"
        >
          <Edit3 className="w-4 h-4 text-navy-500" />
          <span>Edit</span>
        </button>
      )}

      {!isEditMode && (
        <>
          <PortalTooltip text={activeCopyTooltip}>
            <Button variant="primary" size="sm" onClick={activeCopyHandler} className="rounded-2xl shadow-sm flex-shrink-0">
              {activeCopyState ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
              {activeCopyLabel}
            </Button>
          </PortalTooltip>
          <Button
            variant="outline"
            size="sm"
            onClick={activeRegenerateHandler}
            isLoading={activeRegenerateLoading}
            className="rounded-2xl bg-white shadow-sm flex-shrink-0"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            {activeRegenerateLabel}
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

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {isLoadingEmail || isGenerating || isAgentWorking ? (
          <KarkoAIStepIndicator
            stepType="email"
            isLoading={true}
            title={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing Fit' : undefined}
            message={agentWorkflowPhase === 'fit_analysis'
              ? 'Email will be generated after you apply.'
              : 'Composing a professional application email...'
            }
            statusLabel={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing...' : undefined}
          />
        ) : (
          <>
            <Card padding="lg" className="max-w-3xl mx-auto rounded-[24px] border-cream-200 shadow-md">
              {!isFollowUpView ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-5" style={{ backgroundColor: 'rgba(201, 168, 76, 0.12)', color: '#b8952f' }}>
                    <Send className="w-3.5 h-3.5" />
                    Application Email
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-warm-gray uppercase tracking-[0.18em]">
                        Subject Line
                      </label>
                      <button
                        onClick={handleCopySubject}
                        className="text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1.5"
                      >
                        {copiedSubject ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedSubject ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={activeEmail?.subject || ''}
                        onChange={(e) => updateEmailField('subject', e.target.value)}
                        className="w-full bg-white rounded-2xl px-4 py-3.5 border border-cream-300 text-charcoal font-medium focus:border-navy-400 focus:outline-none"
                        placeholder="Email subject..."
                      />
                    ) : (
                      <div className="bg-white rounded-2xl px-4 py-3.5 border border-cream-300">
                        <p className="text-charcoal text-lg font-medium">{activeEmail?.subject}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-warm-gray uppercase tracking-[0.18em]">
                        Email Body
                      </label>
                      <button
                        onClick={handleCopyBody}
                        className="text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1.5"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {isEditMode ? (
                      <textarea
                        value={activeEmail?.body || ''}
                        onChange={(e) => updateEmailField('body', e.target.value)}
                        className="w-full bg-white rounded-2xl px-4 py-4 border border-cream-300 text-charcoal text-sm leading-relaxed focus:border-navy-400 focus:outline-none resize-none"
                        rows={11}
                        placeholder="Email body..."
                        style={{ borderLeft: '4px solid #c9a84c' }}
                      />
                    ) : (
                      <div className="bg-white rounded-2xl px-4 py-4 border border-cream-300" style={{ borderLeft: '4px solid #c9a84c' }}>
                        <div className="whitespace-pre-wrap text-charcoal text-sm leading-7">
                          {activeEmail?.body}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-br from-navy-50 to-cream-50 rounded-2xl border border-navy-100">
                    <h4 className="text-sm font-semibold text-navy-700 mb-3">Sending Tips</h4>
                    <ul className="text-sm text-navy-600 space-y-2">
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Attach your optimized CV and cover letter as PDFs.</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Double-check the recipient&apos;s email address and subject line before sending.</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Send during business hours for better visibility in the recruiter inbox.</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 mb-5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(201, 168, 76, 0.12)', color: '#b8952f' }}>
                      <Clock className="w-3.5 h-3.5" />
                      Follow-Up Email
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-navy-50 text-navy-700 border border-navy-100">
                      Send after {followUpDelay}-{followUpDelay + 2} business days
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-warm-gray uppercase tracking-[0.18em]">
                        Subject Line
                      </label>
                      <button
                        onClick={handleCopyFollowUpSubject}
                        className="text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1.5"
                      >
                        {copiedFollowUpSubject ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedFollowUpSubject ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={activeFollowUp?.subject || ''}
                        onChange={(e) => updateFollowUpField('subject', e.target.value)}
                        className="w-full bg-white rounded-2xl px-4 py-3.5 border border-cream-300 text-charcoal font-medium focus:border-navy-400 focus:outline-none"
                        placeholder="Follow-up subject..."
                      />
                    ) : (
                      <div className="bg-white rounded-2xl px-4 py-3.5 border border-cream-300">
                        <p className="text-charcoal text-lg font-medium">{activeFollowUp?.subject}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-warm-gray uppercase tracking-[0.18em]">
                        Follow-Up Body
                      </label>
                      <button
                        onClick={handleCopyFollowUpBody}
                        className="text-sm text-navy-600 hover:text-navy-700 flex items-center gap-1.5"
                      >
                        {copiedFollowUpBody ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedFollowUpBody ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {isEditMode ? (
                      <textarea
                        value={activeFollowUp?.body || ''}
                        onChange={(e) => updateFollowUpField('body', e.target.value)}
                        className="w-full bg-white rounded-2xl px-4 py-4 border border-cream-300 text-charcoal text-sm leading-relaxed focus:border-navy-400 focus:outline-none resize-none"
                        rows={10}
                        placeholder="Follow-up body..."
                        style={{ borderLeft: '4px solid #c9a84c' }}
                      />
                    ) : (
                      <div className="bg-white rounded-2xl px-4 py-4 border border-cream-300" style={{ borderLeft: '4px solid #c9a84c' }}>
                        <div className="whitespace-pre-wrap text-charcoal text-sm leading-7">
                          {activeFollowUp?.body}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-br from-navy-50 to-cream-50 rounded-2xl border border-navy-100">
                    <h4 className="text-sm font-semibold text-navy-700 mb-3">Follow-Up Tips</h4>
                    <ul className="text-sm text-navy-600 space-y-2">
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Schedule it for {followUpDelay}-{followUpDelay + 2} business days after the primary email.</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Do not re-attach your CV unless the company explicitly asks for it again.</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Keep the tone concise, polite, and focused on one relevant value point.</li>
                    </ul>
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
    </>
  );
}

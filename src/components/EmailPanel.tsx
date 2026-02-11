'use client';

import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { Send, Copy, Check, Mail, RefreshCw, Edit3, Eye, Clock } from 'lucide-react';
import type { GeneratedEmail } from '@/lib/types';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';
import { useToast } from './ui/Toast';
import { PortalTooltip } from './ui/PortalTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { SignUpWallModal } from '@/components/SignUpWallModal';

export function EmailPanel() {
  const { user } = useAuth();
  const { 
    currentSession,
    updateCurrentSession,
    isGenerating,
    isAgentWorking,
  } = useAppStore();
  const [showSignUpWall, setShowSignUpWall] = useState(false);
  
  const email = currentSession?.email;
  const followUpEmail = currentSession?.followUpEmail;
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
  const [copiedFollowUpSubject, setCopiedFollowUpSubject] = useState(false);
  const [copiedFollowUpBody, setCopiedFollowUpBody] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingFollowUp, setIsLoadingFollowUp] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEmail, setEditedEmail] = useState<GeneratedEmail | null>(null);
  const [editedFollowUp, setEditedFollowUp] = useState<{ subject: string; body: string; recommendedDelay: number } | null>(null);
  const { toast } = useToast();

  // Get active email (edited or original)
  const activeEmail = editedEmail || email;
  const activeFollowUp = editedFollowUp || followUpEmail;

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
    if (!user) { setShowSignUpWall(true); return; }
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

  const handleCopyFollowUpSubject = async () => {
    if (followUpEmail) {
      await navigator.clipboard.writeText(followUpEmail.subject);
      setCopiedFollowUpSubject(true);
      setTimeout(() => setCopiedFollowUpSubject(false), 2000);
    }
  };

  const handleCopyFollowUpBody = async () => {
    if (followUpEmail) {
      await navigator.clipboard.writeText(followUpEmail.body);
      setCopiedFollowUpBody(true);
      setTimeout(() => setCopiedFollowUpBody(false), 2000);
    }
  };

  const handleRegenerateFollowUp = async () => {
    if (!jobDescription) return;
    
    const { currentCV, structuredCV } = useAppStore.getState();
    if (!currentCV) return;

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

  // Open mailto: using a programmatic <a> click to bypass Next.js router interception.
  // window.location.href with mailto: can trigger client-side routing, causing blank pages.
  const openMailto = (subject: string, body: string, label: string) => {
    console.log('[mailto] Starting openMailto for:', label);
    console.log('[mailto] Subject:', subject?.substring(0, 50));
    console.log('[mailto] Body length:', body?.length);

    if (!subject || !body) {
      console.error('[mailto] No content to open');
      return;
    }

    // Always copy to clipboard as backup
    const fullText = `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullText).then(() => {
      console.log('[mailto] Copied to clipboard successfully');
    }).catch((err) => {
      console.warn('[mailto] Clipboard copy failed:', err);
    });

    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    let mailtoUrl = `mailto:?subject=${encodedSubject}&body=${encodedBody}`;

    console.log('[mailto] URL length:', mailtoUrl.length);

    // mailto: URLs over ~2000 chars fail silently in some browsers
    if (mailtoUrl.length > 2000) {
      console.log('[mailto] URL too long, truncating body');
      const maxBodyLength = 1500 - encodedSubject.length;
      const truncatedBody = encodeURIComponent(
        body.substring(0, Math.max(maxBodyLength, 200)) +
        '\n\n[Email truncated - please paste full content from the app]'
      );
      mailtoUrl = `mailto:?subject=${encodedSubject}&body=${truncatedBody}`;
    }

    console.log('[mailto] URL preview:', mailtoUrl.substring(0, 200) + '...');
    console.log('[mailto] Opening via anchor click...');

    try {
      // Use a programmatic <a> click instead of window.location.href
      // This bypasses Next.js router interception that causes blank pages
      const link = document.createElement('a');
      link.href = mailtoUrl;
      link.click();
      console.log('[mailto] Anchor click triggered successfully');
    } catch (err) {
      console.error('[mailto] Error opening mailto link:', err);
    }

    toast.success(`Opening ${label} in your email client... Also copied to clipboard as backup.`);
  };

  const handleOpenPrimaryInEmail = () => {
    if (!user) { setShowSignUpWall(true); return; }
    const emailToUse = activeEmail || email;
    if (!emailToUse?.subject || !emailToUse?.body) {
      toast.error('Email content is not ready yet. Please wait for the email to be generated.');
      return;
    }
    openMailto(emailToUse.subject, emailToUse.body, 'primary email');
  };

  const handleOpenFollowUpInEmail = () => {
    if (!user) { setShowSignUpWall(true); return; }
    const followUp = activeFollowUp || followUpEmail;
    if (!followUp?.subject || !followUp?.body) {
      toast.error('Follow-up email content is not ready yet.');
      return;
    }
    openMailto(followUp.subject, followUp.body, 'follow-up email');
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
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 glass-toolbar flex-shrink-0">
        <div className="flex items-center gap-1.5">
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
                if (email && !editedEmail) setEditedEmail(email);
                if (followUpEmail && !editedFollowUp) setEditedFollowUp(followUpEmail);
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Open in Email — split into Primary + Follow-Up */}
          <PortalTooltip text="Open primary email in your mail app">
            <Button variant="primary" size="sm" onClick={handleOpenPrimaryInEmail}>
              <Mail className="w-4 h-4 mr-1" />
              Primary
            </Button>
          </PortalTooltip>
          {followUpEmail && (
            <PortalTooltip text="Open follow-up email to schedule in your mail app">
              <Button variant="outline" size="sm" onClick={handleOpenFollowUpInEmail}>
                <Clock className="w-4 h-4 mr-1" />
                Follow-Up
              </Button>
            </PortalTooltip>
          )}
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
            {/* Primary Application Email Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold mb-4" style={{ backgroundColor: 'rgba(201, 168, 76, 0.12)', color: '#b8952f' }}>
              <Send className="w-3 h-3" />
              Primary Application Email
            </div>

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
                  style={{ borderLeft: '3px solid #c9a84c' }}
                />
              ) : (
                <div className="bg-cream-100 rounded-lg p-4 border border-cream-300" style={{ borderLeft: '3px solid #c9a84c' }}>
                  <div className="whitespace-pre-wrap text-charcoal text-sm leading-relaxed">
                    {activeEmail?.body}
                  </div>
                </div>
              )}
            </div>

            {/* Regenerate Primary Email */}
            <div className="flex justify-end mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateEmail}
                isLoading={isLoadingEmail}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Regenerate Email
              </Button>
            </div>

            {/* Follow-Up Email Section */}
            {followUpEmail && (
              <>
                {/* Gold Dashed Divider */}
                <div className="relative mt-8 mb-6" style={{ borderTop: '2px dashed #c9a84c' }}>
                  <span className="absolute -top-2.5 left-4 bg-white px-3 text-xs font-bold uppercase tracking-wider" style={{ color: '#c9a84c' }}>
                    Follow-Up Email — Send after {followUpEmail.recommendedDelay} days
                  </span>
                </div>

                {/* Schedule Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold mb-4" style={{ backgroundColor: 'rgba(201, 168, 76, 0.12)', color: '#b8952f' }}>
                  <Clock className="w-3 h-3" />
                  Schedule for: {followUpEmail.recommendedDelay}–{followUpEmail.recommendedDelay + 2} business days after sending primary email
                </div>

                {/* Follow-up Subject */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-warm-gray uppercase tracking-wide">
                      Subject Line
                    </label>
                    <button
                      onClick={handleCopyFollowUpSubject}
                      className="text-xs text-navy-600 hover:text-navy-700 flex items-center gap-1"
                    >
                      {copiedFollowUpSubject ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedFollowUpSubject ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={activeFollowUp?.subject || ''}
                      onChange={(e) => updateFollowUpField('subject', e.target.value)}
                      className="w-full bg-cream-50 rounded-lg p-3 border border-cream-300 text-charcoal font-medium focus:border-navy-400 focus:outline-none"
                      placeholder="Follow-up subject..."
                    />
                  ) : (
                    <div className="bg-cream-100 rounded-lg p-3 border border-cream-300">
                      <p className="text-charcoal font-medium">{activeFollowUp?.subject}</p>
                    </div>
                  )}
                </div>

                {/* Follow-up Body with gold left border */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-warm-gray uppercase tracking-wide">
                      Follow-Up Body
                    </label>
                    <button
                      onClick={handleCopyFollowUpBody}
                      className="text-xs text-navy-600 hover:text-navy-700 flex items-center gap-1"
                    >
                      {copiedFollowUpBody ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedFollowUpBody ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {isEditMode ? (
                    <textarea
                      value={activeFollowUp?.body || ''}
                      onChange={(e) => updateFollowUpField('body', e.target.value)}
                      className="w-full bg-cream-50 rounded-lg p-4 border border-cream-300 text-charcoal text-sm leading-relaxed focus:border-navy-400 focus:outline-none resize-none"
                      rows={8}
                      placeholder="Follow-up body..."
                      style={{ borderLeft: '3px solid #c9a84c' }}
                    />
                  ) : (
                    <div className="bg-cream-100 rounded-lg p-4 border border-cream-300" style={{ borderLeft: '3px solid #c9a84c' }}>
                      <div className="whitespace-pre-wrap text-charcoal text-sm leading-relaxed">
                        {activeFollowUp?.body}
                      </div>
                    </div>
                  )}
                </div>

                {/* Regenerate Follow-Up Button */}
                <div className="flex justify-end mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateFollowUp}
                    isLoading={isLoadingFollowUp}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Regenerate Follow-Up
                  </Button>
                </div>
              </>
            )}

            {/* Combined Tips */}
            <div className="mt-6 p-4 bg-gradient-to-br from-navy-50 to-cream-50 rounded-xl border border-navy-100">
              <h4 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gold-100 flex items-center justify-center text-xs">💡</span>
                {followUpEmail ? 'Tips for both emails' : 'Tips for sending'}
              </h4>
              {followUpEmail ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-navy-700 mb-1.5">PRIMARY EMAIL:</p>
                    <ul className="text-xs text-navy-600 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Attach your optimized CV and cover letter as PDFs</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Double-check the recipient&apos;s email address</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Send Tue-Thu, 8-10 AM recipient&apos;s time zone</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-navy-700 mb-1.5">FOLLOW-UP EMAIL:</p>
                    <ul className="text-xs text-navy-600 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Schedule for {followUpEmail.recommendedDelay}-{followUpEmail.recommendedDelay + 2} business days after primary</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Use Gmail &quot;Schedule Send&quot; or Outlook &quot;Delay Delivery&quot; to set it in advance</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Do NOT re-attach your CV — they have it</li>
                      <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> If no response after follow-up, move on — do not send a third email</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <ul className="text-xs text-navy-600 space-y-2">
                  <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Attach your optimized CV and cover letter as PDFs</li>
                  <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Double-check the recipient&apos;s email address</li>
                  <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Send during business hours for best visibility</li>
                  <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Attach relevant certifications mentioned in your CV</li>
                  <li className="flex items-start gap-2"><span className="text-gold-500 mt-0.5">•</span> Follow up after 5-7 business days if no response</li>
                </ul>
              )}
            </div>
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

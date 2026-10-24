'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import { Send, Copy, Check, Edit3, Zap } from 'lucide-react';
import type { GeneratedEmail } from '@/lib/types';
import { StepIndicator } from './StepIndicator';
import { KitDocumentError } from './KitDocumentError';
import { useToast } from './ui/Toast';
import { usePostHog } from 'posthog-js/react';
import { formatEmailAsText } from '@/lib/utils/kit-export';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgedStart, acknowledgementFor, commitEditorSave, discardedEditorStart, discardedSinceSave, editorShouldClose, getEditorStart, rebaseEditorStart, subscribeConflictAcknowledged, type EditorStart } from '@/lib/session-sync';

interface EmailPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

type FollowUp = { subject: string; body: string; recommendedDelay: number };

const TOOL_CLASS = 'inline-flex h-9 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-medium text-charcoal shadow-sm hover:bg-white transition-colors duration-200 cursor-pointer flex-shrink-0';
const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-warm-gray';
const FIELD_BOX = 'w-full rounded-lg border border-cream-200 bg-white px-3 py-2.5 text-sm text-charcoal';

export function EmailPanel({ toolbarPortal }: EmailPanelProps = {}) {
  const posthog = usePostHog();
  const {
    currentSession,
    isAgentWorking,
    agentWorkflowPhase,
  } = useAppStore();
  const setPendingApplicationAction = useUIStore((state) => state.setPendingApplicationAction);
  const email = currentSession?.email;
  const followUpEmail = currentSession?.followUpEmail;
  const pendingFitAnalysis = currentSession?.pendingFitAnalysis;
  // Each email fails on its own in a kit run. Its slot shows the error and a
  // retry only while that email is still missing.
  const emailFailed = !email && Boolean(currentSession?.kitDocumentErrors?.applicationEmail);
  const followUpFailed = !followUpEmail && Boolean(currentSession?.kitDocumentErrors?.followUpEmail);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const hasFreshPendingFitAnalysis = Boolean(
    pendingFitAnalysis?.createdAt
    && nowMs < new Date(pendingFitAnalysis.createdAt).getTime() + 30 * 60 * 1000
  );

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEmail, setEditedEmail] = useState<GeneratedEmail | null>(null);
  const [editedFollowUp, setEditedFollowUp] = useState<FollowUp | null>(null);
  // Which store objects the edit copies were taken from. A rewrite from the
  // chat or a session switch replaces those objects, so a copy taken from an
  // older one is stale and the panel falls back to the store (unless the user
  // is mid-edit, where their typing wins).
  const [editBase, setEditBase] = useState<{ email: GeneratedEmail | null; followUp: FollowUp | null } | null>(null);
  const editSessionIdRef = useRef<string | null>(null);
  // The drafts as they are now, for the save that finishes later (the user keeps typing while it runs).
  const draftsRef = useRef<{ email: GeneratedEmail | null; followUp: FollowUp | null }>({ email: null, followUp: null });
  // Which documents the user typed into. Save writes only those: the other one is a copy taken when the editor
  // opened, and writing it back would put an old version over whatever the store holds now.
  const [typed, setTyped] = useState({ email: false, followUp: false });
  // The revision the editor opened on; the drafts live outside the store (see commitEditorSave).
  const editStartRef = useRef<EditorStart | undefined>(undefined);
  // Counts the discards of email conflict text that reached this editor. A save still running when a draft
  // is discarded sees the count has moved and leaves the editor alone when its answer comes back.
  const discardEpochRef = useRef(0);
  // The same discards, per document: a save waiting for the sync lock skips a document discarded after Save was clicked.
  const discardsRef = useRef({ email: 0, followUp: 0 });
  // When the user deals with a conflict notice this editor produced (restores or copies the text), the editor is based
  // on the version that notice showed, for that document only: the email and the follow-up each keep their own
  // snapshot, so a Save still catches a newer server version of the other one. Discarding the text a draft holds
  // drops that draft, as Cancel does: the editor keeps the other one. Other editors' notices and other fields' leave it alone.
  useEffect(() => subscribeConflictAcknowledged((acknowledged, ack) => {
    if (editSessionIdRef.current !== acknowledged) return;
    const emailAction = acknowledgementFor(ack, ['email'], editStartRef.current);
    const followUpAction = acknowledgementFor(ack, ['followUpEmail'], editStartRef.current);
    if (emailAction === 'ignore' && followUpAction === 'ignore') return;
    if (emailAction === 'reset' || followUpAction === 'reset') {
      discardEpochRef.current += 1;
      if (emailAction === 'reset') discardsRef.current.email += 1;
      if (followUpAction === 'reset') discardsRef.current.followUp += 1;
      if (emailAction === 'reset' && followUpAction === 'reset') {
        setIsEditMode(false);
        setEditedEmail(null);
        setEditedFollowUp(null);
        setEditBase(null);
        editSessionIdRef.current = null;
        editStartRef.current = undefined;
        return;
      }
      // The discarded document shows the store's version again, read in the same tick as the snapshot moves to it:
      // the draft no longer sets that document, so a later Save checks it against the version the editor shows.
      const state = useSessionStore.getState();
      const shown = state.sessions.find((session) => session.id === acknowledged)
        ?? (state.currentSession?.id === acknowledged ? state.currentSession : null);
      if (emailAction === 'reset') {
        setTyped((prev) => ({ ...prev, email: false }));
        setEditedEmail(shown?.email ?? null);
        editStartRef.current = discardedEditorStart(acknowledged, editStartRef.current, ['email']);
      } else {
        setTyped((prev) => ({ ...prev, followUp: false }));
        setEditedFollowUp(shown?.followUpEmail ?? null);
        editStartRef.current = discardedEditorStart(acknowledged, editStartRef.current, ['followUpEmail']);
      }
      return;
    }
    const rebased = [...(emailAction === 'rebase' ? ['email'] : []), ...(followUpAction === 'rebase' ? ['followUpEmail'] : [])];
    editStartRef.current = acknowledgedStart(ack, rebased, editStartRef.current);
  }), []);
  const { toast } = useToast();
  useEffect(() => { draftsRef.current = { email: editedEmail, followUp: editedFollowUp }; }, [editedEmail, editedFollowUp]);

  const editsCurrent = isEditMode || (editBase !== null && editBase.email === (email ?? null) && editBase.followUp === (followUpEmail ?? null));
  const activeEmail = editsCurrent && editedEmail ? editedEmail : email;
  const activeFollowUp = editsCurrent && editedFollowUp ? editedFollowUp : followUpEmail;

  useEffect(() => {
    if (editSessionIdRef.current === null || editSessionIdRef.current === currentSession?.id) return;
    editSessionIdRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- switching applications must discard the previous edit buffer
    setIsEditMode(false);
    setEditedEmail(null);
    setEditedFollowUp(null);
    setEditBase(null);
  }, [currentSession?.id]);

  const updateEmailField = (field: 'subject' | 'body', value: string) => {
    if (!activeEmail) return;
    setTyped((prev) => ({ ...prev, email: true }));
    setEditedEmail({ ...activeEmail, [field]: value });
  };

  const updateFollowUpField = (field: 'subject' | 'body', value: string) => {
    if (!activeFollowUp) return;
    setTyped((prev) => ({ ...prev, followUp: true }));
    setEditedFollowUp({ ...activeFollowUp, [field]: value });
  };

  const handleSaveEdits = () => {
    const editSessionId = editSessionIdRef.current;
    if (!editSessionId) {
      setEditedEmail(null);
      setEditedFollowUp(null);
      setEditBase(null);
      setIsEditMode(false);
      return;
    }
    const sentDrafts = JSON.stringify([editedEmail, editedFollowUp]);
    const epochAtSave = discardEpochRef.current;
    const discardsAtSave = { ...discardsRef.current };
    // Save now, against the revision this editor opened on. If another write got in
    // first the drafts are not applied: the editor stays open with the text in it.
    void commitEditorSave(editSessionId, editStartRef.current, () => {
      // This runs once the sync lock is free. A document discarded since the click is not written: the editor shows the store's copy.
      if (editedEmail && typed.email && !discardedSinceSave(discardsAtSave.email, discardsRef.current.email)) {
        useSessionStore.getState().updateSessionById(editSessionId, { email: editedEmail });
      }
      if (editedFollowUp && typed.followUp && !discardedSinceSave(discardsAtSave.followUp, discardsRef.current.followUp)) {
        useSessionStore.getState().updateSessionById(editSessionId, { followUpEmail: editedFollowUp });
      }
    }).then((outcome) => {
      // A draft was discarded while the save ran: what was sent is gone, and nothing here reopens or closes the editor.
      if (epochAtSave !== discardEpochRef.current) return;
      // Anything but a save the server confirmed leaves the editor open with the text in it.
      // So does typing during the save: the newer drafts stay, now based on what was just saved.
      const nowDrafts = JSON.stringify([draftsRef.current.email, draftsRef.current.followUp]);
      if (!editorShouldClose(outcome, sentDrafts, nowDrafts)) {
        // The save confirmed the columns this editor's drafts set: only those move to the new revision.
        if ((outcome === 'saved' || outcome === 'clean') && editStartRef.current) {
          editStartRef.current = rebaseEditorStart(editSessionId, editStartRef.current, editStartRef.current.lineage.columns);
        }
        return;
      }
      setEditedEmail(null);
      setEditedFollowUp(null);
      setEditBase(null);
      setIsEditMode(false);
      editSessionIdRef.current = null;
    });
  };

  const copy = async (text: string, key: string, eventType?: string) => {
    if (!text) {
      toast.error('That email isn\'t ready yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (eventType) posthog?.capture('document_copied', { document_type: eventType });
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
      toast.error('Couldn\'t copy. Select the text and copy it by hand.');
    }
  };

  // Show loading indicator during agent workflow
  if (!email && isAgentWorking) {
    return (
      <StepIndicator
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

  // Fit analysis is pending — the email can't be generated alone, so surface
  // the real next steps (apply for the job or start over).
  if (!email && hasFreshPendingFitAnalysis) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center mx-auto mb-5">
            <Send className="w-8 h-8 text-navy-400" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">Ready to apply?</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Your fit analysis is ready. Generate the full application to unlock your tailored email.
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

  // No email and no pending fit analysis — the email is always generated as
  // part of the full application kit. Do not offer a standalone "Generate
  // Email" button (it cannot work without a generation context).
  if (!email && !emailFailed) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <Send className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-charcoal mb-2">No email yet</h3>
          <p className="text-sm text-warm-gray leading-relaxed">
            Paste a job description in the chat to generate your full application kit.
          </p>
        </div>
      </div>
    );
  }

  const followUpDelay = activeFollowUp?.recommendedDelay || 5;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = (
    <>
      {isEditMode ? (
        <>
          <span className="text-sm font-semibold text-navy-600 flex-shrink-0">Editing</span>
          <button
            type="button"
            onClick={handleSaveEdits}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-navy-600 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 transition-colors duration-200 cursor-pointer flex-shrink-0"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setIsEditMode(false);
              setEditedEmail(null);
              setEditedFollowUp(null);
              setEditBase(null);
            }}
            className="h-9 px-3.5 text-sm font-medium text-warm-gray hover:text-charcoal rounded-full hover:bg-cream-100 transition-colors duration-200 cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
        </>
      ) : (email || followUpEmail) && (
        <button
          type="button"
          onClick={() => {
            setIsEditMode(true);
            setTyped({ email: false, followUp: false });
            editSessionIdRef.current = currentSession?.id ?? null;
            editStartRef.current = currentSession ? getEditorStart(currentSession.id) : undefined;
            setEditedEmail(email ?? null);
            setEditedFollowUp(followUpEmail ?? null);
            setEditBase({ email: email ?? null, followUp: followUpEmail ?? null });
          }}
          className={TOOL_CLASS}
        >
          <Edit3 className="w-4 h-4 text-navy-500" />
          Edit
        </button>
      )}
      <span className="flex-shrink-0 pl-1 text-[13px] text-warm-gray">
        {currentSession?.coverLetter
          ? 'Attach the CV and cover letter as PDFs when you send.'
          : 'Attach the CV as a PDF when you send.'}
      </span>
    </>
  );

  const renderCard = (opts: {
    key: 'primary' | 'follow-up';
    title: string;
    chip?: string;
    subject: string;
    body: string;
    onSubject: (v: string) => void;
    onBody: (v: string) => void;
    copyEvent: string;
  }) => (
    <div className="box-border w-full rounded-2xl border border-cream-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="whitespace-nowrap text-sm font-semibold text-navy-800">{opts.title}</h3>
          {opts.chip && (
            <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-accent-soft-strong px-2.5 text-[11px] font-semibold text-accent-soft-ink">
              {opts.chip}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => copy(formatEmailAsText({ subject: opts.subject, body: opts.body }), opts.key, opts.copyEvent)}
          className={`${TOOL_CLASS} h-8 shrink-0 text-[13px]`}
        >
          {copiedKey === opts.key ? <Check className="w-4 h-4 text-gold-600" /> : <Copy className="w-4 h-4" />}
          {copiedKey === opts.key ? 'Copied' : 'Copy email'}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Subject</span>
        {isEditMode ? (
          <input
            type="text"
            value={opts.subject}
            onChange={(e) => opts.onSubject(e.target.value)}
            className={`${FIELD_BOX} focus:border-navy-400 focus:outline-none`}
          />
        ) : (
          <div className={FIELD_BOX}>{opts.subject}</div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Body</span>
        {isEditMode ? (
          <textarea
            value={opts.body}
            onChange={(e) => opts.onBody(e.target.value)}
            rows={11}
            className={`${FIELD_BOX} resize-none leading-relaxed focus:border-navy-400 focus:outline-none`}
          />
        ) : (
          <div className={`${FIELD_BOX} whitespace-pre-wrap leading-relaxed`}>{opts.body}</div>
        )}
      </div>
    </div>
  );

  return (
    <>
    {/* Toolbar: portal to tab bar on desktop, inline on mobile */}
    {toolbarPortal && createPortal(toolbarContent, toolbarPortal)}

    <div className="h-full flex flex-col bg-cream-100">
      {/* Inline toolbar for mobile only (no portal) */}
      {!toolbarPortal && (
        <div className="px-3 sm:px-5 py-2.5 bg-cream-100 border-b border-cream-200 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {toolbarContent}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-5 pb-6 pt-5">
        {activeEmail ? renderCard({
          key: 'primary',
          title: 'Application email',
          subject: activeEmail.subject || '',
          body: activeEmail.body || '',
          onSubject: (v) => updateEmailField('subject', v),
          onBody: (v) => updateEmailField('body', v),
          copyEvent: 'email',
        }) : (
          <KitDocumentError variant="card" title="We couldn't write the application email" target="email" />
        )}
        {followUpFailed && !activeFollowUp && (
          <KitDocumentError variant="card" title="We couldn't write the follow-up email" target="follow-up" />
        )}
        {activeFollowUp && renderCard({
          key: 'follow-up',
          title: 'Follow-up email',
          chip: `Send after ${followUpDelay} to ${followUpDelay + 2} business days`,
          subject: activeFollowUp.subject,
          body: activeFollowUp.body,
          onSubject: (v) => updateFollowUpField('subject', v),
          onBody: (v) => updateFollowUpField('body', v),
          copyEvent: 'follow_up_email',
        })}
      </div>
    </div>
    </>
  );
}

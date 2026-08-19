'use client';

import { FileText, Mail, Send, Shield, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { JobBoardPanel } from '@/components/JobBoardPanel';
import { TrackerPanel } from '@/components/TrackerPanel';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';

type ApplicationTab = 'cv' | 'cover-letter' | 'email';

interface CanvasColumnProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  toolbarNode: HTMLDivElement | null;
  setToolbarNode: (node: HTMLDivElement | null) => void;
  onOpenAts: () => void;
}

const TABS: { id: ApplicationTab; label: string; icon: typeof FileText }[] = [
  { id: 'cv', label: 'CV', icon: FileText },
  { id: 'cover-letter', label: 'Cover letter', icon: Mail },
  { id: 'email', label: 'Emails', icon: Send },
];

export function CanvasColumn({
  collapsed,
  onToggleCollapsed,
  toolbarNode,
  setToolbarNode,
  onOpenAts,
}: CanvasColumnProps) {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  const agentWorkflowPhase = useUIStore((s) => s.agentWorkflowPhase);
  const currentSession = useSessionStore((s) => s.currentSession);

  const isKit = activeTab === 'cv' || activeTab === 'cover-letter' || activeTab === 'email';
  const atsScore = currentSession?.optimizedCVData?.analysis?.ats_compatibility ?? null;
  const hasATSInsights = Boolean(
    currentSession?.optimizedCVData?.analysis || currentSession?.generatedCV?.changes?.length,
  );

  const bannerText = (() => {
    if (!isAgentWorking) return null;
    if (agentWorkflowPhase === 'fit_analysis') {
      return 'Checking your fit. The verdict will land in the conversation.';
    }
    if (activeTab === 'cover-letter') {
      return 'Writing your cover letter. It will land in this tab.';
    }
    if (activeTab === 'email') {
      return 'Drafting your emails. They will land in this tab.';
    }
    return 'Building your kit. The tailored CV will land in this tab.';
  })();

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-shrink-0 flex-col items-center border-l border-cream-200 bg-cream-100 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-lg p-1.5 text-warm-gray hover:bg-cream-50 hover:text-navy-700 cursor-pointer"
          aria-label="Expand canvas"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-cream-100">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream-200 bg-cream-50 p-1 text-warm-gray shadow-sm hover:text-navy-700 cursor-pointer"
        aria-label="Collapse canvas"
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>

      {isKit && (
        <>
          <div className="flex items-center gap-3 border-b border-cream-200 px-5 py-3">
            <div className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 p-0.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const on = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm cursor-pointer ${
                      on
                        ? 'bg-white font-semibold text-navy-800 shadow-sm'
                        : 'font-medium text-warm-gray hover:text-navy-700'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${on ? 'text-gold-500' : ''}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="flex-1" />
            {(atsScore !== null || hasATSInsights) && (
              <button
                type="button"
                onClick={onOpenAts}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#EEF4F1] px-3 text-[13px] font-semibold text-[#3A5A4C] cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5" />
                {atsScore !== null ? `ATS ${atsScore}%` : 'ATS insights'}
                <span className="font-medium opacity-80">· see every change</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto border-b border-cream-200 px-5 py-2.5">
            <div ref={setToolbarNode} className="flex items-center gap-2" />
          </div>
        </>
      )}

      {bannerText && (
        <div className="border-b border-gold-200 bg-gold-50 px-5 py-2 text-[13px] font-medium text-gold-700">
          {bannerText}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'tracker' ? (
          <TrackerPanel />
        ) : activeTab === 'jobs' ? (
          <JobBoardPanel />
        ) : activeTab === 'cover-letter' ? (
          <CoverLetterPanel toolbarPortal={toolbarNode} />
        ) : activeTab === 'email' ? (
          <EmailPanel toolbarPortal={toolbarNode} />
        ) : (
          <CVPanel toolbarPortal={toolbarNode} />
        )}
      </div>
    </section>
  );
}

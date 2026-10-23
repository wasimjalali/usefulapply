'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { FileText, Mail, Send, Sparkles, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { FeedCanvas } from '@/components/job-feed/FeedCanvas';
import { TrackerCanvas } from '@/components/tracker/TrackerCanvas';
import { AnswersPanel } from '@/components/kit/AnswersPanel';
import { ATSChangesView } from '@/components/kit/ATSChangesView';
import { KitDownloadAll } from '@/components/kit/KitDownloadAll';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore, type KitTab } from '@/store/useUIStore';
import { RAIL_WIDTH, SIDEBAR_WIDTH } from '@/components/shell/dimensions';

interface CanvasColumnProps {
  collapsed: boolean;
  /** Compact (see COMPACT_MAX_WIDTH), the canvas and the conversation take turns for the row. */
  compact: boolean;
  onToggleCollapsed: (event: MouseEvent<HTMLButtonElement>) => void;
  toolbarNode: HTMLDivElement | null;
  setToolbarNode: (node: HTMLDivElement | null) => void;
}

const TABS: { id: KitTab; label: string; icon: typeof FileText }[] = [
  { id: 'cv', label: 'CV', icon: FileText },
  { id: 'cover-letter', label: 'Cover letter', icon: Mail },
  { id: 'email', label: 'Emails', icon: Send },
];

const TAB_LABEL: Record<KitTab, string> = {
  cv: 'CV',
  'cover-letter': 'Cover letter',
  email: 'Emails',
  answers: 'Answers',
};

export function CanvasColumn({
  collapsed,
  compact,
  onToggleCollapsed,
  toolbarNode,
  setToolbarNode,
}: CanvasColumnProps) {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  const agentWorkflowPhase = useUIStore((s) => s.agentWorkflowPhase);
  const regenStage = useUIStore((s) => s.regenStage);
  const currentSession = useSessionStore((s) => s.currentSession);
  const [headerNode, setHeaderNode] = useState<HTMLDivElement | null>(null);
  // The ATS view belongs to one CV: it is open only while this session id matches.
  const [atsViewSessionId, setAtsViewSessionId] = useState<string | null>(null);

  const isKit = activeTab === 'cv' || activeTab === 'cover-letter' || activeTab === 'email' || activeTab === 'answers';
  const answersCount = currentSession?.screeningAnswers?.length ?? 0;

  // The Answers tab exists only once the first answer does. If the session
  // changes to one without answers while it is open, fall back to the CV.
  useEffect(() => {
    if (activeTab === 'answers' && answersCount === 0) setActiveTab('cv');
  }, [activeTab, answersCount, setActiveTab]);

  const showAtsView = Boolean(currentSession?.id) && atsViewSessionId === currentSession?.id && activeTab === 'cv';

  // A tab click always shows that tab's document; the ATS view is left via Back or a tab.
  const selectTab = (tab: KitTab) => {
    setAtsViewSessionId(null);
    setActiveTab(tab);
  };

  const bannerText = (() => {
    if (activeTab === 'jobs' || activeTab === 'tracker') return null;
    if (regenStage) {
      return `${regenStage.title}. It will land in the ${TAB_LABEL[regenStage.tab]} tab.`;
    }
    if (!isAgentWorking) return null;
    if (agentWorkflowPhase === 'fit_analysis') {
      return currentSession?.company
        ? `Checking fit for ${currentSession.company}. Your CV stays here. The score lands in the chat.`
        : 'Checking your fit. Your CV stays here. The score lands in the chat.';
    }
    if (activeTab === 'cover-letter') {
      return 'Writing your cover letter. It will land in this tab.';
    }
    if (activeTab === 'email') {
      return 'Drafting your emails. They will land in this tab.';
    }
    return 'Building your kit. The tailored CV will land in this tab.';
  })();

  // Compact, this rail is the only way back and it mirrors the
  // conversation's rail, so its toggle sits at the top like that one.
  const railLabel = compact ? 'Show the canvas' : 'Expand canvas';
  const rail = collapsed && (
    /* Otherwise the toggle lives at the bottom right in both states, so it
       never jumps when the canvas opens or closes. */
    <div
      style={{ width: RAIL_WIDTH }}
      className={`flex h-full flex-shrink-0 flex-col items-center border-l border-cream-200 bg-cream-100 ${
        compact ? 'justify-start py-3' : 'justify-end py-4'
      }`}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="rounded-full border border-cream-200 bg-cream-50 p-1.5 text-warm-gray shadow-sm hover:text-navy-700 cursor-pointer"
        aria-label={railLabel}
        title={railLabel}
        data-shell-toggle="canvas"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
    </div>
  );

  // Not compact, the folded canvas unmounts as it always has: it would come
  // back at a different width from the one it was laid out at, and the CV
  // would rescale a frame late.
  if (collapsed && !compact) return rail;

  return (
    <>
      {rail}
      <section
        // Compact, the folded canvas stays mounted behind its rail, out of
        // sight and inert, at the width it shows at (the row less the sidebar
        // and the conversation's rail), so an unsaved edit on it survives a
        // trip to the chat, as the chat's own draft does the other way.
        inert={collapsed}
        data-shell-column="canvas"
        style={collapsed ? { left: SIDEBAR_WIDTH + RAIL_WIDTH } : undefined}
        className={`flex min-w-0 flex-col bg-cream-100 ${
          collapsed ? 'pointer-events-none absolute inset-y-0 right-0 opacity-0' : 'relative flex-1'
        }`}
      >
        {/* Compact, the conversation's rail already switches the view, and a
            second control for the same move is noise. */}
        {!compact && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="absolute bottom-4 right-4 z-20 rounded-full border border-cream-200 bg-cream-50 p-1.5 text-warm-gray shadow-sm hover:text-navy-700 cursor-pointer"
            aria-label="Collapse canvas"
            data-shell-toggle="canvas"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}

        {isKit && (
          <>
            {/* At tablet width the tabs and Download all only just fit, and an Answers tab tips them over: labels
                never break, Download all wraps to its own line instead. */}
            <div className="flex flex-wrap items-center gap-3 border-b border-cream-200 px-5 py-3">
              <div className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 p-0.5" role="tablist">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const on = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => selectTab(tab.id)}
                      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm cursor-pointer ${
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
                {answersCount > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'answers'}
                    onClick={() => selectTab('answers')}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm cursor-pointer ${
                      activeTab === 'answers'
                        ? 'bg-white font-semibold text-navy-800 shadow-sm'
                        : 'font-medium text-warm-gray hover:text-navy-700'
                    }`}
                  >
                    <Sparkles className={`h-4 w-4 ${activeTab === 'answers' ? 'text-gold-500' : ''}`} />
                    Answers
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-100 px-1.5 text-[10px] font-bold text-gold-700">
                      {answersCount}
                    </span>
                  </button>
                )}
              </div>
              {/* ml-auto rather than a spacer, so it keeps to the right on its own line too. */}
              <div className="ml-auto">
                <KitDownloadAll />
              </div>
            </div>

            {/* Per-tab rows. Panels portal their controls in; hidden (not unmounted)
                while the ATS view covers the CV so edit state survives. */}
            <div className={showAtsView ? 'hidden' : 'contents'}>
              {activeTab === 'cv' && currentSession?.generatedCV && (
                <div className="flex items-center gap-3 border-b border-cream-200 px-5 py-2.5">
                  <div ref={setHeaderNode} className="@container flex min-w-0 flex-1 items-center gap-3" />
                </div>
              )}
              <div className="flex items-center gap-2 border-b border-cream-200 px-5 py-2.5">
                {/* Wraps rather than scrolls, so every control stays in sight at any canvas width. A container,
                    so panels can tighten labels against the row's own width (CVPanel's downloads). */}
                <div ref={setToolbarNode} className="@container flex min-w-0 flex-1 flex-wrap items-center gap-2" />
              </div>
            </div>
          </>
        )}

        {bannerText && (
          <div className="border-b border-gold-200 bg-gold-50 px-5 py-2 text-[13px] font-medium text-gold-700">
            {bannerText}
          </div>
        )}

        {activeTab === 'jobs' ? (
          /* The feed canvas owns its own header, pills and scrolling. */
          <div className="min-h-0 flex-1">
            <FeedCanvas />
          </div>
        ) : activeTab === 'tracker' ? (
          /* The tracker table owns its own header, pills and scrolling. */
          <div className="min-h-0 flex-1">
            <TrackerCanvas />
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {activeTab === 'cover-letter' ? (
            <CoverLetterPanel toolbarPortal={toolbarNode} />
          ) : activeTab === 'email' ? (
            <EmailPanel toolbarPortal={toolbarNode} />
          ) : activeTab === 'answers' ? (
            <AnswersPanel toolbarPortal={toolbarNode} />
          ) : (
            <>
              {showAtsView && <ATSChangesView onBack={() => setAtsViewSessionId(null)} />}
              <div className={showAtsView ? 'hidden' : 'h-full'}>
                <CVPanel
                  toolbarPortal={toolbarNode}
                  headerPortal={headerNode}
                  atsOpen={showAtsView}
                  onOpenAts={() => setAtsViewSessionId(currentSession?.id ?? null)}
                />
              </div>
            </>
          )}
        </div>
        )}
      </section>
    </>
  );
}

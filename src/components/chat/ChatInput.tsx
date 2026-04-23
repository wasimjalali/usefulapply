'use client';

import { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { Send, Square, Search, Zap, FileText, RotateCcw, ClipboardList, X } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled?: boolean;
  isWorking?: boolean;
  placeholder?: string;
  applicationMode?: 'analyze_first' | 'apply_directly';
  onModeChange?: (mode: 'analyze_first' | 'apply_directly') => void;
  showModeSelector?: boolean;
  /** Show prominent CTA buttons after fit analysis completes */
  pendingFitAnalysis?: boolean;
  onFitAnalysisAction?: (action: 'apply' | 'skip') => void;
  /** When true, renders a compact input (less padding, no mode selector) — used when chat has messages */
  compact?: boolean;
  /** Show screening question CTA buttons after application generation */
  pendingScreeningPrompt?: boolean;
  onScreeningAction?: (action: 'screening' | 'skip') => void;
  /** Embedded composer style for docked desktop panels */
  surface?: 'floating' | 'embedded';
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isWorking = false,
  placeholder = "Type a message...",
  applicationMode = 'apply_directly',
  onModeChange,
  showModeSelector = false,
  pendingFitAnalysis = false,
  onFitAnalysisAction,
  compact = false,
  pendingScreeningPrompt = false,
  onScreeningAction,
  surface = 'floating',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hoveredMode, setHoveredMode] = useState<string | null>(null);

  // Auto-resize textarea on value / compact changes
  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [value, compact]);

  // Recalculate height when the textarea width changes (parent panel expand transition).
  // The chat container uses transition-[width] duration-200, so when expanding from
  // collapsed the width animates from 48px → 440px. Without this, scrollHeight is
  // measured at the narrow width on mount and never corrected.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let prevWidth = textarea.getBoundingClientRect().width;
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const w = textarea.getBoundingClientRect().width;
        if (w !== prevWidth) {
          prevWidth = w;
          textarea.style.height = 'auto';
          textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
      });
    });
    ro.observe(textarea);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isEmbedded = surface === 'embedded';

  return (
    <div className={`${isEmbedded ? 'p-0 bg-transparent' : `${compact ? 'p-2' : 'p-4'} bg-gradient-to-t from-cream-100/80 to-transparent backdrop-blur-sm`}`}>
      <div className="relative">
        {/* Hover tooltips - rendered OUTSIDE the overflow-hidden container */}
        {hoveredMode === 'apply_directly' && showModeSelector && !compact && !pendingFitAnalysis && !value.trim() && !isWorking && (
          <div className="absolute bottom-full left-3 mb-1 w-60 bg-navy-700 text-white text-xs rounded-xl p-3.5 shadow-xl z-50">
            <div className="font-semibold mb-1">Apply Directly</div>
            <p className="text-navy-200 leading-relaxed">Skips fit analysis and generates your optimized CV, cover letter, and email immediately.</p>
            <p className="text-navy-300 mt-1.5 italic">Best when you&apos;ve already read the job description and it matches your qualifications.</p>
            <div className="mt-2 text-gold-400 font-medium">2 credits</div>
            <div className="absolute top-full left-6 w-2.5 h-2.5 bg-navy-700 rotate-45 -mt-1.5" />
          </div>
        )}
        {hoveredMode === 'analyze_first' && showModeSelector && !compact && !pendingFitAnalysis && !value.trim() && !isWorking && (
          <div className="absolute bottom-full left-24 mb-1 w-60 bg-navy-700 text-white text-xs rounded-xl p-3.5 shadow-xl z-50">
            <div className="font-semibold mb-1">Analyze First</div>
            <p className="text-navy-200 leading-relaxed">Runs a fit analysis to show your match score and skill gaps before generating the full application.</p>
            <p className="text-navy-300 mt-1.5 italic">Best when you haven&apos;t read the job description yet and want AI to evaluate the fit for you first.</p>
            <div className="mt-2 text-gold-400 font-medium">0.5 credits (analysis) + 2 credits (application)</div>
            <div className="absolute top-full left-6 w-2.5 h-2.5 bg-navy-700 rotate-45 -mt-1.5" />
          </div>
        )}

        {/* Post-analysis suggested actions — replaces mode selector when fit analysis is complete */}
        {pendingFitAnalysis && !isWorking && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => onFitAnalysisAction?.('apply')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-gradient-to-r from-navy-600 to-navy-700 text-white rounded-xl hover:from-navy-700 hover:to-navy-800 transition-all shadow-md hover:shadow-lg cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Apply for This Job
            </button>
            <button
              onClick={() => onFitAnalysisAction?.('skip')}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-white text-charcoal border border-cream-300 rounded-xl hover:bg-cream-50 hover:border-gold-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-warm-gray" />
              New Search
            </button>
          </div>
        )}

        {/* Screening question CTA — shown after application generation */}
        {pendingScreeningPrompt && !isWorking && !pendingFitAnalysis && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => onScreeningAction?.('screening')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-gradient-to-r from-navy-600 to-navy-700 text-white rounded-xl hover:from-navy-700 hover:to-navy-800 transition-all shadow-md hover:shadow-lg cursor-pointer"
            >
              <ClipboardList className="w-4 h-4" />
              Screening Questions
            </button>
            <button
              onClick={() => onScreeningAction?.('skip')}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-white text-charcoal border border-cream-300 rounded-xl hover:bg-cream-50 hover:border-gold-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <X className="w-4 h-4 text-warm-gray" />
              No, Thanks
            </button>
          </div>
        )}

        {/* Main input container with gold border */}
        <div
          id="tour-mode-selector"
          className={`relative overflow-hidden transition-all duration-200 ${
            isEmbedded
              ? `rounded-[24px] border bg-white shadow-[0_18px_34px_-28px_rgba(30,58,95,0.35)] ${
                  isWorking
                    ? 'border-gold-400'
                    : 'border-cream-200 focus-within:border-gold-300'
                }`
              : `glass-input ${compact ? 'rounded-2xl' : 'rounded-3xl'} border-2 shadow-lg ${
                  isWorking
                    ? 'border-gold-400 shadow-gold-200/50'
                    : 'border-gold-300/60 shadow-gold-100/40 focus-within:border-gold-400 focus-within:shadow-gold-200/50'
                }`
          }`}
        >

          <div className="relative flex flex-col">
            {/* Mode selector - inside input, hidden when typing or when fit analysis is pending */}
            {showModeSelector && !compact && !pendingFitAnalysis && !value.trim() && !isWorking && (
              <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
                <button
                  onClick={() => onModeChange?.('apply_directly')}
                  onMouseEnter={() => setHoveredMode('apply_directly')}
                  onMouseLeave={() => setHoveredMode(null)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    applicationMode === 'apply_directly'
                      ? 'bg-navy-600 text-white'
                      : 'bg-cream-100 text-warm-gray hover:bg-cream-200'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  Apply Directly
                </button>
                <button
                  onClick={() => onModeChange?.('analyze_first')}
                  onMouseEnter={() => setHoveredMode('analyze_first')}
                  onMouseLeave={() => setHoveredMode(null)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    applicationMode === 'analyze_first'
                      ? 'bg-navy-600 text-white'
                      : 'bg-cream-100 text-warm-gray hover:bg-cream-200'
                  }`}
                >
                  <Search className="w-3 h-3" />
                  Analyze First
                </button>
              </div>
            )}

            {/* Input row */}
            <div className={`flex items-end gap-2 ${compact ? 'p-2' : 'p-3'}`}>
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={disabled || isWorking}
                  className="chat-input-textarea w-full px-1 py-1 text-sm bg-transparent focus:outline-none focus:ring-0 border-none resize-none disabled:opacity-50 placeholder:text-warm-gray min-h-[24px] max-h-[150px]"
                  rows={1}
                />
              </div>

              {/* Send/Stop button - circular with gradient */}
              {isWorking ? (
                <button
                  onClick={onStop}
                  title="Stop generation"
                  aria-label="Stop generation"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 hover:from-gold-500 hover:to-gold-600 flex items-center justify-center shadow-md transition-all duration-200 hover:shadow-lg animate-pulse cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-white fill-white" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!value.trim() || disabled}
                  title="Send message"
                  aria-label="Send message"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 hover:from-gold-500 hover:to-gold-600 disabled:from-cream-300 disabled:to-cream-400 disabled:cursor-not-allowed flex items-center justify-center shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 disabled:hover:scale-100"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard hint */}
        {!compact && !isEmbedded && (
          <p className="text-[10px] text-warm-gray/60 text-center mt-2">
            Shift + Enter for new line
          </p>
        )}
      </div>
    </div>
  );
}

'use client';

import { useRef, useEffect, useState } from 'react';
import { Send, Square, AlertTriangle, Search, Zap } from 'lucide-react';

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
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isWorking = false,
  placeholder = "Type a message...",
  applicationMode = 'analyze_first',
  onModeChange,
  showModeSelector = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hoveredMode, setHoveredMode] = useState<string | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 bg-gradient-to-t from-cream-100 to-cream-50">
      <div className="relative">
        {/* Hover tooltips - rendered OUTSIDE the overflow-hidden container */}
        {hoveredMode === 'analyze_first' && showModeSelector && !value.trim() && !isWorking && (
          <div className="absolute bottom-full left-3 mb-1 w-60 bg-navy-700 text-white text-xs rounded-xl p-3.5 shadow-xl z-50">
            <div className="font-semibold mb-1">Analyze First</div>
            <p className="text-navy-200 leading-relaxed">Runs a fit analysis to show your match score and skill gaps before generating the full application.</p>
            <p className="text-navy-300 mt-1.5 italic">Best when you haven&apos;t read the job description yet and want AI to evaluate the fit for you first.</p>
            <div className="mt-2 text-gold-400 font-medium">0.5 credits (analysis) + 1.5 credits (application)</div>
            <div className="absolute top-full left-6 w-2.5 h-2.5 bg-navy-700 rotate-45 -mt-1.5" />
          </div>
        )}
        {hoveredMode === 'apply_directly' && showModeSelector && !value.trim() && !isWorking && (
          <div className="absolute bottom-full left-24 mb-1 w-60 bg-navy-700 text-white text-xs rounded-xl p-3.5 shadow-xl z-50">
            <div className="font-semibold mb-1">Apply Directly</div>
            <p className="text-navy-200 leading-relaxed">Skips fit analysis and generates your optimized CV, cover letter, and email immediately.</p>
            <p className="text-navy-300 mt-1.5 italic">Best when you&apos;ve already read the job description and it matches your qualifications.</p>
            <div className="mt-2 text-gold-400 font-medium">1.5 credits</div>
            <div className="absolute top-full left-6 w-2.5 h-2.5 bg-navy-700 rotate-45 -mt-1.5" />
          </div>
        )}

        {/* Main input container with gold border */}
        <div className={`relative bg-white rounded-2xl border-2 shadow-lg overflow-hidden transition-all duration-200 ${
          isWorking 
            ? 'border-gold-400 shadow-gold-200/50' 
            : 'border-gold-300/60 shadow-gold-100/40 focus-within:border-gold-400 focus-within:shadow-gold-200/50'
        }`}>
          
          <div className="relative flex flex-col">
            {/* Mode selector - inside input, hidden when typing */}
            {showModeSelector && !value.trim() && !isWorking && (
              <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
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
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 p-3">
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
        
        {/* Bottom info bar - AI warning */}
        <div className="flex items-center justify-center mt-3 gap-1.5">
          <AlertTriangle className="w-3 h-3 text-warm-gray" />
          <p className="text-xs text-warm-gray">
            AI can make mistakes. Please verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}

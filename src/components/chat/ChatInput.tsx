'use client';

import { useRef, useLayoutEffect, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled?: boolean;
  isWorking?: boolean;
  placeholder?: string;
  /** When true, renders a compact input (less padding) — used when chat has messages */
  compact?: boolean;
  /** Embedded composer style for docked desktop panels */
  surface?: 'floating' | 'embedded';
  /** Monotonic counter — focuses the textarea whenever it changes (see useUIStore.jdFocusRequest) */
  focusSignal?: number;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isWorking = false,
  placeholder = "Type a message...",
  compact = false,
  surface = 'floating',
  focusSignal = 0,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Seeded from the current value so a remount with an already-incremented
  // signal does not steal focus without the user asking for it.
  const handledFocusSignalRef = useRef(focusSignal);
  useEffect(() => {
    if (focusSignal === handledFocusSignalRef.current) return;
    handledFocusSignalRef.current = focusSignal;
    textareaRef.current?.focus();
  }, [focusSignal]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [value, compact]);

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
  const inputShellClassName = isEmbedded
    ? `relative rounded-2xl border bg-white transition-all duration-200 ${
        isWorking
          ? 'border-gold-400 shadow-sm'
          : 'border-cream-200 shadow-sm focus-within:border-gold-300'
      }`
    : `relative glass-input rounded-2xl border-2 shadow-md overflow-hidden transition-all duration-200 ${
        isWorking
          ? 'border-gold-400 shadow-gold-200/50'
          : 'border-gold-300/60 shadow-gold-100/40 focus-within:border-gold-400 focus-within:shadow-gold-200/50'
      }`;

  return (
    <div className={`${isEmbedded ? 'p-0 bg-transparent' : `${compact ? 'p-2' : 'p-4'} bg-cream-50`}`}>
      <div className="relative">
        <div id="tour-mode-selector" className={isEmbedded ? 'space-y-2' : ''}>
          <div className={inputShellClassName}>
            <div className={`flex items-end gap-2 ${isEmbedded ? 'p-3' : compact ? 'p-2' : 'p-3'}`}>
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

              {isWorking ? (
                <button
                  onClick={onStop}
                  title="Stop generation"
                  aria-label="Stop generation"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gold-400 hover:bg-gold-500 flex items-center justify-center shadow-sm transition-colors duration-200 animate-pulse cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-navy-900 fill-current" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!value.trim() || disabled}
                  title="Send message"
                  aria-label="Send message"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gold-400 hover:bg-gold-500 disabled:bg-cream-200 disabled:text-warm-gray disabled:cursor-not-allowed flex items-center justify-center shadow-sm transition-colors duration-200 cursor-pointer"
                >
                  <Send className={`w-4 h-4 ${!value.trim() || disabled ? 'text-warm-gray' : 'text-navy-900'}`} />
                </button>
              )}
            </div>
          </div>
        </div>

        {!compact && !isEmbedded && (
          <p className="text-[10px] text-warm-gray/60 text-center mt-2">
            Shift + Enter for new line
          </p>
        )}
      </div>
    </div>
  );
}

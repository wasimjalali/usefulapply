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
    // preventScroll: see the note on the hero textarea in ChatPanel.
    textareaRef.current?.focus({ preventScroll: true });
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
    ? `relative rounded-card border bg-surface-raised transition-all duration-(--duration-base) ${
        isWorking
          ? 'border-accent shadow-resting'
          : 'border-border shadow-resting focus-within:border-border-accent'
      }`
    : `relative rounded-card border bg-surface-raised shadow-resting overflow-hidden transition-all duration-(--duration-base) ${
        isWorking
          ? 'border-accent'
          : 'border-border-accent focus-within:border-accent'
      }`;

  return (
    <div className={`${isEmbedded ? 'p-0 bg-transparent' : `${compact ? 'p-2' : 'p-4'} bg-surface`}`}>
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
                  className="chat-input-textarea w-full px-1 py-1 text-sm bg-transparent focus:outline-none focus:ring-0 border-none resize-none disabled:opacity-50 placeholder:text-ink-muted min-h-[24px] max-h-[150px]"
                  rows={1}
                />
              </div>

              {isWorking ? (
                <button
                  onClick={onStop}
                  title="Stop generation"
                  aria-label="Stop generation"
                  className="flex-shrink-0 w-9 h-9 rounded-pill bg-accent hover:bg-accent-strong flex items-center justify-center shadow-resting transition-colors duration-(--duration-base) animate-pulse cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-accent-ink fill-current" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!value.trim() || disabled}
                  title="Send message"
                  aria-label="Send message"
                  className="flex-shrink-0 w-9 h-9 rounded-pill bg-accent hover:bg-accent-strong disabled:bg-sunken disabled:text-ink-muted disabled:cursor-not-allowed flex items-center justify-center shadow-resting transition-colors duration-(--duration-base) cursor-pointer"
                >
                  <Send className={`w-4 h-4 ${!value.trim() || disabled ? 'text-ink-muted' : 'text-accent-ink'}`} />
                </button>
              )}
            </div>
          </div>
        </div>

        {!compact && !isEmbedded && (
          <p className="text-[10px] text-ink-muted/60 text-center mt-2">
            Shift + Enter for new line
          </p>
        )}
      </div>
    </div>
  );
}

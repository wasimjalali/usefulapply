'use client';

import { useRef, useEffect } from 'react';
import { Send, Square, AlertTriangle } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled?: boolean;
  isWorking?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isWorking = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        {/* Main input container with gold border */}
        <div className={`relative bg-white rounded-2xl border-2 shadow-lg overflow-hidden transition-all duration-200 ${
          isWorking 
            ? 'border-gold-400 shadow-gold-200/50' 
            : 'border-gold-300/60 shadow-gold-100/40 focus-within:border-gold-400 focus-within:shadow-gold-200/50'
        }`}>
          
          <div className="relative flex flex-col">
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

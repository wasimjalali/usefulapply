'use client';

import { useState, useEffect, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';

interface FeedbackModalProps {
  type: 'positive' | 'negative';
  onSubmit: (feedbackText: string) => void;
  onCancel: () => void;
  isSuccess?: boolean;
}

export function FeedbackModal({ type, onSubmit, onCancel, isSuccess = false }: FeedbackModalProps) {
  const [feedbackText, setFeedbackText] = useState('');

  const handleSubmit = () => {
    onSubmit(feedbackText);
  };

  // Escape key handler for accessibility
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  }, [onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Submit feedback">
      <div className="bg-surface-raised rounded-card shadow-floating max-w-md w-full overflow-hidden">
        {/* Modal Header */}
        <div className={`px-6 py-4 ${type === 'positive' ? 'bg-accent-soft' : 'bg-danger-soft'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-pill ${type === 'positive' ? 'bg-accent-soft-strong' : 'bg-danger-soft-strong'}`}>
              {type === 'positive' 
                ? <ThumbsUp className="w-5 h-5 text-ink-accent" />
                : <ThumbsDown className="w-5 h-5 text-danger-bright" />
              }
            </div>
            <div>
              <h3 className="font-semibold text-ink-body">
                {type === 'positive' ? 'What did you like?' : 'What could be improved?'}
              </h3>
              <p className="text-sm text-ink-muted">Your feedback helps us improve</p>
            </div>
          </div>
        </div>
        
        {/* Modal Body */}
        {isSuccess ? (
          <div className="px-6 py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-accent-soft-strong rounded-pill flex items-center justify-center">
              <Check className="w-8 h-8 text-ink-accent" />
            </div>
            <h3 className="text-lg font-semibold text-ink-body mb-2">Thank you!</h3>
            <p className="text-sm text-ink-muted">Your feedback has been submitted successfully.</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={type === 'positive' 
                  ? "Tell us what was helpful about this response..." 
                  : "Tell us how we can make this better..."
                }
                className="w-full h-32 px-4 py-3 text-sm border border-border rounded-control focus:outline-none focus:border-accent resize-none placeholder:text-ink-muted transition-colors"
                autoFocus
              />
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 bg-surface flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink-body transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2 text-sm font-medium bg-accent text-accent-ink rounded-control hover:bg-accent-strong shadow-elevated transition-all"
              >
                Submit Feedback
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

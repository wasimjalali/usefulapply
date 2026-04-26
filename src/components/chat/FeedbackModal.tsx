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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Submit feedback">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        {/* Modal Header */}
        <div className={`px-6 py-4 ${type === 'positive' ? 'bg-gold-50' : 'bg-red-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${type === 'positive' ? 'bg-gold-100' : 'bg-red-100'}`}>
              {type === 'positive' 
                ? <ThumbsUp className="w-5 h-5 text-gold-600" />
                : <ThumbsDown className="w-5 h-5 text-red-500" />
              }
            </div>
            <div>
              <h3 className="font-semibold text-charcoal">
                {type === 'positive' ? 'What did you like?' : 'What could be improved?'}
              </h3>
              <p className="text-sm text-warm-gray">Your feedback helps us improve</p>
            </div>
          </div>
        </div>
        
        {/* Modal Body */}
        {isSuccess ? (
          <div className="px-6 py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gold-100 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-gold-600" />
            </div>
            <h3 className="text-lg font-semibold text-charcoal mb-2">Thank you!</h3>
            <p className="text-sm text-warm-gray">Your feedback has been submitted successfully.</p>
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
                className="w-full h-32 px-4 py-3 text-sm border border-cream-200 rounded-lg focus:outline-none focus:border-gold-400 resize-none placeholder:text-warm-gray transition-colors"
                autoFocus
              />
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 bg-cream-50 flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-warm-gray hover:text-charcoal transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2 text-sm font-medium bg-gold-400 text-white rounded-lg hover:bg-gold-500 shadow-md transition-all"
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

'use client';

import { useState } from 'react';
import { Card } from '../ui/Card';
import { MarkdownText } from '../MarkdownText';
import {
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  User,
  Sparkles,
  FileText,
  Mail,
  Send,
  Plus,
} from 'lucide-react';

export interface ChatAction {
  label: string;
  action: string;
  icon?: 'cv' | 'cover-letter' | 'email' | 'new';
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

interface ChatMessageProps {
  message: ChatMessageData;
  onAction: (action: string) => void;
  onFeedback: (messageId: string, content: string, type: 'positive' | 'negative') => void;
  feedback?: 'positive' | 'negative';
  collapseLength?: number;
}

export function ChatMessage({ 
  message, 
  onAction, 
  onFeedback,
  feedback,
  collapseLength = 300,
}: ChatMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-2 text-sm text-warm-gray w-full justify-center py-2">
        {message.content}
      </div>
    );
  }

  const isLongMessage = message.role === 'user' && message.content.length > collapseLength;

  return (
    <div className="flex gap-3">
      <div className={`rounded-xl h-fit flex-shrink-0 ${
        message.role === 'user' ? 'p-2 bg-cream-200' : 'p-2 bg-gradient-to-br from-navy-600 to-navy-700 shadow-sm'
      }`}>
        {message.role === 'user' 
          ? <User className="w-4 h-4 text-charcoal" />
          : <Sparkles className="w-4 h-4 text-gold-400" />
        }
      </div>
      
      <div className="flex-1 min-w-0">
        <Card 
          padding="sm" 
          className={`relative ${message.role === 'user' 
            ? 'bg-cream-100 border-cream-200' 
            : 'bg-white border-cream-200 shadow-sm'
          }`}
        >
          {/* Collapsible content for long user messages */}
          {isLongMessage ? (
            <div className="relative">
              <div className={`text-sm text-charcoal overflow-hidden transition-all duration-300 ${
                isExpanded ? '' : 'max-h-24'
              }`}>
                <MarkdownText 
                  content={message.content}
                  className="text-sm text-charcoal"
                />
              </div>
              {!isExpanded && (
                <div className="absolute bottom-6 left-0 right-0 h-12 bg-gradient-to-t from-cream-200 to-transparent pointer-events-none" />
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 mt-2 text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors cursor-pointer"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Show more
                  </>
                )}
              </button>
            </div>
          ) : (
            <MarkdownText 
              content={message.content}
              className="text-sm text-charcoal"
            />
          )}
          
          {/* Action Buttons */}
          {message.actions && message.actions.length > 0 && (
            <div className="mt-4 space-y-0">
              {message.actions
                .filter(action => action.action !== 'none')
                .map((action, index, filteredActions) => (
                <div key={index} className="flex items-stretch">
                  {/* Connecting line */}
                  <div className="flex flex-col items-center mr-3">
                    <div className={`w-px bg-cream-300 ${index === 0 ? 'h-2' : 'h-2'}`} />
                    <div className="w-2 h-2 rounded-full border-2 border-gold-300 bg-white flex-shrink-0" />
                    <div className={`w-px bg-cream-300 flex-1 ${index === filteredActions.length - 1 ? 'opacity-0' : ''}`} />
                  </div>
                  {/* Button */}
                  <button
                    onClick={() => onAction(action.action)}
                    className="flex items-center gap-2 px-4 py-2.5 my-1 text-sm font-medium bg-white text-charcoal border border-cream-200 rounded-xl hover:bg-cream-50 hover:border-gold-300 hover:shadow-sm transition-all cursor-pointer"
                  >
                    {action.icon === 'cv' && <FileText className="w-4 h-4 text-navy-600" />}
                    {action.icon === 'cover-letter' && <Mail className="w-4 h-4 text-gold-600" />}
                    {action.icon === 'email' && <Send className="w-4 h-4 text-sage-600" />}
                    {action.icon === 'new' && <Plus className="w-4 h-4 text-gold-500" />}
                    {action.label}
                  </button>
                </div>
              ))}
              {/* Render hint text (action === 'none') */}
              {message.actions.some(a => a.action === 'none') && (
                <p className="text-xs text-warm-gray mt-3 ml-5 italic">
                  {message.actions.find(a => a.action === 'none')?.label.replace(/^💡\s*/, '')}
                </p>
              )}
            </div>
          )}
        </Card>
        
        {/* Feedback icons for assistant messages */}
        {message.role === 'assistant' && (
          <div className="flex items-center gap-1 mt-2 ml-1">
            <button
              onClick={() => onFeedback(message.id, message.content, 'positive')}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                feedback === 'positive'
                  ? 'text-sage-600 bg-sage-100'
                  : 'text-warm-gray hover:text-charcoal hover:bg-cream-200'
              }`}
              title="Good response"
              aria-label="Good response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback(message.id, message.content, 'negative')}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                feedback === 'negative'
                  ? 'text-red-500 bg-red-50'
                  : 'text-warm-gray hover:text-charcoal hover:bg-cream-200'
              }`}
              title="Bad response"
              aria-label="Bad response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 text-warm-gray hover:text-charcoal hover:bg-cream-200 rounded transition-colors cursor-pointer"
              title="Copy message"
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-sage-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
        
        <p className="text-xs text-warm-gray mt-1.5 ml-1">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

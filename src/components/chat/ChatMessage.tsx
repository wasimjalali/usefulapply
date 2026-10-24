'use client';

import { useState } from 'react';
import { MarkdownText } from '../MarkdownText';
import {
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  User,
  FileText,
  Mail,
  Send,
  Plus,
  ClipboardList,
} from 'lucide-react';

import { BrandIcon } from '../BrandLogo';
import { NamedStages } from '@/components/shell/NamedStages';
import { parseScreeningAnswers } from '@/lib/screening-answers';

export interface ChatAction {
  label: string;
  action: string;
  icon?: 'cv' | 'cover-letter' | 'email' | 'new' | 'screening';
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
  layout?: 'classic' | 'spine';
  /** True when this application's Answers tab holds the screening answers. */
  answersInDoc?: boolean;
  /** A reply still being written: no feedback or copy yet, but their row keeps its space so nothing moves when it lands. */
  streaming?: boolean;
  /**
   * Whether this message's action chips show. ChatPanel shows them only under the newest reply, and only while no
   * other chip group is on screen: one group at a time, and sending a message clears every chip above it.
   */
  showActions?: boolean;
}

export function ChatMessage({ 
  message, 
  onAction, 
  onFeedback,
  feedback,
  collapseLength = 300,
  layout = 'classic',
  answersInDoc = false,
  streaming = false,
  showActions = true,
}: ChatMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAnswerIdx, setCopiedAnswerIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const screeningAnswers = message.role === 'assistant'
    ? parseScreeningAnswers(message.content)
    : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleCopyAnswer = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAnswerIdx(idx);
      setTimeout(() => setCopiedAnswerIdx(null), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleCopyAll = async () => {
    if (!screeningAnswers) return;
    const allText = screeningAnswers
      .map((a, i) => `${i + 1}. ${a.question}\n${a.answer}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(allText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
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
      <div className="flex items-center gap-2 text-sm text-ink-muted w-full justify-center py-2">
        {message.content}
      </div>
    );
  }

  const isLongMessage = message.role === 'user' && message.content.length > collapseLength;
  const actionItems = showActions
    ? (message.actions || []).filter(a => a.action !== 'none' && a.action !== 'stage-done')
    : [];
  const hintAction = message.actions?.find(a => a.action === 'none');
  // A finished named stage travels with the message so it survives reloads.
  const stageDone = message.actions?.find(a => a.action === 'stage-done');
  const isFitAnalysisMessage = message.role === 'assistant'
    && /\*\*(Strong Fit|Good Fit|Fair Fit|Weak Fit)\*\*/.test(message.content);
  const isCompletionMessage = message.role === 'assistant'
    && message.content.includes('**Application package ready**');
  const useElevatedSurface =
    message.role === 'user' ||
    !!screeningAnswers ||
    isFitAnalysisMessage ||
    isCompletionMessage ||
    actionItems.length > 0;
  const isSpine = layout === 'spine';
  // In the spine the answers live in the Answers tab; the chat keeps one line.
  // Older applications (answers only in the chat) keep the full blocks.
  const compactScreening = isSpine && !!screeningAnswers && answersInDoc;
  const surfaceClassName = message.role === 'user'
    ? isSpine
      ? 'rounded-card rounded-br-none border border-border bg-surface-raised px-3.5 py-3 shadow-resting'
      : 'rounded-card border border-border bg-canvas px-4 py-3 shadow-resting'
    : useElevatedSurface
      ? 'rounded-card border border-border bg-surface-raised px-4 py-3 shadow-resting'
      : 'px-1 py-1.5';

  if (isSpine && message.role === 'user') {
    return (
      <div className="group/msg flex justify-end">
        <div className={`max-w-[86%] ${surfaceClassName}`}>
          {isLongMessage ? (
            <div className="relative">
              <div className={`text-sm text-ink-body overflow-hidden ${isExpanded ? '' : 'max-h-24'}`}>
                <MarkdownText content={message.content} className="text-sm text-ink-body" />
              </div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 text-xs font-medium text-brand cursor-pointer"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            </div>
          ) : (
            <MarkdownText content={message.content} className="text-sm text-ink-body" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group/msg flex gap-3">
      {message.role === 'user' ? (
        <div className="p-2 rounded-control h-fit flex-shrink-0 bg-sunken">
          <User className="w-4 h-4 text-ink-body" />
        </div>
      ) : (
        <div className="flex-shrink-0 h-fit">
          <BrandIcon size="xs" theme="light" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {stageDone && (
          <div className="mb-3 rounded-card border border-border bg-surface-raised p-3 shadow-resting">
            <NamedStages stages={[{ title: stageDone.label, state: 'done' }]} />
          </div>
        )}
        <div className={`relative ${compactScreening ? 'px-1 py-1.5' : surfaceClassName}`}>
          {compactScreening ? (
            <p className="text-sm text-ink-body">
              Your answer&apos;s on the right. Copy it from there, or tell me to make it shorter or more formal.
            </p>
          ) : screeningAnswers ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-brand" />
                  <span className="text-sm font-semibold text-brand-strong">Screening Question Answers</span>
                </div>
                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand bg-canvas hover:bg-sunken rounded-control transition-colors cursor-pointer"
                >
                  {copiedAll ? <Check className="w-3 h-3 text-ink-accent" /> : <Copy className="w-3 h-3" />}
                  {copiedAll ? 'Copied!' : 'Copy All'}
                </button>
              </div>
              {screeningAnswers.map((qa, idx) => (
                <div key={idx} className="bg-surface border border-border rounded-card p-3 space-y-2">
                  {qa.question && (
                    <p className="text-xs font-medium text-ink-muted">{qa.question}</p>
                  )}
                  <MarkdownText
                    content={qa.answer}
                    className="text-sm text-ink-body"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCopyAnswer(idx, qa.answer)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-ink-muted hover:text-brand hover:bg-canvas rounded-control transition-colors cursor-pointer"
                    >
                      {copiedAnswerIdx === idx ? (
                        <><Check className="w-3 h-3 text-ink-accent" /> Copied!</>
                      ) : (
                        <><Copy className="w-3 h-3" /> Copy</>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : isLongMessage ? (
            /* Collapsible content for long user messages */
            <div className="relative">
              <div className={`text-sm text-ink-body overflow-hidden transition-all duration-(--duration-base) ${
                isExpanded ? '' : 'max-h-24'
              }`}>
                <MarkdownText
                  content={message.content}
                  className="text-sm text-ink-body"
                />
              </div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 mt-2 text-xs font-medium text-brand hover:text-brand-strong transition-colors cursor-pointer"
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
              className="text-sm text-ink-body"
            />
          )}
          
          {actionItems.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {actionItems.map((action, index) => {
                const isPrimaryAction = index === 0 && action.action !== 'start-new-application';

                return (
                  <button
                    key={index}
                    onClick={() => onAction(action.action)}
                    className={`flex items-center gap-2 rounded-pill border px-[18px] py-2.5 text-sm font-semibold transition-colors duration-(--duration-base) cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                      isPrimaryAction
                        ? 'border-accent bg-accent text-accent-ink shadow-resting hover:bg-accent-strong hover:border-accent-strong'
                        : 'border-border bg-surface text-ink hover:bg-surface-raised'
                    }`}
                  >
                    {action.icon === 'cv' && <FileText className={`w-4 h-4 ${isPrimaryAction ? 'text-accent-ink' : 'text-brand'}`} />}
                    {action.icon === 'cover-letter' && <Mail className={`w-4 h-4 ${isPrimaryAction ? 'text-accent-ink' : 'text-ink-accent'}`} />}
                    {action.icon === 'email' && <Send className={`w-4 h-4 ${isPrimaryAction ? 'text-accent-ink' : 'text-ink-accent'}`} />}
                    {action.icon === 'new' && <Plus className={`w-4 h-4 ${isPrimaryAction ? 'text-accent-ink' : 'text-accent-strong'}`} />}
                    {action.icon === 'screening' && <ClipboardList className={`w-4 h-4 ${isPrimaryAction ? 'text-accent-ink' : 'text-brand'}`} />}
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}

          {hintAction && (
            <p className="mt-3 text-xs italic text-ink-muted">
              {hintAction.label.replace(/^💡\s*/, '')}
            </p>
          )}
        </div>
        
        {/* Feedback icons for assistant messages — visible on hover or when feedback given */}
        {message.role === 'assistant' && (
          <div className={`flex items-center gap-1 mt-2 ml-1 transition-opacity duration-(--duration-base) ${
            streaming ? 'invisible' : feedback ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'
          }`}>
            <button
              onClick={() => onFeedback(message.id, message.content, 'positive')}
              className={`p-1.5 rounded-control transition-colors cursor-pointer ${
                feedback === 'positive'
                  ? 'text-ink-accent bg-accent-soft-strong'
                  : 'text-ink-muted hover:text-ink-body hover:bg-sunken'
              }`}
              title="Good response"
              aria-label="Good response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback(message.id, message.content, 'negative')}
              className={`p-1.5 rounded-control transition-colors cursor-pointer ${
                feedback === 'negative'
                  ? 'text-danger-bright bg-danger-soft'
                  : 'text-ink-muted hover:text-ink-body hover:bg-sunken'
              }`}
              title="Bad response"
              aria-label="Bad response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 text-ink-muted hover:text-ink-body hover:bg-sunken rounded-control transition-colors cursor-pointer"
              title="Copy message"
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-ink-accent" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Timestamp — visible on hover */}
        <p className="text-xs text-ink-muted mt-1.5 ml-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-(--duration-base)">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

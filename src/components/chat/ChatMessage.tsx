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
  FileText,
  Mail,
  Send,
  Plus,
  ClipboardList,
} from 'lucide-react';

interface ScreeningAnswer {
  question: string;
  answer: string;
  raw: string;
}

function parseScreeningAnswers(content: string): ScreeningAnswer[] | null {
  if (!content.includes('---ANSWER_START---')) return null;

  const blocks = content.split('---ANSWER_START---').filter(Boolean);
  const answers: ScreeningAnswer[] = [];

  for (const block of blocks) {
    const cleaned = block.split('---ANSWER_END---')[0]?.trim();
    if (!cleaned) continue;

    // Extract question from **Q: ...** line
    const questionMatch = cleaned.match(/\*\*Q:\s*(.+?)\*\*/);
    const question = questionMatch ? questionMatch[1].trim() : '';

    // Answer is everything after the Q line
    const answerStart = cleaned.indexOf('**\n');
    const answer = answerStart !== -1
      ? cleaned.substring(answerStart + 3).trim()
      : cleaned.replace(/\*\*Q:.*?\*\*/, '').trim();

    if (answer) {
      answers.push({ question, answer, raw: cleaned });
    }
  }

  return answers.length > 0 ? answers : null;
}
import { KarkoIcon } from '../KarkoLogo';

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
      <div className="flex items-center gap-2 text-sm text-warm-gray w-full justify-center py-2">
        {message.content}
      </div>
    );
  }

  const isLongMessage = message.role === 'user' && message.content.length > collapseLength;

  return (
    <div className="group/msg flex gap-3">
      {message.role === 'user' ? (
        <div className="p-2 rounded-xl h-fit flex-shrink-0 bg-cream-200">
          <User className="w-4 h-4 text-charcoal" />
        </div>
      ) : (
        <div className="flex-shrink-0 h-fit">
          <KarkoIcon size="xs" theme="light" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <Card 
          padding="sm" 
          className={`relative ${message.role === 'user' 
            ? 'bg-cream-100 border-cream-200' 
            : 'bg-white border-cream-200 shadow-sm'
          }`}
        >
          {/* Screening answers — per-answer copy blocks */}
          {screeningAnswers ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-navy-600" />
                  <span className="text-sm font-semibold text-navy-700">Screening Question Answers</span>
                </div>
                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-navy-600 bg-cream-100 hover:bg-cream-200 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedAll ? <Check className="w-3 h-3 text-gold-600" /> : <Copy className="w-3 h-3" />}
                  {copiedAll ? 'Copied!' : 'Copy All'}
                </button>
              </div>
              {screeningAnswers.map((qa, idx) => (
                <div key={idx} className="bg-cream-50 border border-cream-200 rounded-xl p-3 space-y-2">
                  {qa.question && (
                    <p className="text-xs font-medium text-warm-gray">{qa.question}</p>
                  )}
                  <MarkdownText
                    content={qa.answer}
                    className="text-sm text-charcoal"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCopyAnswer(idx, qa.answer)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-warm-gray hover:text-navy-600 hover:bg-cream-100 rounded-md transition-colors cursor-pointer"
                    >
                      {copiedAnswerIdx === idx ? (
                        <><Check className="w-3 h-3 text-gold-600" /> Copied!</>
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
          
          {/* Action Buttons — vertical stacked with connecting line */}
          {message.actions && message.actions.length > 0 && (() => {
            const actionItems = message.actions.filter(a => a.action !== 'none');
            const hintAction = message.actions.find(a => a.action === 'none');

            return (
              <div className="mt-4 space-y-2">
                {actionItems.map((action, index) => (
                  <div key={index} className="flex items-stretch">
                    <div className="flex flex-col items-center mr-3">
                      <div className="w-px bg-cream-300 h-2" />
                      <div className="w-2 h-2 rounded-full border-2 border-gold-300 bg-white flex-shrink-0" />
                      <div className={`w-px bg-cream-300 flex-1 ${index === actionItems.length - 1 ? 'opacity-0' : ''}`} />
                    </div>
                    <button
                      onClick={() => onAction(action.action)}
                      className="flex items-center gap-2 px-4 py-2.5 my-1 text-sm font-medium bg-white text-charcoal border border-cream-200 rounded-xl hover:bg-cream-50 hover:border-gold-300 hover:shadow-sm transition-all cursor-pointer"
                    >
                      {action.icon === 'cv' && <FileText className="w-4 h-4 text-navy-600" />}
                      {action.icon === 'cover-letter' && <Mail className="w-4 h-4 text-gold-600" />}
                      {action.icon === 'email' && <Send className="w-4 h-4 text-gold-600" />}
                      {action.icon === 'new' && <Plus className="w-4 h-4 text-gold-500" />}
                      {action.icon === 'screening' && <ClipboardList className="w-4 h-4 text-navy-600" />}
                      {action.label}
                    </button>
                  </div>
                ))}
                {/* Hint text */}
                {hintAction && (
                  <p className="text-xs text-warm-gray mt-1 ml-5 italic">
                    {hintAction.label.replace(/^💡\s*/, '')}
                  </p>
                )}
              </div>
            );
          })()}
        </Card>
        
        {/* Feedback icons for assistant messages — visible on hover or when feedback given */}
        {message.role === 'assistant' && (
          <div className={`flex items-center gap-1 mt-2 ml-1 transition-opacity duration-200 ${
            feedback ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'
          }`}>
            <button
              onClick={() => onFeedback(message.id, message.content, 'positive')}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                feedback === 'positive'
                  ? 'text-gold-600 bg-gold-100'
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
                <Check className="w-3.5 h-3.5 text-gold-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Timestamp — visible on hover */}
        <p className="text-xs text-warm-gray mt-1.5 ml-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

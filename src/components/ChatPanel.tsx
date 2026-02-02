'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { MarkdownText } from './MarkdownText';
// AgentStepData type for V2 progress tracking
interface AgentStepData {
  function: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: {
    matchScore?: number;
    matchingSkills?: string[];
    missingSkills?: string[];
  };
  error?: string;
  agent?: string;
}
import { AgentProgressV2 } from './AgentProgressV2';
import { AgentSettingsToggle } from './AgentSettingsToggle';
// QualityScoreCard removed from chat panel - now only in CV panel sidebar
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { submitMessageFeedback } from '@/lib/supabase';
import { 
  Send, 
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  Plus,
  History,
  Sparkles,
  Bot,
  User,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Copy,
  MoreHorizontal,
  Check,
  CheckCircle2,
  Circle,
  Globe
} from 'lucide-react';

interface ChatPanelProps {
  onTabChange?: (tab: 'cv' | 'cover-letter' | 'email') => void;
  onAnalyze?: () => void;
}

export function ChatPanel({ onTabChange, onAnalyze }: ChatPanelProps) {
  const { user } = useAuth();
  const {
    currentCV,
    currentSession,
    createNewSession,
    addChatMessage,
    setJobDescription,
    isAnalyzing,
    isGenerating,
    sessions,
    loadSession,
  } = useAppStore();

  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStepData[]>([]);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  // V2 Agent state
  const [v2Progress, setV2Progress] = useState<{ percent: number; message: string } | null>(null);
  const [v2Reflection, setV2Reflection] = useState<{ iteration: number; status: 'started' | 'completed'; improved?: boolean } | null>(null);
  const [v2Models, setV2Models] = useState<{ analysis: string; writing: string } | null>(null);
  const [v2Evaluation, setV2Evaluation] = useState<{ score: number; passed: boolean; improvements: string[] } | null>(null);
  const [v2TokenUsage, setV2TokenUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number } | null>(null);
  // Agent settings
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [enableReflection, setEnableReflection] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'positive' | 'negative'>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string; content: string; type: 'positive' | 'negative' } | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MESSAGE_COLLAPSE_LENGTH = 300; // Characters before collapsing

  const toggleMessageExpanded = (messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleCopyMessage = async (messageId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleFeedbackClick = (messageId: string, content: string, type: 'positive' | 'negative') => {
    // Open modal for feedback
    setFeedbackModal({ messageId, content, type });
    setFeedbackText('');
  };

  const handleFeedbackSubmit = async () => {
    if (!user || !feedbackModal) return;
    
    const { messageId, content, type } = feedbackModal;
    
    // Update UI state
    setMessageFeedback(prev => ({ ...prev, [messageId]: type }));
    
    // Save to database with optional text
    // Only pass sessionId if it's a valid UUID (not local session ID like "session-123")
    const isValidUUID = currentSession?.id && !currentSession.id.startsWith('session-');
    const result = await submitMessageFeedback(user.id, messageId, type, {
      sessionId: isValidUUID ? currentSession.id : undefined,
      messageContent: content.substring(0, 500),
      feedbackText: feedbackText.trim() || undefined,
    });
    
    console.log('Feedback submission result:', result);
    
    // Show success message
    setFeedbackSuccess(true);
    setFeedbackText('');
    
    // Auto-close after 2 seconds
    setTimeout(() => {
      setFeedbackModal(null);
      setFeedbackSuccess(false);
    }, 2000);
  };

  const handleFeedbackCancel = () => {
    setFeedbackModal(null);
    setFeedbackText('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.chatMessages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [inputValue]);

  const messages = currentSession?.chatMessages || [];

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const messageContent = inputValue.trim();
    setInputValue('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // If no current session, create one
    if (!currentSession) {
      createNewSession(messageContent);
      
      // Add message immediately (no delay)
      addChatMessage({
        role: 'user',
        content: messageContent,
      });
      
      // Check if it's a job description (longer text with job-related keywords)
      const isJobDescription = messageContent.length > 100 || 
        /job|position|role|responsibilities|requirements|qualifications|experience/i.test(messageContent);
      
      if (isJobDescription) {
        setJobDescription(messageContent);
        
        // Start agent workflow immediately - show loading state right away
        setIsAgentWorking(true);
        setV2Progress({ percent: 0, message: 'Starting analysis...' });
        
        // Use the new agent workflow with streaming progress
        runAgentWorkflow(messageContent);
      } else {
        // Handle general conversation
        handleGeneralChat(messageContent);
      }
    } else {
      addChatMessage({
        role: 'user',
        content: messageContent,
      });
      
      // Smart job description detection - works even if there's already an analysis
      // A job description typically has: 100+ chars AND contains job-related keywords
      const jobKeywords = /\b(responsibilities|requirements|qualifications|experience required|skills required|about the role|job description|we are looking for|you will|must have|nice to have|salary|benefits|apply|candidate|position|vacancy)\b/i;
      const isLikelyJobDescription = messageContent.length > 200 && jobKeywords.test(messageContent);
      
      // Also check for shorter but clearly job-related content
      const isShortJobPost = messageContent.length > 100 && 
        (messageContent.match(jobKeywords) || []).length >= 2;
      
      const isNewJobDescription = isLikelyJobDescription || isShortJobPost;
      
      if (isNewJobDescription) {
        // Clear previous session data for new application
        useAppStore.getState().updateCurrentSession({
          requirements: null,
          gaps: null,
          generatedCV: null,
          matchScore: undefined,
          matchingSkills: [],
          missingSkills: [],
          suggestions: [],
        });
        
        setJobDescription(messageContent);
        
        // Start agent workflow immediately - show loading state right away
        setIsAgentWorking(true);
        setV2Progress({ percent: 0, message: 'Starting analysis...' });
        
        // Use the new agent workflow with streaming progress
        runAgentWorkflow(messageContent);
      } else {
        // Handle follow-up questions or general chat
        handleGeneralChat(messageContent);
      }
    }
  };

  const handleGeneralChat = async (message: string) => {
    setIsTyping(true);
    
    try {
      // Get all documents from store for comprehensive context
      const { masterCV, certifications } = useAppStore.getState();
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: {
            hasCV: !!currentCV,
            cvSummary: currentCV?.sections?.summary?.substring(0, 500),
            hasAnalysis: !!currentSession?.gaps,
            matchScore: currentSession?.gaps?.matchScore,
            jobTitle: currentSession?.jobTitle,
            company: currentSession?.company,
            // Include master CV and certifications info
            hasMasterCV: !!masterCV,
            masterCVSummary: masterCV?.rawText?.substring(0, 1000),
            hasCertifications: certifications.length > 0,
            certificationsCount: certifications.length,
            certificationsList: certifications.map(c => c.fileName).join(', '),
          },
        }),
      });

      if (response.ok) {
        const { reply, actions } = await response.json();
        addChatMessage({
          role: 'assistant',
          content: reply,
          actions: actions || [],
        });
      } else {
        // Fallback response
        addChatMessage({
          role: 'assistant',
          content: getSmartFallbackResponse(message),
        });
      }
    } catch (error) {
      // Fallback response on error
      addChatMessage({
        role: 'assistant',
        content: getSmartFallbackResponse(message),
      });
    } finally {
      setIsTyping(false);
    }
  };

  // Run the agent workflow with streaming progress updates
  const runAgentWorkflow = async (jobDescription: string) => {
    if (!currentCV) return;
    
    setIsAgentWorking(true);
    setAgentSteps([]);
    setV2Progress(null);
    setV2Reflection(null);
    setV2Models(null);
    setV2Evaluation(null);
    setV2TokenUsage(null);
    
    try {
      // Get all documents from the store for comprehensive analysis
      const { masterCV, certifications } = useAppStore.getState();
      
      // Format certifications as text for the AI to analyze
      const certificationsText = certifications.length > 0 
        ? certifications.map(cert => `- ${cert.fileName}`).join('\n')
        : undefined;
      
      const response = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          currentCV: currentCV.rawText,
          masterCV: masterCV?.rawText,
          certifications: certificationsText,
          action: 'full_optimization',
          enableWebSearch,
          enableReflection,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Agent workflow failed');
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            switch (data.type) {
              case 'workflow_start':
                setAgentSteps(data.steps.map((s: any) => ({
                  function: s.function,
                  description: s.description,
                  status: 'pending' as const,
                })));
                // V2: Store model info
                if (data.models) {
                  setV2Models(data.models);
                }
                break;
                
              case 'step_start':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { ...step, status: 'running' as const, agent: data.agent } : step
                ));
                break;
                
              case 'step_complete':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { 
                    ...step, 
                    status: 'completed' as const,
                    result: data.result,
                  } : step
                ));
                break;
                
              case 'step_error':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { 
                    ...step, 
                    status: 'error' as const,
                    error: data.error,
                  } : step
                ));
                break;
              
              // V2: Progress updates
              case 'progress':
                setV2Progress({ percent: data.percent, message: data.message });
                break;
              
              // V2: Reflection loop updates
              case 'reflection':
                setV2Reflection({
                  iteration: data.iteration,
                  status: data.status,
                  improved: data.improved,
                });
                break;
                
              case 'workflow_complete':
                // Update the store with results from 3-Agent Architecture
                const { results } = data;
                const ctx = results.context; // MasterContext from new architecture
                
                // Map new context format to store format
                if (ctx?.job) {
                  useAppStore.getState().updateCurrentSession({
                    requirements: {
                      title: ctx.job.title || '',
                      company: ctx.job.companyName || '',
                      hardSkills: ctx.job.requiredSkills || [],
                      softSkills: [],
                      experienceLevel: '',
                      keywords: [],
                      responsibilities: ctx.job.responsibilities || [],
                      niceToHave: ctx.job.niceToHaveSkills || [],
                      expectedSalary: ctx.job.expectedSalary,
                      startDate: ctx.job.startDate,
                      location: ctx.job.location,
                      workType: ctx.job.workType,
                    },
                    jobTitle: ctx.job.title,
                    company: ctx.job.companyName,
                  });
                }
                
                // Map match analysis to gaps format
                if (ctx?.match) {
                  useAppStore.getState().updateCurrentSession({
                    gaps: {
                      matchScore: ctx.match.score || 0,
                      matchingSkills: ctx.match.matchingSkills || [],
                      missingSkills: ctx.match.missingSkills || [],
                      matchingExperience: [],
                      missingExperience: [],
                      suggestions: [],
                    },
                    matchScore: ctx.match.score,
                    matchingSkills: ctx.match.matchingSkills || [],
                    missingSkills: ctx.match.missingSkills || [],
                  });
                }
                
                // Store optimized CV content (now includes changes)
                if (ctx?.optimizedCV) {
                  useAppStore.getState().updateCurrentSession({
                    generatedCV: {
                      content: ctx.optimizedCV.content,
                      changes: ctx.optimizedCV.changes?.map((c: { section: string; before: string; after: string; reason: string }) => ({
                        section: c.section,
                        original: c.before,
                        updated: c.after,
                        reason: c.reason,
                      })) || [],
                      optimizedFor: ctx.job?.title || 'Position',
                    },
                  });
                }
                
                // Store cover letter - the new architecture returns it as a complete formatted string
                // We store it with empty structured fields since the body contains everything
                if (ctx?.coverLetter) {
                  useAppStore.getState().updateCurrentSession({
                    coverLetter: {
                      applicantAddress: {
                        name: '',
                        street: '',
                        city: '',
                        country: '',
                        phone: '',
                        email: '',
                      },
                      date: '',
                      companyAddress: {
                        companyName: '',
                        street: '',
                      },
                      salutation: '',
                      body: ctx.coverLetter, // Full formatted cover letter
                      closing: '',
                      signatureName: '',
                    },
                  });
                }
                
                // Store email - now comes as { subject, body } from Writer Agent
                if (ctx?.applicationEmail) {
                  useAppStore.getState().updateCurrentSession({
                    email: {
                      subject: ctx.applicationEmail.subject || `Application for ${ctx.job?.title || 'Position'} at ${ctx.job?.companyName || 'Company'}`,
                      body: ctx.applicationEmail.body || '',
                      attachmentNote: 'Please find my CV and cover letter attached.',
                    },
                  });
                }
                
                // Store company research
                if (ctx?.companyResearch) {
                  useAppStore.getState().updateCurrentSession({
                    companyResearch: ctx.companyResearch,
                  });
                }
                
                // Add completion message
                addChatMessage({
                  role: 'assistant',
                  content: `✅ **Analysis Complete!**\n\nYour CV has been optimized for this role.\n\nCheck the **CV tab** to review the changes.`,
                  actions: [
                    { label: 'View Optimized CV', action: 'view-cv', icon: 'cv' },
                    { label: 'View Cover Letter', action: 'view-cover-letter', icon: 'cover-letter' },
                    { label: 'View Email', action: 'view-email', icon: 'email' },
                  ],
                });
                break;
                
              case 'error':
                addChatMessage({
                  role: 'assistant',
                  content: `❌ Sorry, something went wrong: ${data.message}. Please try again.`,
                });
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    } catch (error) {
      console.error('Agent workflow error:', error);
      addChatMessage({
        role: 'assistant',
        content: '❌ Sorry, the analysis failed. Please try again.',
      });
    } finally {
      setIsAgentWorking(false);
    }
  };

  const getSmartFallbackResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    if (!currentCV) {
      return "To get started, please upload your CV in the **Documents** section. Once uploaded, paste a job description here and I'll optimize your application.";
    }
    
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      return "I can help you with:\n\n• **Analyzing job descriptions** - Paste a job posting and I'll identify key requirements\n• **Optimizing your CV** - I'll tailor your CV to match the job\n• **Creating cover letters** - Personalized letters for each application\n• **Drafting emails** - Professional application emails\n\nJust paste a job description to get started!";
    }
    
    if (lowerMessage.includes('cv') || lowerMessage.includes('resume')) {
      return currentSession?.generatedCV 
        ? "I've already optimized your CV for this role. Check the **CV tab** to see the changes, or paste a new job description to optimize for a different position."
        : "Your CV is ready! Paste a job description and I'll optimize it for that specific role.";
    }
    
    if (lowerMessage.includes('cover letter')) {
      return currentSession?.coverLetter
        ? "Your cover letter is ready! Check the **Cover Letter tab** to review it."
        : "I'll generate a cover letter once we've analyzed a job description. Paste a job posting to get started.";
    }
    
    return "I'm here to help optimize your job applications. Paste a job description and I'll analyze it, optimize your CV, and create a tailored cover letter.";
  };

  const handleAction = async (action: string) => {
    switch (action) {
      case 'navigate-documents':
        window.location.href = '/documents';
        break;
      case 'view-cv':
        onTabChange?.('cv');
        break;
      case 'view-cover-letter':
        onTabChange?.('cover-letter');
        break;
      case 'view-email':
        onTabChange?.('email');
        break;
      case 'generate-cover-letter':
        // Switch to tab FIRST, then generate so loading shows in correct tab
        onTabChange?.('cover-letter');
        await handleGenerateCoverLetter();
        break;
      case 'generate-email':
        // Switch to tab FIRST, then generate so loading shows in correct tab
        onTabChange?.('email');
        await handleGenerateEmail();
        break;
      case 'start-new-application':
        // Create a completely new session - this ensures the next message triggers the agent workflow
        // Setting currentSession to null makes the code treat the next message as a new application
        useAppStore.setState({ 
          currentSession: null,
          jobDescription: '',
        });
        setJobDescription('');
        setAgentSteps([]);
        break;
    }
  };

  const handleGenerateCoverLetter = async () => {
    const { currentSession } = useAppStore.getState();
    // Cover letter is already generated by the 3-agent workflow
    // Just navigate to the tab
    if (currentSession?.coverLetter) {
      addChatMessage({
        role: 'assistant',
        content: `✅ Your cover letter is ready!\n\nCheck the **Cover Letter tab** to review it.`,
        actions: [
          { label: 'View Cover Letter', action: 'view-cover-letter', icon: 'cover-letter' },
        ],
      });
    } else {
      addChatMessage({
        role: 'assistant',
        content: `Please paste a job description first to generate your cover letter.`,
      });
    }
  };

  const handleGenerateEmail = async () => {
    const { currentSession } = useAppStore.getState();
    // Email is already generated by the 3-agent workflow
    // Just navigate to the tab
    if (currentSession?.email) {
      addChatMessage({
        role: 'assistant',
        content: `✅ Your application email is ready!\n\nCheck the **Email tab** to review it.`,
        actions: [
          { label: 'View Email', action: 'view-email', icon: 'email' },
        ],
      });
    } else {
      addChatMessage({
        role: 'assistant',
        content: `Please paste a job description first to generate your application email.`,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewApplication = () => {
    useAppStore.getState().clearCurrentSession();
    useAppStore.getState().resetGenerated();
    setShowHistory(false);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <>
    {/* Feedback Modal */}
    {feedbackModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Modal Header */}
          <div className={`px-6 py-4 ${feedbackModal.type === 'positive' ? 'bg-sage-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${feedbackModal.type === 'positive' ? 'bg-sage-100' : 'bg-red-100'}`}>
                {feedbackModal.type === 'positive' 
                  ? <ThumbsUp className="w-5 h-5 text-sage-600" />
                  : <ThumbsDown className="w-5 h-5 text-red-500" />
                }
              </div>
              <div>
                <h3 className="font-semibold text-charcoal">
                  {feedbackModal.type === 'positive' ? 'What did you like?' : 'What could be improved?'}
                </h3>
                <p className="text-sm text-warm-gray">Your feedback helps us improve</p>
              </div>
            </div>
          </div>
          
          {/* Modal Body */}
          {feedbackSuccess ? (
            <div className="px-6 py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-sage-100 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-sage-600" />
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
                  placeholder={feedbackModal.type === 'positive' 
                    ? "Tell us what was helpful about this response..." 
                    : "Tell us how we can make this better..."
                  }
                  className="w-full h-32 px-4 py-3 text-sm border border-cream-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-300 focus:border-gold-400 resize-none placeholder:text-warm-gray"
                  autoFocus
                />
              </div>
              
              {/* Modal Footer */}
              <div className="px-6 py-4 bg-cream-50 flex items-center justify-end gap-3">
                <button
                  onClick={handleFeedbackCancel}
                  className="px-4 py-2 text-sm font-medium text-warm-gray hover:text-charcoal transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFeedbackSubmit}
                  className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-gold-400 to-gold-500 text-white rounded-lg hover:from-gold-500 hover:to-gold-600 shadow-md transition-all"
                >
                  Submit Feedback
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    
    <div className="h-full flex flex-col bg-cream-50 border-l border-cream-300">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cream-300 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/karko-ai.png" 
              alt="KarKo AI" 
              className="h-8 w-auto"
            />
            <div>
              <h2 className="text-sm font-semibold text-charcoal">KarKo AI</h2>
              <p className="text-xs text-warm-gray">Hyper-Personalized Job Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                showHistory ? 'bg-navy-100 text-navy-600' : 'text-warm-gray hover:bg-cream-200'
              }`}
              title="Application History"
            >
              <History className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewApplication}
              className="p-2 rounded-lg text-warm-gray hover:bg-cream-200 transition-colors cursor-pointer"
              title="New Application"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="border-b border-cream-300 bg-white max-h-60 overflow-auto">
          <div className="p-3">
            <p className="text-xs font-medium text-warm-gray mb-2">Recent Applications</p>
            {sessions.length === 0 ? (
              <p className="text-xs text-warm-gray py-2">No applications yet</p>
            ) : (
              <div className="space-y-1">
                {sessions.slice(0, 10).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      loadSession(session.id);
                      setShowHistory(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-cream-100 transition-colors cursor-pointer ${
                      currentSession?.id === session.id ? 'bg-cream-200' : ''
                    }`}
                  >
                    <p className="font-medium text-charcoal truncate">
                      {session.company || session.jobTitle || 'Untitled'}
                    </p>
                    <p className="text-xs text-warm-gray flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Welcome message */}
        {!currentSession && messages.length === 0 && (
          <div className="flex gap-3">
            <div className="p-2 bg-navy-100 rounded-full h-fit">
              <Bot className="w-4 h-4 text-navy-600" />
            </div>
            <div className="flex-1">
              <Card padding="sm" className="bg-white border-cream-200">
                <MarkdownText 
                  content={currentCV 
                    ? "👋 Great, your CV is uploaded! **Paste a job description** below and I'll:\n\n1. Analyze the requirements\n2. Optimize your CV for the role\n3. Generate a tailored cover letter\n\nJust paste the job posting to get started!"
                    : "👋 Welcome to KarKo AI! I'm your AI-powered application assistant.\n\nTo get started:\n1. **Upload your CV** in the Documents section\n2. Paste a job description here\n3. I'll optimize everything for you!"
                  }
                  className="text-sm text-charcoal"
                />
                {!currentCV && (
                  <div className="mt-3">
                    <button
                      onClick={() => handleAction('navigate-documents')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition-colors cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      Upload CV
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </Card>
              <p className="text-xs text-warm-gray mt-1 ml-1">Just now</p>
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((message) => (
          <div key={message.id} className="flex gap-3">
            {message.role === 'system' ? (
              <div className="flex items-center gap-2 text-sm text-warm-gray w-full justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {message.content}
              </div>
            ) : (
              <>
                <div className={`rounded-full h-fit flex-shrink-0 ${
                  message.role === 'user' ? 'p-2 bg-cream-200' : 'p-1 bg-navy-100'
                }`}>
                  {message.role === 'user' 
                    ? <User className="w-4 h-4 text-charcoal" />
                    : <img src="/karko-ai.png" alt="KarKo AI" className="w-6 h-6 object-contain" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <Card 
                    padding="sm" 
                    className={`relative ${message.role === 'user' 
                      ? 'bg-cream-200 border-cream-300' 
                      : 'bg-white border-cream-200'
                    }`}
                  >
                    {/* Collapsible user messages for long content */}
                    {message.role === 'user' && message.content.length > MESSAGE_COLLAPSE_LENGTH ? (
                      <div className="relative">
                        <div className={`text-sm text-charcoal overflow-hidden transition-all duration-300 ${
                          expandedMessages.has(message.id) ? '' : 'max-h-24'
                        }`}>
                          <MarkdownText 
                            content={message.content}
                            className="text-sm text-charcoal"
                          />
                        </div>
                        {!expandedMessages.has(message.id) && (
                          <div className="absolute bottom-6 left-0 right-0 h-12 bg-gradient-to-t from-cream-200 to-transparent pointer-events-none" />
                        )}
                        <button
                          onClick={() => toggleMessageExpanded(message.id)}
                          className="flex items-center gap-1 mt-2 text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors cursor-pointer"
                        >
                          {expandedMessages.has(message.id) ? (
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
                    
                    {/* Action Buttons - Lovable style with vertical list and connecting lines */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-4 space-y-0">
                        {message.actions.map((action, index) => (
                          <div key={index} className="flex items-stretch">
                            {/* Connecting line */}
                            <div className="flex flex-col items-center mr-3">
                              <div className={`w-px bg-cream-300 ${index === 0 ? 'h-2' : 'h-2'}`} />
                              <div className="w-2 h-2 rounded-full border-2 border-cream-400 bg-white flex-shrink-0" />
                              <div className={`w-px bg-cream-300 flex-1 ${index === (message.actions?.length ?? 0) - 1 ? 'opacity-0' : ''}`} />
                            </div>
                            {/* Button */}
                            <button
                              onClick={() => handleAction(action.action)}
                              className="flex items-center gap-2 px-4 py-2.5 my-1 text-sm font-medium bg-cream-100 text-charcoal border border-cream-300 rounded-lg hover:bg-cream-200 hover:border-cream-400 transition-colors cursor-pointer"
                            >
                              {action.icon === 'cv' && <FileText className="w-4 h-4 text-navy-600" />}
                              {action.icon === 'cover-letter' && <Mail className="w-4 h-4 text-gold-600" />}
                              {action.icon === 'email' && <Send className="w-4 h-4 text-sage-600" />}
                              {action.icon === 'new' && <Plus className="w-4 h-4 text-navy-600" />}
                              {action.label}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                  
                  {/* Feedback icons for assistant messages - Lovable style */}
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-1 mt-2 ml-1">
                      <button 
                        onClick={() => handleFeedbackClick(message.id, message.content, 'positive')}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          messageFeedback[message.id] === 'positive' 
                            ? 'text-sage-600 bg-sage-100' 
                            : 'text-warm-gray hover:text-charcoal hover:bg-cream-200'
                        }`}
                        title="Good response"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleFeedbackClick(message.id, message.content, 'negative')}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          messageFeedback[message.id] === 'negative' 
                            ? 'text-red-500 bg-red-50' 
                            : 'text-warm-gray hover:text-charcoal hover:bg-cream-200'
                        }`}
                        title="Bad response"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        className="p-1.5 text-warm-gray hover:text-charcoal hover:bg-cream-200 rounded transition-colors cursor-pointer"
                        title="Copy message"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="w-3.5 h-3.5 text-sage-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                  
                  {message.role === 'user' && (
                    <p className="text-xs text-warm-gray mt-1 ml-1">
                      {formatTime(message.timestamp)}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Agent Steps Progress V2 - shown after messages */}
        {isAgentWorking && agentSteps.length > 0 && (
          <div className="flex gap-3">
            <div className="p-1 bg-navy-100 rounded-full h-fit flex-shrink-0">
              <img src="/karko-ai.png" alt="KarKo AI" className="w-6 h-6 object-contain" />
            </div>
            <div className="flex-1">
              <AgentProgressV2 
                steps={agentSteps.map(s => ({
                  id: s.function,
                  description: s.description,
                  status: s.status,
                  agent: (s as any).agent,
                  result: s.result,
                  error: s.error,
                }))}
                progress={v2Progress}
                reflection={v2Reflection}
                models={v2Models}
                isWorking={isAgentWorking}
                tokenUsage={v2TokenUsage || undefined}
              />
            </div>
          </div>
        )}
        
        {/* Quality Score Card removed from chat - now only shown in CV panel sidebar */}
        
        {/* Typing indicator */}
        {(isTyping || isAnalyzing || isGenerating) && !isAgentWorking && (
          <div className="flex gap-3">
            <div className="p-1 bg-navy-100 rounded-full h-fit flex-shrink-0">
              <img src="/karko-ai.png" alt="KarKo AI" className="w-6 h-6 object-contain" />
            </div>
            <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-lg border border-cream-200">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-navy-400 rounded-full animate-bounce typing-dot-1" />
                <span className="w-2 h-2 bg-navy-400 rounded-full animate-bounce typing-dot-2" />
                <span className="w-2 h-2 bg-navy-400 rounded-full animate-bounce typing-dot-3" />
              </div>
              <span className="text-sm text-warm-gray ml-2">
                {isAnalyzing ? 'Analyzing job requirements...' : isGenerating ? 'Generating content...' : 'Thinking...'}
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Professional chat input with gold accent */}
      <div className="p-4 bg-gradient-to-t from-cream-100 to-cream-50">
        <div className="relative">
          {/* Main input container with gold border */}
          <div className="relative bg-white rounded-2xl border-2 border-gold-300/60 shadow-lg shadow-gold-100/40 overflow-hidden focus-within:border-gold-400 focus-within:shadow-gold-200/50 transition-all duration-200">
            
            <div className="relative flex flex-col">
              {/* Input row */}
              <div className="flex items-end gap-2 p-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={currentCV 
                      ? "Paste a job description or ask me anything..." 
                      : "Upload your CV first to get started..."
                    }
                    disabled={!currentCV || isAnalyzing || isGenerating || isTyping}
                    className="chat-input-textarea w-full px-1 py-1 text-sm bg-transparent focus:outline-none focus:ring-0 border-none resize-none disabled:opacity-50 placeholder:text-warm-gray min-h-[24px] max-h-[150px]"
                    rows={1}
                  />
                </div>
                
                {/* Send button - circular with gradient */}
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !currentCV || isAnalyzing || isGenerating || isTyping}
                  title="Send message"
                  aria-label="Send message"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 hover:from-gold-500 hover:to-gold-600 disabled:from-cream-300 disabled:to-cream-400 disabled:cursor-not-allowed flex items-center justify-center shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 disabled:hover:scale-100"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
              
              {/* Toggle buttons row - only show when input is empty */}
              {!inputValue.trim() && (
                <div className="flex items-center gap-2 px-3 pb-3 pt-0 border-t border-cream-100">
                  <button
                    onClick={() => setEnableWebSearch(!enableWebSearch)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      enableWebSearch 
                        ? 'bg-gold-100 text-gold-700 border border-gold-300' 
                        : 'bg-cream-50 text-warm-gray border border-cream-200 hover:bg-cream-100'
                    }`}
                    title="Toggle web search for company research"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Web Search
                  </button>
                  <button
                    onClick={() => setEnableReflection(!enableReflection)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      enableReflection 
                        ? 'bg-gold-100 text-gold-700 border border-gold-300' 
                        : 'bg-cream-50 text-warm-gray border border-cream-200 hover:bg-cream-100'
                    }`}
                    title="Toggle AI refinement for better results"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Refine
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Bottom info bar */}
          <div className="flex items-center justify-center mt-3 gap-2">
            <Sparkles className="w-3 h-3 text-gold-500" />
            <p className="text-xs text-warm-gray">
              {currentCV ? 'AI-powered optimization' : 'Upload your CV to enable chat'}
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

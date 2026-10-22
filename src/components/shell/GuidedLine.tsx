'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Check, Loader2, Search, Sparkles, Upload } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { GuidedStepper } from '@/components/shell/GuidedStepper';
import { NamedStages, type NamedStage } from '@/components/shell/NamedStages';
import { LogisticsQuestions } from '@/components/chat/LogisticsQuestions';
import { useAuth } from '@/contexts/AuthContext';
import { PROFILE_UNAVAILABLE, useAgentWorkflow } from '@/components/chat/useAgentWorkflow';
import { stepAfterDroppedResume } from '@/lib/profile/logistics-resume';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { openSettings } from '@/store/useSettingsStore';
import { useAppStore } from '@/store/useAppStore';
import { uploadCVFile, saveDocument } from '@/lib/supabase';
import type { ParsedCV } from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';
import {
  formatUploadLimit,
  getPrimaryCVUploadLimitBytes,
} from '@/lib/cv-upload-limits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { sessionHasKit } from '@/components/shell/application-status';
import {
  clearFreeGenerationFlag,
  hasUsedFreeGeneration,
  markAnonymousCarryOver,
  markFreeGenerationUsed,
} from '@/lib/anonymous-generation';
import { computeFitLevel } from '@/lib/agents/prompts/fit-assessment-prompt';

const MIN_JD = 80;
const RESUME_INTENT_KEY = 'usefulapply_resume_intent';
const RESUME_INTENT_TTL_MS = 30 * 60 * 1000;

// What the visitor pressed before being sent to sign up. Bound to the job and
// short-lived so a stale flag can never start a paid run on its own.
interface ResumeIntent {
  action: 'fit' | 'kit' | 'direct';
  jd: string;
  createdAt: number;
}

function writeResumeIntent(intent: Omit<ResumeIntent, 'createdAt'>) {
  localStorage.setItem(RESUME_INTENT_KEY, JSON.stringify({ ...intent, createdAt: Date.now() }));
}

function clearResumeIntent() {
  localStorage.removeItem(RESUME_INTENT_KEY);
}

function readResumeIntent(): ResumeIntent | null {
  const raw = localStorage.getItem(RESUME_INTENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResumeIntent>;
    const fresh = typeof parsed.createdAt === 'number' && Date.now() - parsed.createdAt < RESUME_INTENT_TTL_MS;
    const valid = (parsed.action === 'fit' || parsed.action === 'kit' || parsed.action === 'direct')
      && typeof parsed.jd === 'string' && parsed.jd.length >= MIN_JD;
    if (fresh && valid) return parsed as ResumeIntent;
  } catch {
    // fall through: unreadable flag is dropped
  }
  clearResumeIntent();
  return null;
}

type LineStep = 'cv' | 'cv-reading' | 'job' | 'fit-working' | 'fit-result' | 'signup' | 'verify-email' | 'kit-working';

const STEP_INDEX: Record<LineStep, number> = {
  cv: 0,
  'cv-reading': 0,
  job: 1,
  'fit-working': 2,
  'fit-result': 2,
  signup: 3,
  'verify-email': 3,
  'kit-working': 3,
};

function fitHeading(level: string | undefined, company: string): string {
  const name = company || 'this role';
  if (level === 'strong') return `Strong fit for ${name}`;
  if (level === 'good') return `Good fit for ${name}`;
  if (level === 'fair') return `Fair fit for ${name}`;
  if (level === 'weak') return `Weak fit for ${name}`;
  return `Your fit for ${name}`;
}

function parseStagesFromProgress(
  titles: string[],
  percent: number,
  details: string[] = [],
): NamedStage[] {
  const n = titles.length;
  const slice = 100 / n;
  return titles.map((title, index) => {
    const start = slice * index;
    const end = slice * (index + 1);
    let state: NamedStage['state'] = 'todo';
    if (percent >= end - 1) state = 'done';
    else if (percent >= start) state = 'active';
    return { title, detail: details[index], state };
  });
}

interface GuidedLineProps {
  onKitReady: () => void;
}

export function GuidedLine({ onKitReady }: GuidedLineProps) {
  const router = useRouter();
  const { user, signUp, signIn, signInWithGoogle } = useAuth();
  const currentCV = useCVStore((s) => s.currentCV);
  const structuredCV = useCVStore((s) => s.structuredCV);
  const setCurrentCV = useCVStore((s) => s.setCurrentCV);
  const setStructuredCV = useCVStore((s) => s.setStructuredCV);
  const currentSession = useSessionStore((s) => s.currentSession);
  const hasKit = sessionHasKit(currentSession);
  const createNewSession = useSessionStore((s) => s.createNewSession);
  const addChatMessage = useSessionStore((s) => s.addChatMessage);
  const setJobDescription = useSessionStore((s) => s.setJobDescription);

  const [step, setStep] = useState<LineStep>(() => {
    if (currentSession?.pendingFitAnalysis && currentCV) return 'fit-result';
    return currentCV ? 'job' : 'cv';
  });
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedCv, setPastedCv] = useState('');
  const [jobText, setJobText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsePercent, setParsePercent] = useState(8);
  const [fileName, setFileName] = useState(currentCV?.fileName || '');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const kitStartedRef = useRef(false);
  const fitSeenWorkingRef = useRef(false);
  const kitSeenWorkingRef = useRef(false);
  const cvHydrationAdvancedRef = useRef(Boolean(currentCV));
  const [lineError, setLineError] = useState<string | null>(null);
  const [isCreditError, setIsCreditError] = useState(false);
  const [freeCheckUsed, setFreeCheckUsed] = useState(false);
  // Job pasted while the CV was still parsing. Started from an effect, not
  // from the parse callback, so the fit runs with the CV actually in the store.
  const [queuedFit, setQueuedFit] = useState<string | null>(null);
  const pendingJobRef = useRef('');
  const parseTimerRef = useRef<number | null>(null);

  const maxSizeBytes = getPrimaryCVUploadLimitBytes(Boolean(user));

  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  // The kit is parked until the start date and salary questions are answered.
  const askingLogistics = useUIStore((s) => s.pendingLogistics?.host === 'guided');
  // Read aloud when the questions close, because the card that held focus is gone by then.
  const [logisticsNotice, setLogisticsNotice] = useState('');
  const {
    agentSteps,
    v2Progress,
    fitAnalysisContextId,
    runFitAnalysisFlow,
    runAgentWorkflow,
    resumeAfterLogistics,
    setApplicationMode,
  } = useAgentWorkflow({
    logisticsHost: 'guided',
    onSessionExpired: () => {
      setIsCreditError(false);
      setLineError('Your session expired. Sign in again to continue. Nothing was charged.');
    },
    onAnonymousLimitReached: () => {
      if (user) {
        // The server saw no session for a user the client still has: a
        // transient auth miss, not a sign-up problem.
        setIsCreditError(false);
        setLineError("Your session couldn't be verified. Refresh the page and try again.");
        return;
      }
      const jd = useSessionStore.getState().currentSession?.jobDescription || '';
      if (jd.length >= MIN_JD) writeResumeIntent({ action: 'fit', jd });
      setFreeCheckUsed(true);
      setStep('signup');
    },
    onInsufficientCredits: (required, available) => {
      setIsCreditError(true);
      setLineError(`This needs ${required} credits and you have ${available}. Upgrade for more, or try the fit check.`);
    },
  });

  const pendingFit = currentSession?.pendingFitAnalysis;
  const fitAnalysis = pendingFit?.contextData?.fitAnalysis as
    | {
        score?: number;
        fitLevel?: string;
        matchingSkills?: string[];
        missingSkills?: string[];
        assessment?: string;
      }
    | undefined;
  const fitMatch = pendingFit?.contextData?.match as
    | { matchedRequirements?: string[]; missingSkills?: string[] }
    | undefined;
  const fitJob = pendingFit?.contextData?.job as { title?: string; companyName?: string } | undefined;
  const companyName = currentSession?.company || fitJob?.companyName || '';
  const jobTitle = currentSession?.jobTitle || fitJob?.title || '';
  const cvName = structuredCV?.personal?.fullName || currentCV?.fileName?.replace(/\.[^.]+$/, '') || 'Your CV';
  const cvTitle = structuredCV?.personal?.currentTitle || '';

  useEffect(() => {
    if (step !== 'cv' || !currentCV || uploadError || cvHydrationAdvancedRef.current) return;
    cvHydrationAdvancedRef.current = true;
    setFileName(currentCV.fileName || '');
    setStep(currentSession?.pendingFitAnalysis ? 'fit-result' : 'job');
  }, [currentCV, currentSession?.pendingFitAnalysis, step, uploadError]);

  // Pick up where the visitor left off once a real user exists. Sign-up,
  // verification (new tab) and log in all land here, so a run never starts
  // with a stale anonymous user. Only a pressed "Generate" resumes a paid run;
  // a pressed "Check my fit" just restores the job for them to confirm.
  // Deferred one tick: AuthContext's own effect (which may clear the stores
  // and the intent on a foreign sign-in) runs in the same commit, and it has
  // to win before anything here reads state or starts a paid run.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (kitStartedRef.current || !user) return;
    const timer = window.setTimeout(() => {
      if (kitStartedRef.current) return;
      const liveCV = useCVStore.getState().currentCV;
      const live = useSessionStore.getState().currentSession;
      const livePendingFit = live?.pendingFitAnalysis;
      if (!liveCV) {
        // Logged in but the CV is gone (store reset on account switch): start over.
        if (step === 'signup' || step === 'verify-email') setStep('cv');
        return;
      }
      const intent = readResumeIntent();
      if (!intent) {
        if (step === 'signup' || step === 'verify-email') setStep(livePendingFit ? 'fit-result' : 'job');
        return;
      }
      clearResumeIntent();
      if (intent.action === 'fit') {
        setJobText(intent.jd);
        setStep('job');
        return;
      }
      if (!live || live.jobDescription !== intent.jd) createNewSession(intent.jd);
      const ctx = livePendingFit && livePendingFit.jobDescription === intent.jd ? livePendingFit : null;
      kitStartedRef.current = true;
      setIsCreditError(false);
      setLineError(null);
      setStep('kit-working');
      setApplicationMode(intent.action === 'direct' ? 'apply_directly' : 'analyze_first');
      // The run reads the profile itself before deciding whether to ask the start date questions. A
      // profile that can't be read comes back as an error, so the user isn't left on "Building".
      void runAgentWorkflow(intent.jd, ctx?.contextId, ctx?.contextData as never).then((result) => {
        if (result !== 'profile-unavailable') return;
        kitStartedRef.current = false;
        setLineError(PROFILE_UNAVAILABLE);
        setStep(stepAfterDroppedResume(Boolean(livePendingFit)));
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, currentCV, step, pendingFit, createNewSession, runAgentWorkflow, setApplicationMode]);

  useEffect(() => {
    if (kitStartedRef.current && !isAgentWorking && hasKit) {
      onKitReady();
    }
  }, [isAgentWorking, hasKit, onKitReady]);

  // Same shape for step 4b: a run that ends with no kit goes back to the
  // verdict (or the job) with a reason instead of sitting on "Building".
  useEffect(() => {
    if (step !== 'kit-working') {
      kitSeenWorkingRef.current = false;
      return;
    }
    if (isAgentWorking) {
      kitSeenWorkingRef.current = true;
      return;
    }
    if (!kitSeenWorkingRef.current || hasKit) return;
    kitStartedRef.current = false;
    setLineError((prev) => prev ?? "The kit didn't finish. Try again.");
    setStep(pendingFit ? 'fit-result' : 'job');
  }, [step, isAgentWorking, hasKit, pendingFit]);

  // Leave step 3 only after the run has actually been seen working, so the
  // tick between setStep and runFitAnalysisFlow can't bounce it. No verdict
  // at the end means the run failed: back to the job with a reason.
  useEffect(() => {
    if (step !== 'fit-working') {
      fitSeenWorkingRef.current = false;
      return;
    }
    if (isAgentWorking) {
      fitSeenWorkingRef.current = true;
      return;
    }
    if (!fitSeenWorkingRef.current) return;
    if (pendingFit) {
      if (!user) markFreeGenerationUsed();
      setStep('fit-result');
      return;
    }
    setLineError((prev) => prev ?? "The fit check didn't finish. Try again.");
    setStep('job');
  }, [step, isAgentWorking, pendingFit, user]);

  useEffect(() => {
    return () => {
      if (parseTimerRef.current) window.clearInterval(parseTimerRef.current);
    };
  }, []);

  const startParseProgress = () => {
    setParsePercent(8);
    if (parseTimerRef.current) window.clearInterval(parseTimerRef.current);
    parseTimerRef.current = window.setInterval(() => {
      setParsePercent((prev) => (prev >= 88 ? prev : prev + 4));
    }, 1200);
  };

  const stopParseProgress = (final = 100) => {
    if (parseTimerRef.current) {
      window.clearInterval(parseTimerRef.current);
      parseTimerRef.current = null;
    }
    setParsePercent(final);
  };

  const startFit = useCallback(
    (jd: string) => {
      const trimmed = jd.trim();
      if (trimmed.length < MIN_JD) return;
      if (!user && hasUsedFreeGeneration()) {
        writeResumeIntent({ action: 'fit', jd: trimmed });
        setStep('signup');
        return;
      }
      if (!useSessionStore.getState().currentSession) {
        createNewSession(trimmed);
      } else {
        setJobDescription(trimmed);
      }
      addChatMessage({ role: 'user', content: trimmed });
      setApplicationMode('analyze_first');
      setIsCreditError(false);
      setLineError(null);
      useAppStore.getState().updateCurrentSession({ pendingFitAnalysis: null });
      setStep('fit-working');
      window.setTimeout(() => {
        void runFitAnalysisFlow(trimmed);
      }, 0);
    },
    [addChatMessage, createNewSession, runFitAnalysisFlow, setApplicationMode, setJobDescription, user],
  );

  // A job handed off from the feed before this user has any kit. The shell
  // shows the guided line rather than the workspace in that case, so the
  // autostart signal ChatPanel normally consumes has to be honoured here too.
  // Without this the click looks like it did nothing: the feed disappears and
  // the job step sits empty even though the session already holds the ad.
  const pendingJobFeedAutostart = useUIStore((s) => s.pendingJobFeedAutostart);
  const setPendingJobFeedAutostart = useUIStore((s) => s.setPendingJobFeedAutostart);
  useEffect(() => {
    if (!pendingJobFeedAutostart) return;
    if (!currentCV) return;
    const live = useSessionStore.getState().currentSession;
    if (!live || live.id !== pendingJobFeedAutostart.sessionId) return;
    const jd = live.jobDescription?.trim() ?? '';
    if (jd.length < MIN_JD) return;
    // Already under way or already answered: consume the flag and leave it.
    if (kitStartedRef.current || isAgentWorking || sessionHasKit(live) || live.pendingFitAnalysis) {
      setPendingJobFeedAutostart(null);
      return;
    }

    const mode = pendingJobFeedAutostart.mode ?? 'apply';
    const headline = pendingJobFeedAutostart.headline?.trim() || jd;
    setPendingJobFeedAutostart(null);
    addChatMessage({ role: 'user', content: headline });
    setIsCreditError(false);
    setLineError(null);

    if (mode === 'analyze') {
      setApplicationMode('analyze_first');
      setStep('fit-working');
      window.setTimeout(() => { void runFitAnalysisFlow(jd); }, 0);
      return;
    }
    kitStartedRef.current = true;
    setApplicationMode('apply_directly');
    setStep('kit-working');
    window.setTimeout(() => { void runAgentWorkflow(jd); }, 0);
  }, [
    addChatMessage,
    currentCV,
    isAgentWorking,
    pendingJobFeedAutostart,
    runAgentWorkflow,
    runFitAnalysisFlow,
    setApplicationMode,
    setPendingJobFeedAutostart,
  ]);

  const handleParsed = useCallback(
    (parsed: ParsedCV, structured?: StructuredCV) => {
      setCurrentCV(parsed);
      if (structured) setStructuredCV(structured);
      useCVStore.getState().setEditedOriginalCVData(null);
      stopParseProgress(100);
      const queued = pendingJobRef.current.trim();
      setStep('job');
      if (queued.length >= MIN_JD) {
        setJobText(queued);
        setQueuedFit(queued);
      }
    },
    [setCurrentCV, setStructuredCV],
  );

  useEffect(() => {
    if (!queuedFit || !currentCV) return;
    setQueuedFit(null);
    startFit(queuedFit);
  }, [queuedFit, currentCV, startFit]);

  const parseFile = useCallback(
    async (file: File) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
      setUploadError(null);
      setFileName(file.name);
      setStep('cv-reading');
      startParseProgress();
      try {
        if (file.size > maxSizeBytes) {
          throw new Error(
            `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${formatUploadLimit(maxSizeBytes)}.`,
          );
        }

        let storagePath: string | undefined;
        if (user) {
          const uploadResult = await uploadCVFile(user.id, 'primary_cv', file);
          storagePath = uploadResult.path || undefined;
        }

        let response: Response;
        if (storagePath) {
          response = await fetch('/api/parse-cv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePath, fileName: file.name, documentType: 'primary_cv' }),
            signal: controller.signal,
          });
        } else {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('documentType', 'primary_cv');
          response = await fetch('/api/parse-cv', { method: 'POST', body: formData, signal: controller.signal });
        }

        if (!response.ok) {
          let errorMessage = 'Failed to parse CV';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            if (response.status === 413) errorMessage = 'File is too large. Please try a smaller file.';
            else if (response.status === 429) errorMessage = 'Too many requests. Please wait a moment and try again.';
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        const structured = result.structuredCV as StructuredCV | undefined;
        if (result.success && result.rawText) {
          const parsedCV: ParsedCV = {
            rawText: result.rawText,
            sections: {
              contactInfo: structured?.personal
                ? `${structured.personal.fullName || ''}\n${structured.personal.email || ''}\n${structured.personal.phone || ''}`
                : '',
              summary: structured?.summary || '',
              experience: structured?.experience?.map((e) =>
                `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`,
              ).join('\n\n') || '',
              education: structured?.education?.map((e) =>
                `${e.degree} - ${e.institution}`,
              ).join('\n') || '',
              skills: structured?.skills?.map((s) =>
                `${s.category}: ${s.skills?.join(', ') || ''}`,
              ).join('\n') || '',
            },
            fileName: file.name,
            fileType: file.name.toLowerCase().endsWith('.pdf')
              ? 'pdf'
              : file.name.toLowerCase().endsWith('.docx')
                ? 'docx'
                : 'txt',
          };
          if (user) {
            const saved = await saveDocument(user.id, 'primary_cv', {
              file_name: file.name,
              file_type: parsedCV.fileType,
              file_size: file.size,
              storage_path: storagePath,
              raw_text: parsedCV.rawText,
              sections: parsedCV.sections,
              structured_data: structured,
            });
            if (saved.error) throw saved.error;
            if (structured) {
              fetch('/api/job-feed/settings/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ structured_data: structured }),
              }).catch(() => {});
            }
          }
          // A queued fit request reads the CV from the server. Advance the UI
          // only after the signed-in user's document write is durable.
          handleParsed(parsedCV, structured);
        } else {
          throw new Error('CV was parsed but no content was extracted. The file may be empty or image-based.');
        }
      } catch (error) {
        console.error('CV upload error:', error);
        stopParseProgress(0);
        setUploadError(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'CV parsing took too long. Please try again.'
            : error instanceof Error ? error.message : 'Upload failed',
        );
        setStep('cv');
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [handleParsed, maxSizeBytes, user],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) void parseFile(accepted[0]);
    },
    [parseFile],
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const tooLarge = rejections.some((rejection) =>
        rejection.errors.some((error) => error.code === 'file-too-large'),
      );
      setUploadError(
        tooLarge
          ? `File is too large. Maximum: ${formatUploadLimit(maxSizeBytes)}.`
          : 'Use a PDF, DOCX or TXT file.',
      );
    },
    [maxSizeBytes],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    noClick: true,
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: maxSizeBytes,
  });

  const handlePasteCv = () => {
    const trimmed = pastedCv.trim();
    if (trimmed.length < 50) {
      setUploadError('The pasted text seems too short. Paste your full CV.');
      return;
    }
    const file = new File([trimmed], 'pasted-cv.txt', { type: 'text/plain' });
    void parseFile(file);
  };

  const startKit = () => {
    const jd = pendingFit?.jobDescription || currentSession?.jobDescription || jobText;
    if (!user) {
      writeResumeIntent({ action: 'kit', jd });
      setStep('signup');
      return;
    }
    kitStartedRef.current = true;
    setIsCreditError(false);
    setLineError(null);
    setStep('kit-working');
    setApplicationMode('analyze_first');
    void runAgentWorkflow(jd, fitAnalysisContextId || pendingFit?.contextId, pendingFit?.contextData as never);
  };

  const startDirectKit = () => {
    const jd = jobText.trim();
    if (jd.length < MIN_JD) return;
    if (!user) {
      if (!useSessionStore.getState().currentSession) createNewSession(jd);
      setJobDescription(jd);
      writeResumeIntent({ action: 'direct', jd });
      setStep('signup');
      return;
    }
    if (!useSessionStore.getState().currentSession) createNewSession(jd);
    else setJobDescription(jd);
    addChatMessage({ role: 'user', content: jd });
    kitStartedRef.current = true;
    setIsCreditError(false);
    setLineError(null);
    setStep('kit-working');
    setApplicationMode('apply_directly');
    window.setTimeout(() => {
      void runAgentWorkflow(jd);
    }, 0);
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    if (authPassword.length < 8) {
      setAuthError('Use at least 8 characters.');
      return;
    }
    setAuthLoading(true);
    markAnonymousCarryOver();
    try {
      if (authMode === 'signup') {
        const { error } = await signUp(authEmail, authPassword, structuredCV?.personal?.fullName);
        if (error) {
          setAuthError(error.message);
          setAuthLoading(false);
          return;
        }
        // Email sign-up needs verification before a session exists. The
        // resume intent (if any) is picked up when the confirmed user lands
        // on /dashboard, in this tab or a new one.
        setStep('verify-email');
        return;
      } else {
        const { error } = await signIn(authEmail, authPassword);
        if (error) {
          setAuthError(error.message === 'EMAIL_NOT_CONFIRMED'
            ? 'Please confirm your email, then log in.'
            : error.message);
          setAuthLoading(false);
          return;
        }
        clearFreeGenerationFlag();
      }
      // The resume effect takes over once the auth context has the user.
    } catch {
      setAuthError('Something went wrong. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogle = async () => {
    setAuthError(null);
    markAnonymousCarryOver();
    const { error } = await signInWithGoogle();
    if (error) setAuthError(error.message);
  };

  const score = typeof fitAnalysis?.score === 'number'
    ? fitAnalysis.score
    : currentSession?.matchScore;
  const fitLevel = fitAnalysis?.fitLevel || (typeof score === 'number' ? computeFitLevel(score) : undefined);
  const matchedRequirements = fitMatch?.matchedRequirements
    || fitAnalysis?.matchingSkills
    || currentSession?.matchingSkills
    || [];
  const missingRequirements = fitMatch?.missingSkills
    || fitAnalysis?.missingSkills
    || currentSession?.missingSkills
    || [];
  const strengths = matchedRequirements.slice(0, 3);
  const gaps = missingRequirements.slice(0, 2);
  const covered = matchedRequirements.length;
  const totalReqs = Math.max(covered + missingRequirements.length, covered);
  const reason = typeof fitAnalysis?.assessment === 'string'
    ? fitAnalysis.assessment.split('\n')[0].replace(/\*\*|__|`/g, '').trim()
    : covered
      ? `You cover ${covered} of ${totalReqs} requirements. Worth applying.`
      : 'Here is how you line up against this job.';

  const parseStages: NamedStage[] = parseStagesFromProgress(
    ['Opening the file', 'Picking out your experience and skills', 'Building your base CV'],
    parsePercent,
    ['PDF or Word', 'Roles, dates, tools, results', 'Clean, ATS-friendly, yours to edit'],
  );

  const fitPercent = v2Progress?.percent ?? (isAgentWorking ? 20 : 100);
  const fitStages: NamedStage[] = agentSteps.length > 0
    ? [
        {
          title: 'Reading the job ad',
          detail: 'Role, must-haves, nice-to-haves',
          state: agentSteps[0]?.status === 'completed' ? 'done' : agentSteps[0]?.status === 'running' ? 'active' : 'todo',
        },
        {
          title: 'Matching your skills',
          detail: 'Requirements covered',
          state: agentSteps[1]?.status === 'completed' ? 'done' : agentSteps[1]?.status === 'running' ? 'active' : agentSteps.length > 1 ? 'todo' : 'todo',
        },
        {
          title: 'Scoring the fit',
          detail: 'Strengths, gaps and a recommendation',
          state: agentSteps[2]?.status === 'completed' ? 'done' : agentSteps[2]?.status === 'running' || (isAgentWorking && agentSteps.length >= 2 && agentSteps[1]?.status === 'completed') ? 'active' : 'todo',
        },
      ]
    : parseStagesFromProgress(
        ['Reading the job ad', 'Matching your skills', 'Scoring the fit'],
        fitPercent,
        ['Role, must-haves, nice-to-haves', 'Requirements covered', 'Strengths, gaps and a recommendation'],
      );

  const kitPercent = v2Progress?.percent ?? (isAgentWorking ? 15 : 100);
  const kitStages: NamedStage[] = parseStagesFromProgress(
    ['Tailoring your CV', 'Writing the cover letter', 'Drafting the application email', 'Drafting the follow-up email'],
    kitPercent,
    ['Keywords from the ad, nothing invented', '', '', 'With the right day to send it'],
  );

  const lineErrorFeedback = lineError ? (
    <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
      <p className="text-sm text-red-600">{lineError}</p>
      {isCreditError && (
        <button
          type="button"
          onClick={() => openSettings('usage')}
          className="text-sm font-semibold text-navy-700 hover:text-navy-900 cursor-pointer"
        >
          Upgrade to Plus
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="flex h-full w-full min-w-0 min-h-0 flex-col bg-cream-100">
      <header className="flex h-[52px] flex-shrink-0 items-center gap-3 border-b border-cream-200 bg-cream-50 px-5">
        <BrandLogo variant="full" size="xs" theme="light" />
        <div className="flex-1" />
        {!user && (
          <button
            type="button"
            onClick={() => router.push('/auth/login')}
            className="px-2.5 text-sm font-medium text-navy-600 hover:text-navy-800 cursor-pointer"
          >
            Log in
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col items-center overflow-auto px-4 pb-16 pt-14">
        <GuidedStepper activeIndex={STEP_INDEX[step]} />

        {step === 'cv' && (
          <div className="mt-9 flex w-full max-w-[720px] flex-col gap-6">
            <div className="rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
              <h1 className="text-2xl font-semibold text-navy-800">Start with your CV</h1>
              {uploadError && (
                <p className="mt-3 text-sm text-red-600">{uploadError}</p>
              )}
              {pasteMode ? (
                <div className="mt-6">
                  <textarea
                    value={pastedCv}
                    onChange={(e) => setPastedCv(e.target.value)}
                    placeholder="Paste your full CV. Name, experience, skills, the lot."
                    className="h-52 w-full resize-none rounded-lg border border-cream-200 bg-white p-4 text-sm text-charcoal placeholder:text-warm-gray focus:border-gold-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handlePasteCv}
                    className="mt-4 inline-flex h-11 items-center rounded-full bg-gold-400 px-5 text-sm font-semibold text-white hover:bg-gold-500 cursor-pointer"
                  >
                    Use this text
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`mt-6 flex h-60 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-[#FBF7EE] ${
                    isDragActive ? 'border-gold-400' : 'border-gold-300'
                  }`}
                >
                  <input {...getInputProps()} />
                  <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white text-gold-500 shadow-sm">
                    <Upload className="h-[22px] w-[22px]" />
                  </span>
                  <p className="text-[15px] font-semibold text-navy-800">Drop your CV here</p>
                  <p className="text-[13px] text-warm-gray">
                    PDF or Word, up to {formatUploadLimit(maxSizeBytes)}
                  </p>
                  <button
                    type="button"
                    onClick={open}
                    className="mt-1 inline-flex h-11 items-center rounded-full bg-gold-400 px-5 text-sm font-semibold text-white hover:bg-gold-500 cursor-pointer"
                  >
                    Choose a file
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setPasteMode((v) => !v);
                  setUploadError(null);
                }}
                className="mt-6 w-full text-center text-[13px] font-medium text-navy-600 hover:text-navy-800 cursor-pointer"
              >
                {pasteMode ? 'Have a file? Upload it instead' : 'No file handy? Paste the text instead'}
              </button>
            </div>
            <p className="text-[13px] text-warm-gray">
              Free to try. Your first fit check is on us, no account needed.
            </p>
          </div>
        )}

        {step === 'cv-reading' && (
          <div className="mt-9 flex w-full max-w-[720px] flex-col gap-6">
            <div className="rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-navy-800">
                  Reading {fileName || 'your CV'}
                </h1>
                <div className="flex-1" />
                <span className="text-[13px] text-warm-gray">About 40 seconds</span>
              </div>
              <NamedStages stages={parseStages} percent={parsePercent} />
            </div>
            <div className="rounded-2xl border border-cream-200 bg-cream-50 p-8 shadow-sm">
              <p className="text-[15px] font-semibold text-navy-800">While I read, paste the job ad</p>
              <textarea
                value={jobText}
                onChange={(e) => {
                  setJobText(e.target.value);
                  pendingJobRef.current = e.target.value;
                }}
                placeholder="Paste the whole ad. Title, company and requirements, all of it."
                className="mt-4 h-24 w-full resize-none rounded-2xl border border-cream-200 bg-white px-4 py-3.5 text-sm text-charcoal placeholder:text-warm-gray focus:border-gold-300 focus:outline-none"
              />
            </div>
          </div>
        )}

        {step === 'job' && (
          <div className="mt-9 flex w-full max-w-[720px] flex-col gap-6">
            <div className="rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
              <h1 className="text-2xl font-semibold text-navy-800">
                Which job are you applying for?
              </h1>
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                placeholder="Paste the whole ad. Title, company and requirements, all of it."
                className="mt-6 h-[200px] w-full resize-none rounded-2xl border-2 border-gold-300 bg-white px-4 py-3.5 text-sm leading-relaxed text-charcoal placeholder:text-warm-gray shadow-[0_0_0_4px_rgba(212,168,83,0.12)] focus:outline-none"
              />
              {lineErrorFeedback}
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => startFit(jobText)}
                  disabled={jobText.trim().length < MIN_JD}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-gold-400 px-[22px] text-[15px] font-semibold text-white hover:bg-gold-500 disabled:bg-cream-200 disabled:text-warm-gray cursor-pointer disabled:cursor-not-allowed"
                >
                  <Search className="h-4 w-4" />
                  Check my fit
                  <span className="font-medium opacity-85">· {user ? `${CREDIT_COSTS.FIT_ANALYSIS} credits` : 'free'}</span>
                </button>
                <button
                  type="button"
                  onClick={startDirectKit}
                  disabled={jobText.trim().length < MIN_JD}
                  className="text-[13px] font-medium text-navy-600 hover:text-navy-800 cursor-pointer disabled:text-warm-gray"
                >
                  Skip the check, generate the full kit now
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-white">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span>
                  <strong>Your CV:</strong> {cvName}{cvTitle ? `, ${cvTitle}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setStep('cv')}
                  className="font-medium text-navy-600 hover:text-navy-800 cursor-pointer"
                >
                  Change
                </button>
              </div>
              <p className="text-warm-gray">
                Your first fit check is free. The full kit needs a free account, 4 credits included.
              </p>
            </div>
          </div>
        )}

        {step === 'fit-working' && (
          <div className="mt-9 w-full max-w-[720px] rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-navy-800">
                Checking your fit{companyName ? ` for ${companyName}` : ''}
              </h1>
              <div className="flex-1" />
              <span className="text-[13px] text-warm-gray">About 10 seconds left</span>
            </div>
            <NamedStages stages={fitStages} percent={fitPercent} />
          </div>
        )}

        {step === 'fit-result' && (
          <div className="mt-9 flex w-full max-w-[720px] flex-col gap-6">
            <div className="rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-5">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-semibold text-navy-800">
                    {fitHeading(fitLevel, companyName || jobTitle)}
                  </h1>
                  <p className="mt-1 text-sm text-warm-gray">{reason}</p>
                </div>
                {typeof score === 'number' && (
                  <div className="flex h-[84px] w-[84px] flex-shrink-0 flex-col items-center justify-center rounded-full border-4 border-gold-400 bg-[#FBF7EE]">
                    <span className="text-[26px] font-semibold leading-none text-navy-800">{Math.round(score)}%</span>
                    <span className="mt-1 text-[10px] font-semibold tracking-[0.06em] text-gold-600">MATCH</span>
                  </div>
                )}
              </div>
              <div className="my-6 h-px bg-cream-200" />
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#3A5A4C]">STRONG</span>
                  {strengths.length === 0 ? (
                    <p className="text-sm text-warm-gray">No matching skills listed.</p>
                  ) : strengths.map((item) => (
                    <div key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-charcoal">
                      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#EEF4F1] text-[#3A5A4C]">
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-gold-700">GAPS</span>
                  {gaps.length === 0 ? (
                    <p className="text-sm text-warm-gray">No major gaps listed.</p>
                  ) : gaps.map((item) => (
                    <div key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-charcoal">
                      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                        <span className="block h-0.5 w-2 rounded-sm bg-current" />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="my-6 h-px bg-cream-200" />
              {lineErrorFeedback}
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={startKit}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-gold-400 px-[22px] text-[15px] font-semibold text-white hover:bg-gold-500 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate the full kit
                  <span className="font-medium opacity-85">· {CREDIT_COSTS.GENERATION_AFTER_FIT} credits</span>
                </button>
                <p className="text-[13px] text-warm-gray">
                  {user
                    ? 'Tailored CV, cover letter and two emails, about 50 seconds.'
                    : 'Takes a free account first, 4 credits included, no card.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setJobText('');
                pendingJobRef.current = '';
                useAppStore.getState().updateCurrentSession({ pendingFitAnalysis: null });
                setStep('job');
              }}
              className="self-start text-[13px] font-medium text-navy-600 hover:text-navy-800 cursor-pointer"
            >
              Not this one? Try another job
            </button>
          </div>
        )}

        {step === 'signup' && (
          <div className="mt-9 w-full max-w-[720px] rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-navy-800">
              {authMode === 'signup' ? 'Create your free account to get the kit' : 'Log in to get the kit'}
            </h1>
            <p className="mt-1.5 text-sm text-warm-gray">
              {freeCheckUsed
                ? "You've used your free check. A free account runs this one, 4 credits included. Your CV and the job come with you."
                : authMode === 'signup'
                  ? '4 credits included. Your CV and this fit check come with you.'
                  : 'Your CV and this fit check come with you.'}
            </p>
            {authError && <p className="mt-4 text-sm text-red-600">{authError}</p>}
            <button
              type="button"
              onClick={() => void handleGoogle()}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-cream-200 bg-cream-50 text-[15px] font-semibold text-navy-800 shadow-sm hover:bg-white cursor-pointer"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.55 5.55 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
              </svg>
              Continue with Google
            </button>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-cream-200" />
              <span className="text-xs text-warm-gray">or</span>
              <span className="h-px flex-1 bg-cream-200" />
            </div>
            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-2.5">
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                className="h-12 rounded-lg border border-cream-200 bg-white px-3.5 text-sm text-charcoal placeholder:text-warm-gray focus:border-gold-300 focus:outline-none"
              />
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="h-12 rounded-lg border border-cream-200 bg-white px-3.5 text-sm text-charcoal placeholder:text-warm-gray focus:border-gold-300 focus:outline-none"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-gold-400 text-[15px] font-semibold text-white hover:bg-gold-500 disabled:opacity-60 cursor-pointer"
              >
                {authLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : authMode === 'signup' ? 'Create account and generate the kit' : 'Log in and generate the kit'}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-warm-gray">
              By continuing you agree to the{' '}
              <Link href="/terms" className="font-semibold text-navy-800 hover:text-navy-600">
                Terms
              </Link>
              {' and '}
              <Link href="/privacy" className="font-semibold text-navy-800 hover:text-navy-600">
                Privacy policy
              </Link>
              .
            </p>
            <p className="mt-4 text-center text-xs text-warm-gray">
              {authMode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode((m) => (m === 'signup' ? 'login' : 'signup'));
                  setAuthError(null);
                }}
                className="font-medium text-navy-600 hover:text-navy-800 cursor-pointer"
              >
                {authMode === 'signup' ? 'Log in' : 'Create an account'}
              </button>
            </p>
          </div>
        )}

        {step === 'verify-email' && (
          <div className="mt-9 w-full max-w-[720px] rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-navy-800">Check your inbox</h1>
            <p className="mt-3 text-sm text-warm-gray">
              We sent a confirmation link to <strong className="text-navy-800">{authEmail}</strong>. Open it and your kit
              {companyName ? ` for ${companyName}` : ''} starts building the moment you land back here.
            </p>
            <p className="mt-5 text-xs text-warm-gray">Nothing there? Check your spam folder.</p>
          </div>
        )}

        {step === 'kit-working' && askingLogistics && (
          <LogisticsQuestions
            layout="line"
            saveLabel="Save and create my kit"
            onResolved={(outcome) => {
              const notice = resumeAfterLogistics(outcome);
              if (notice) {
                setLogisticsNotice(notice);
                return;
              }
              // Nothing ran (the parked kit belongs to another application now, or another run is
              // working), so "Building" would never end: go back to where the user came from.
              kitStartedRef.current = false;
              setLineError("We couldn't start your kit. Try again.");
              setStep(stepAfterDroppedResume(Boolean(pendingFit)));
            }}
          />
        )}
        <p role="status" aria-live="polite" className="sr-only">{logisticsNotice}</p>

        {step === 'kit-working' && !askingLogistics && (
          <div className="mt-9 w-full max-w-[720px] rounded-2xl border border-cream-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-navy-800">
                Building your kit{companyName ? ` for ${companyName}` : ''}
              </h1>
              <div className="flex-1" />
              <span className="text-[13px] text-warm-gray">About 30 seconds left</span>
            </div>
            <NamedStages stages={kitStages} percent={kitPercent} />
            <div className="mt-6 h-px bg-cream-200" />
            <p className="mt-5 text-sm text-warm-gray">
              When this finishes your workspace opens with everything in it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

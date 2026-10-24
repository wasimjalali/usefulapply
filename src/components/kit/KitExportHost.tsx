'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { promptAccountToDownload } from '@/components/kit/account-wall';
import { useToast } from '@/components/ui/Toast';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { sessionHasKit } from '@/components/shell/application-status';
import { useUIStore } from '@/store/useUIStore';
import { buildCvData } from '@/lib/cv-templates/build-cv-data';
import { readDefaultTemplate } from '@/lib/cv-templates/default-template';
import { downloadBlob } from '@/lib/utils/download-pdf';
import { buildTextBlob, formatEmailAsText, kitFilename } from '@/lib/utils/kit-export';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { formatCoverLetterAsText } from '@/lib/utils/cover-letter-export';
import { exportFailure, isSavedApplicationId, serverExport, ServerExportError, trackExportFailure, type ServerExportFormat } from '@/lib/utils/server-export';

/**
 * Always mounted in the shell. Runs "Download all" for whichever control asked
 * (the canvas "Download all" button): tailored CV (PDF),
 * cover letter (PDF + DOCX), both emails (TXT) and the screening answers (PDF)
 * when present. The server renders every PDF and DOCX, so this works from any
 * tab, a collapsed canvas included. Nothing renders here.
 */
export function KitExportHost() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const structuredCV = useCVStore((s) => s.structuredCV);
  const profilePhoto = useCVStore((s) => s.profilePhoto);
  const currentSession = useSessionStore((s) => s.currentSession);
  const cvTemplateId = useUIStore((s) => s.cvTemplateId);
  const setCvTemplateId = useUIStore((s) => s.setCvTemplateId);
  const kitDownloadRequest = useUIStore((s) => s.kitDownloadRequest);
  const setKitDownloadBusy = useUIStore((s) => s.setKitDownloadBusy);
  const requestKitDownload = useUIStore((s) => s.requestKitDownload);
  const handledRequestRef = useRef(0);
  const busyRef = useRef(false);

  // The store seeds the template with the fallback so SSR and the first client
  // render agree; the saved default lands here, once, on the client.
  useEffect(() => {
    const saved = readDefaultTemplate();
    if (saved !== useUIStore.getState().cvTemplateId) setCvTemplateId(saved);
  }, [setCvTemplateId]);

  const hasTailored = Boolean(currentSession?.optimizedCVData);
  const cvData = useMemo(() => (hasTailored
    ? buildCvData({
        structuredCV,
        optimizedCVData: currentSession?.optimizedCVData,
        showOptimized: true,
        photoDataUrl: profilePhoto?.dataUrl,
        profile,
      })
    : null), [hasTailored, structuredCV, currentSession?.optimizedCVData, profilePhoto?.dataUrl, profile]);

  useEffect(() => {
    if (kitDownloadRequest === handledRequestRef.current) return;
    handledRequestRef.current = kitDownloadRequest;
    if (busyRef.current) return;
    const session = useSessionStore.getState().currentSession;
    if (!session || !sessionHasKit(session)) {
      toast.error('Nothing to download yet.');
      return;
    }
    if (!user) {
      // Still finding out who is signed in: a signed-in user must never see the account wall.
      if (!authLoading) promptAccountToDownload(toast, router.push, 'kit');
      return;
    }
    if (!isSavedApplicationId(session.id)) {
      // A signed-in kit built locally gets its stored row a moment after it lands (useSupabaseSync).
      toast.error("This application is still saving. Try again in a moment, or reload the page if it doesn't download.");
      return;
    }

    const run = async () => {
      busyRef.current = true;
      setKitDownloadBusy(true);
      const applicant = cvData?.personal.fullName || structuredCV?.personal.fullName || 'Applicant';
      const company = session.company || '';
      const files: Array<{ blob: Blob; name: string }> = [];
      const failed: string[] = [];
      let delivered = 0;
      // Every export error, so the message can say whether trying again can help.
      const errors: unknown[] = [];

      const fromServer = async (
        format: ServerExportFormat,
        extra: Record<string, unknown>,
      ): Promise<{ blob: Blob; name: string }> => {
        try {
          const { blob, fileName } = await serverExport({ applicationId: session.id, format, ...extra });
          return { blob, name: fileName };
        } catch (err) {
          trackExportFailure(format, err);
          errors.push(err);
          throw err;
        }
      };
      const letter = session.coverLetter;
      const letterBody = (() => {
        if (!letter) return {};
        const structured = (letter as { structured?: unknown }).structured;
        return isStructuredCoverLetter(structured)
          ? { structuredLetter: structured }
          : { legacyLetterText: formatCoverLetterAsText(letter) };
      })();

      try {
        if (cvData) {
          try {
            files.push(await fromServer('cv_pdf', { templateId: cvTemplateId, variant: 'tailored', cv: cvData }));
          } catch (err) {
            console.error('[DownloadAll] CV PDF failed:', err);
            failed.push('CV');
          }
        } else if (!session.kitDocumentErrors?.cv) {
          // No tailored structured CV to render: never ship the original under a tailored name.
          // A CV that failed in the kit run is already named on its tab, so it is not a download failure.
          failed.push('CV');
        }
        if (session.coverLetter) {
          try {
            files.push(await fromServer('cover_letter_pdf', letterBody));
          } catch (err) {
            console.error('[DownloadAll] cover letter PDF failed:', err);
            failed.push('cover letter PDF');
          }
          try {
            files.push(await fromServer('cover_letter_docx', letterBody));
          } catch (err) {
            console.error('[DownloadAll] cover letter DOCX failed:', err);
            failed.push('cover letter Word file');
          }
        }
        try {
          if (session.email) {
            files.push({ blob: buildTextBlob(formatEmailAsText(session.email)), name: kitFilename(applicant, company, 'Application_Email', 'txt') });
          }
          if (session.followUpEmail) {
            files.push({ blob: buildTextBlob(formatEmailAsText(session.followUpEmail)), name: kitFilename(applicant, company, 'Follow_Up_Email', 'txt') });
          }
        } catch (err) {
          console.error('[DownloadAll] emails failed:', err);
          failed.push('emails');
        }
        if (session.screeningAnswers && session.screeningAnswers.length > 0) {
          try {
            files.push(await fromServer('answers_pdf', { answers: session.screeningAnswers.map((item) => ({ question: item.question, answer: item.answer })) }));
          } catch (err) {
            console.error('[DownloadAll] answers PDF failed:', err);
            failed.push('answers');
          }
        }

        // One file per download. The browser asks once to allow several.
        for (const file of files) {
          await downloadBlob(file.blob, file.name);
          delivered += 1;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        // A CV that failed in the kit run was never tailored, so it is left
        // out on purpose rather than shipped as the original under a tailored name.
        const untailoredCvNote = session.kitDocumentErrors?.cv && !cvData
          ? " The CV wasn't tailored, so it was left out. Download your base CV from the CV tab."
          : '';
        if (delivered === 0) {
          const hasStatus = (status: number) => errors.some((err) => err instanceof ServerExportError && err.status === status);
          const canRetry = errors.some((err) => exportFailure(err, 'file').retryable);
          const retry = [{ label: 'Try again', onClick: requestKitDownload }];
          if (hasStatus(401)) {
            toast.error('Nothing downloaded. Your session expired. Sign in again to download.', 8000);
          } else if (hasStatus(429)) {
            toast.error('Nothing downloaded. Too many downloads at once. Try again in a minute.', 10000, retry);
          } else if (canRetry) {
            toast.error(`Nothing downloaded. The ${joinList(failed)} didn't build.${untailoredCvNote}`, 10000, retry);
          } else if (errors.length > 0) {
            toast.error(`Nothing downloaded. The ${joinList(failed)} couldn't be exported.${untailoredCvNote}`, 8000);
          } else if (failed.length > 0) {
            toast.error(`Nothing downloaded. The ${joinList(failed)} didn't build.${untailoredCvNote}`, 8000);
          } else {
            toast.error(`Nothing to download yet.${untailoredCvNote}`, 8000);
          }
        } else if (failed.length > 0) {
          toast.warning(`Downloaded ${fileCount(delivered)}. The ${joinList(failed)} didn't build. ${fromTabsSentence(failed)}${untailoredCvNote}`, 8000);
        } else if (untailoredCvNote) {
          toast.warning(`Downloaded ${fileCount(delivered)}.${untailoredCvNote}`, 8000);
        } else {
          toast.success(`Downloaded ${fileCount(delivered)}.`);
        }
      } catch (err) {
        console.error('[DownloadAll] failed:', err);
        toast.error(delivered > 0
          ? `Downloaded ${fileCount(delivered)}, then the download stopped. Try again for the rest.`
          : 'The download didn\'t start. Try again in a moment.');
      } finally {
        busyRef.current = false;
        setKitDownloadBusy(false);
      }
    };
    void run();
    // cvData/structuredCV/cvTemplateId are read at click time; the tick is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitDownloadRequest]);

  return null;
}

/** Kit parts named in plural: "the emails", "the answers". */
const PLURAL_PARTS = new Set(['emails', 'answers']);

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The tab each kit part lives on: both cover letter files share one. */
function tabOf(part: string): string {
  return part.startsWith('cover letter') ? 'cover letter' : part;
}

/** "Download it from its tab." for one singular part, "them" for a plural part or several, "tabs" for several tabs. */
function fromTabsSentence(failed: string[]): string {
  if (new Set(failed.map(tabOf)).size > 1) return 'Download them from their tabs.';
  return failed.length > 1 || PLURAL_PARTS.has(failed[0]) ? 'Download them from their tab.' : 'Download it from its tab.';
}

function fileCount(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CVTemplateRenderer } from '@/components/cv-templates';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { sessionHasKit } from '@/components/shell/application-status';
import { useUIStore } from '@/store/useUIStore';
import { buildCvData } from '@/lib/cv-templates/build-cv-data';
import { readDefaultTemplate } from '@/lib/cv-templates/default-template';
import { generateCvPdfBlob } from '@/lib/utils/cv-pdf';
import { downloadBlob } from '@/lib/utils/download-pdf';
import { buildCoverLetterDocxBlob, buildCoverLetterPdfBlob } from '@/lib/utils/cover-letter-export';
import { buildAnswersPdfBlob, buildTextBlob, formatEmailAsText, kitFilename } from '@/lib/utils/kit-export';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { formatCoverLetterAsText } from '@/lib/utils/cover-letter-export';
import { FALLBACK_NOTICE, serverExport, shouldFallBack, trackExportFallback, type ServerExportFormat } from '@/lib/utils/server-export';

/**
 * Always mounted in the shell. Runs "Download all" for whichever control asked
 * (the canvas button or the chat's "Download the kit" chip): tailored CV (PDF),
 * cover letter (PDF + DOCX), both emails (TXT) and the screening answers (PDF)
 * when present. The CV renders offscreen here so the PDF works from any tab,
 * a collapsed canvas included.
 */
export function KitExportHost() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const structuredCV = useCVStore((s) => s.structuredCV);
  const profilePhoto = useCVStore((s) => s.profilePhoto);
  const currentSession = useSessionStore((s) => s.currentSession);
  const cvTemplateId = useUIStore((s) => s.cvTemplateId);
  const setCvTemplateId = useUIStore((s) => s.setCvTemplateId);
  const kitDownloadRequest = useUIStore((s) => s.kitDownloadRequest);
  const setKitDownloadBusy = useUIStore((s) => s.setKitDownloadBusy);
  const cvRef = useRef<HTMLDivElement>(null);
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

    const run = async () => {
      busyRef.current = true;
      setKitDownloadBusy(true);
      const applicant = cvData?.personal.fullName || structuredCV?.personal.fullName || 'Applicant';
      const company = session.company || '';
      const files: Array<{ blob: Blob; name: string }> = [];
      const failed: string[] = [];
      let delivered = 0;
      let usedFallback = false;

      // Server first (full quality), the browser export when the server cannot render.
      const fromServer = async (
        format: ServerExportFormat,
        extra: Record<string, unknown>,
      ): Promise<{ blob: Blob; name: string } | null> => {
        try {
          const { blob, fileName } = await serverExport({ applicationId: session.id, format, ...extra });
          return { blob, name: fileName };
        } catch (err) {
          if (!shouldFallBack(err)) throw err;
          trackExportFallback(format, err);
          usedFallback = true;
          return null;
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
            const served = await fromServer('cv_pdf', { templateId: cvTemplateId, variant: 'tailored', cv: cvData });
            if (served) {
              files.push(served);
            } else if (cvRef.current) {
              const blob = await generateCvPdfBlob(cvRef.current, { templateId: cvTemplateId, photoUrl: cvData.personal.photoUrl });
              files.push({ blob, name: kitFilename(applicant, company, 'CV', 'pdf') });
            } else {
              failed.push('CV');
            }
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
            files.push(
              (await fromServer('cover_letter_pdf', letterBody))
                ?? { blob: buildCoverLetterPdfBlob(session.coverLetter), name: kitFilename(applicant, company, 'Cover_Letter', 'pdf') },
            );
            files.push(
              (await fromServer('cover_letter_docx', letterBody))
                ?? { blob: await buildCoverLetterDocxBlob(session.coverLetter), name: kitFilename(applicant, company, 'Cover_Letter', 'docx') },
            );
          } catch (err) {
            console.error('[DownloadAll] cover letter failed:', err);
            failed.push('cover letter');
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
            files.push(
              (await fromServer('answers_pdf', { answers: session.screeningAnswers.map((item) => ({ question: item.question, answer: item.answer })) }))
                ?? { blob: buildAnswersPdfBlob(session.screeningAnswers, company), name: kitFilename(applicant, company, 'Screening_Answers', 'pdf') },
            );
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
          toast.error(failed.length > 0
            ? `Nothing downloaded. The ${joinList(failed)} didn't build.${untailoredCvNote}`
            : `Nothing to download yet.${untailoredCvNote}`, 8000);
        } else if (failed.length > 0) {
          toast.warning(`Downloaded ${fileCount(delivered)}. The ${joinList(failed)} didn't build. ${fromTabsSentence(failed)}${untailoredCvNote}`, 8000);
        } else if (untailoredCvNote) {
          toast.warning(`Downloaded ${fileCount(delivered)}.${untailoredCvNote}`, 8000);
        } else if (usedFallback) {
          toast.warning(`Downloaded ${fileCount(delivered)}. ${FALLBACK_NOTICE}`, 8000);
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

  if (!cvData) return null;

  return (
    // Fixed, not absolute. Absolute keeps this 1500px-tall CV inside the
    // shell's scrollable overflow, so the first focus or scrollIntoView after
    // a kit loads scrolled the overflow-hidden shell and pushed the whole app
    // off the top of the screen. Fixed takes it out of that box entirely.
    <div aria-hidden className="pointer-events-none fixed left-[-10000px] top-0 z-[-1]">
      <div ref={cvRef} className="bg-white">
        <CVTemplateRenderer data={cvData} templateId={cvTemplateId} />
      </div>
    </div>
  );
}

/** Kit parts named in plural: "the emails", "the answers". */
const PLURAL_PARTS = new Set(['emails', 'answers']);

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Download it from its tab." for one singular part, "them" for a plural part or several. */
function fromTabsSentence(failed: string[]): string {
  if (failed.length > 1) return 'Download them from their tabs.';
  return PLURAL_PARTS.has(failed[0]) ? 'Download them from their tab.' : 'Download it from its tab.';
}

function fileCount(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

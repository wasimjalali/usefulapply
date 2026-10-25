import type { ApplicationSession } from '@/store/useSessionStore';

export type ApplicationStatusLabel = 'Now' | 'Kit ready' | 'Drafted' | 'Applied';

/**
 * A kit exists once any of its documents does. A partial kit (the CV failed
 * but the letter and emails came back, say) is still a kit the user can open
 * and finish from each tab, so it never reads as missing or failed.
 */
export function sessionHasKit(session: ApplicationSession | null | undefined): boolean {
  return Boolean(session?.generatedCV || session?.coverLetter || session?.email || session?.followUpEmail);
}

/**
 * The tailored CV exists, in either of the shapes a session can hold it.
 * Screening answers are stored with it, so screening is offered only then.
 */
export function hasTailoredCv(session: ApplicationSession | null | undefined): boolean {
  return Boolean(session?.generatedCV || session?.optimizedCVData);
}

export function deriveApplicationStatus(
  session: ApplicationSession,
  options: { isCurrent: boolean; isWorking?: boolean },
): ApplicationStatusLabel {
  if (options.isCurrent && (options.isWorking || !sessionHasKit(session))) {
    return 'Now';
  }
  if (sessionHasKit(session)) {
    return 'Kit ready';
  }
  return 'Drafted';
}

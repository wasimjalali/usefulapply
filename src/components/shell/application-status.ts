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

export function statusPillClass(status: ApplicationStatusLabel): string {
  if (status === 'Drafted') {
    return 'bg-gold-100 text-gold-700';
  }
  if (status === 'Applied') {
    return 'bg-[#EEF4F1] text-[#3A5A4C]';
  }
  return 'bg-[#E8EDF4] text-navy-800';
}

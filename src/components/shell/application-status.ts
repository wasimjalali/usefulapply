import type { ApplicationSession } from '@/store/useSessionStore';

export type ApplicationStatusLabel = 'Now' | 'Kit ready' | 'Drafted' | 'Applied';

export function sessionHasKit(session: ApplicationSession | null | undefined): boolean {
  return Boolean(session?.generatedCV);
}

export function deriveApplicationStatus(
  session: ApplicationSession,
  options: { isCurrent: boolean; isWorking?: boolean },
): ApplicationStatusLabel {
  if (options.isCurrent && (options.isWorking || !session.generatedCV)) {
    return 'Now';
  }
  if (session.generatedCV) {
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

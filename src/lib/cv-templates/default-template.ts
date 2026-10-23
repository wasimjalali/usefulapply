const TEMPLATE_KEY = 'usefulapply-default-template';

export const FALLBACK_TEMPLATE_ID = 'premium-ats';

/** The user's saved default CV template. */
export function readDefaultTemplate(): string {
  if (typeof window === 'undefined') return FALLBACK_TEMPLATE_ID;
  try {
    const next = localStorage.getItem(TEMPLATE_KEY);
    if (next) return next;
  } catch {
    // ignore
  }
  return FALLBACK_TEMPLATE_ID;
}

export function writeDefaultTemplate(id: string): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, id);
  } catch {
    // ignore
  }
}

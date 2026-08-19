const TEMPLATE_KEY = 'usefulapply-default-template';
const TEMPLATE_KEY_OLD = 'karko-default-template';

export const FALLBACK_TEMPLATE_ID = 'premium-ats';

/** The user's saved default CV template. Migrates the pre-rebrand key once. */
export function readDefaultTemplate(): string {
  if (typeof window === 'undefined') return FALLBACK_TEMPLATE_ID;
  try {
    const next = localStorage.getItem(TEMPLATE_KEY);
    if (next) return next;
    const prev = localStorage.getItem(TEMPLATE_KEY_OLD);
    if (prev) {
      localStorage.setItem(TEMPLATE_KEY, prev);
      return prev;
    }
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

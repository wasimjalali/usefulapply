const ANON_GENERATION_KEY = 'usefulapply_anonymous_generation_used';
const ANON_GENERATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Check if anonymous user has already used their free generation */
export function hasUsedFreeGeneration(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(ANON_GENERATION_KEY);
    const usedAt = Number(stored);
    if (Number.isFinite(usedAt) && usedAt > 0) {
      if (Date.now() - usedAt < ANON_GENERATION_TTL_MS) return true;
      localStorage.removeItem(ANON_GENERATION_KEY);
    }
    if (stored === 'true') {
      localStorage.setItem(ANON_GENERATION_KEY, String(Date.now()));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Mark that anonymous user has used their free generation */
export function markFreeGenerationUsed(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ANON_GENERATION_KEY, String(Date.now()));
}

/** Clear the free generation flag (called on successful signup) */
export function clearFreeGenerationFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ANON_GENERATION_KEY);
}

// Set by the guided line's sign-up card right before auth starts. It tells
// AuthContext that the anonymous CV and fit check in this browser belong to
// the person signing in and should carry over into the account. Without it,
// a first sign-in on an anonymous browser drops the anonymous data.
const CARRY_KEY = 'usefulapply_carry_anonymous';
const CARRY_TTL_MS = 2 * 60 * 60 * 1000;

export function markAnonymousCarryOver(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CARRY_KEY, String(Date.now()));
}

/**
 * An auth form opened from anywhere but an account wall clears the marker on submit, so a marker
 * someone left behind (they clicked the wall, then walked away) can never hand their CV and fit
 * check to the next person who signs in on this browser.
 */
export function clearAnonymousCarryOver(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CARRY_KEY);
}

/** `?keep=1` on /auth/signup and /auth/login: the page was opened from an account wall. */
export const KEEP_ANONYMOUS_PARAM = 'keep';

/** Set or clear the marker for an auth attempt, depending on whether it started at an account wall. */
export function prepareAnonymousCarryOver(fromWall: boolean): void {
  if (fromWall) markAnonymousCarryOver();
  else clearAnonymousCarryOver();
}

// The account a tab handed this browser's anonymous work to, written by the tab that consumed the
// marker. Another tab that held the same anonymous work in memory keeps it only for that account.
const GRANT_KEY = 'usefulapply_carry_granted';

export function grantAnonymousCarryOver(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GRANT_KEY, userId);
}

export function anonymousCarryGrantedTo(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(GRANT_KEY) === userId;
}

export function clearAnonymousCarryGrant(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GRANT_KEY);
}

/** Reads and clears the marker. True only if it was set within the TTL. */
export function consumeAnonymousCarryOver(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(CARRY_KEY);
  localStorage.removeItem(CARRY_KEY);
  const at = Number(raw);
  return Number.isFinite(at) && at > 0 && Date.now() - at < CARRY_TTL_MS;
}

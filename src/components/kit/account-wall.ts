import { KEEP_ANONYMOUS_PARAM } from '@/lib/anonymous-generation';

interface InfoToast {
  info: (message: string, duration?: number, actions?: Array<{ label: string; onClick: () => void }>) => void;
}

const WALL_MS = 15000;
// Rapid repeat clicks show one wall, not a stack; a click after closing it shows it again.
const REPEAT_MS = 3000;
let shownAt = 0;

/** The wall's sign-up and log-in links. keep=1 carries this browser's CV and fit check into the account. */
export function accountWallHref(page: 'signup' | 'login'): string {
  return `/auth/${page}?${KEEP_ANONYMOUS_PARAM}=1`;
}

/**
 * An anonymous visitor asked for a download. Downloads render on the server for a signed-in user, so they
 * need an account. The links carry keep=1 (see consumeAnonymousCarryOver in AuthContext).
 */
export function promptAccountToDownload(toast: InfoToast, push: (href: string) => void, what: 'kit' | 'CV'): void {
  if (Date.now() - shownAt < REPEAT_MS) return;
  shownAt = Date.now();
  toast.info(`Create a free account to download your ${what}.`, WALL_MS, [
    { label: 'Create a free account', onClick: () => push(accountWallHref('signup')) },
    { label: 'Log in', onClick: () => push(accountWallHref('login')) },
  ]);
}

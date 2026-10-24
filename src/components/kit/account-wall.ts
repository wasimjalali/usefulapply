import { KEEP_ANONYMOUS_PARAM } from '@/lib/anonymous-generation';

interface InfoToast {
  info: (message: string, duration?: number, actions?: Array<{ label: string; onClick: () => void }>) => void;
}

/**
 * An anonymous visitor asked for a download. Downloads render on the server for a saved application,
 * so they need an account. The sign-up and log-in links carry keep=1: the CV and fit check in this
 * browser come along into the account (see consumeAnonymousCarryOver in AuthContext).
 */
export function promptAccountToDownload(toast: InfoToast, push: (href: string) => void, what: 'kit' | 'CV'): void {
  toast.info(`Create a free account to download your ${what}.`, 15000, [
    { label: 'Create a free account', onClick: () => push(`/auth/signup?${KEEP_ANONYMOUS_PARAM}=1`) },
    { label: 'Log in', onClick: () => push(`/auth/login?${KEEP_ANONYMOUS_PARAM}=1`) },
  ]);
}

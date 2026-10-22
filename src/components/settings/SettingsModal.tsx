'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Bell, BarChart3, FileText, Plug, Settings, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsStore, isSettingsPane, type SettingsPane } from '@/store/useSettingsStore';
import { GeneralPane } from '@/components/settings/GeneralPane';
import { CvDocumentsPane } from '@/components/settings/CvDocumentsPane';
import { UsageBillingPane } from '@/components/settings/UsageBillingPane';
import { NotificationsPane } from '@/components/settings/NotificationsPane';
import { ConnectedAppsPane } from '@/components/settings/ConnectedAppsPane';

const NAV: Array<{ pane: SettingsPane; label: string; icon: typeof Settings }> = [
  { pane: 'general', label: 'General', icon: Settings },
  { pane: 'cv', label: 'CV', icon: FileText },
  { pane: 'usage', label: 'Usage & Billing', icon: BarChart3 },
  { pane: 'notifications', label: 'Notifications', icon: Bell },
  { pane: 'apps', label: 'Connected apps', icon: Plug },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isCheckoutReturn(params: URLSearchParams): boolean {
  return (params.get('success') === 'true' || params.get('addon_success') === 'true')
    && Boolean(params.get('session_id'));
}

function clearCheckoutReturnParams(): void {
  const params = new URLSearchParams(window.location.search);
  for (const key of ['settings', 'success', 'addon_success', 'session_id', 'plan']) {
    params.delete(key);
  }
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

export function SettingsModal() {
  const { user, isLoading } = useAuth();
  const isOpen = useSettingsStore((s) => s.isOpen);
  const pane = useSettingsStore((s) => s.pane);
  const open = useSettingsStore((s) => s.open);
  const close = useSettingsStore((s) => s.close);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Deep link: ?settings=usage opens the modal on that pane, then the param
  // is dropped so a normal refresh does not reopen it. Checkout return params
  // stay until billing confirms the webhook, so feedback survives a refresh.
  // /settings, /profile and
  // /account all land here, so a signed-out visitor gets the param too. There
  // is nothing to show them, so wait for the session and drop the param
  // without opening.
  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const checkoutReturn = isCheckoutReturn(params);
    if (!user && checkoutReturn) {
      clearCheckoutReturnParams();
      return;
    }
    const requested = params.get('settings') ?? (checkoutReturn ? 'usage' : null);
    if (!isSettingsPane(requested)) return;
    if (user) {
      open(requested);
      if (checkoutReturn) return;
    }
    params.delete('settings');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, [open, user, isLoading]);

  // A session that ends while the modal is open leaves a panel showing
  // "Sign out" and a balance for nobody.
  useEffect(() => {
    if (!isLoading && !user && isOpen) close();
  }, [isLoading, user, isOpen, close]);

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (isCheckoutReturn(params)) clearCheckoutReturnParams();
    close();
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === firstItem || !node.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      returnFocusRef.current?.focus();
    };
  }, [isOpen, handleClose]);

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={handleClose}
        className="absolute inset-0 h-full w-full cursor-default bg-navy-900/35"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-pane-heading"
        className="relative flex h-[660px] max-h-full w-[980px] max-w-full overflow-hidden rounded-[24px] bg-white shadow-lg"
      >
        <nav className="hidden w-[220px] flex-shrink-0 flex-col gap-1 bg-cream-100 p-3 md:flex">
          {NAV.map((item) => {
            const active = item.pane === pane;
            return (
              <button
                key={item.pane}
                type="button"
                onClick={() => open(item.pane)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors duration-200 cursor-pointer ${
                  active
                    ? 'bg-white text-navy-800 shadow-sm'
                    : 'text-warm-gray hover:text-navy-700'
                }`}
              >
                <item.icon className={`h-4 w-4 ${active ? 'text-gold-500' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close settings"
            className="absolute right-6 top-7 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-warm-gray ring-4 ring-white hover:bg-cream-100 hover:text-navy-800 md:right-8 cursor-pointer"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="flex gap-2 px-6 pt-5 pb-2 md:hidden">
            {NAV.map((item) => (
              <button
                key={item.pane}
                type="button"
                onClick={() => open(item.pane)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 cursor-pointer ${
                  item.pane === pane ? 'bg-white text-navy-800 shadow-sm' : 'text-warm-gray'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-8 md:px-8 md:pt-7">
            {pane === 'general' && <GeneralPane />}
            {pane === 'cv' && <CvDocumentsPane />}
            {pane === 'usage' && <UsageBillingPane />}
            {pane === 'notifications' && <NotificationsPane />}
            {pane === 'apps' && <ConnectedAppsPane />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;

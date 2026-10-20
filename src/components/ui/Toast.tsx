'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** A notice that stays until the user deals with it (see `pin`). */
export interface PinnedToast {
  message: string;
  /** A short line above the message, such as which application it is about. */
  heading?: string;
  /** A smaller line under the message. */
  detail?: string;
  actions: ToastAction[];
  /** Called when the user confirms they want to discard what the notice holds. */
  onDiscard: () => void;
}

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  actions?: ToastAction[];
  /** Set for a pinned toast: one per key, never closes by itself. */
  pin?: PinnedToast & { key: string };
}

interface ToastContextValue {
  toasts: Toast[];
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    /** `actions` render as small buttons under the message; clicking one closes the toast. */
    info: (message: string, duration?: number, actions?: ToastAction[]) => void;
    /**
     * A notice with no timer, one per `key` (a second call with the same key replaces it).
     * It closes when one of its actions is clicked or the user dismisses it and confirms in place.
     */
    pin: (key: string, notice: PinnedToast) => void;
    unpin: (key: string) => void;
  };
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Clean up all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(t => clearTimeout(t));
      timeoutRefs.current.clear();
    };
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 5000, actions?: ToastAction[]) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: Toast = { id, type, message, duration, actions };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        const timeout = setTimeout(() => {
          removeToast(id);
          timeoutRefs.current.delete(id);
        }, duration);
        timeoutRefs.current.set(id, timeout);
      }
    },
    [removeToast]
  );

  const pin = useCallback((key: string, notice: PinnedToast) => {
    // A replaced notice gets a new id, so it is a fresh item and an open "Discard your text?" question starts over.
    const next: Toast = { id: `pin:${key}:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'info', message: notice.message, duration: 0, pin: { ...notice, key } };
    setToasts((prev) => (prev.some((t) => t.pin?.key === key) ? prev.map((t) => (t.pin?.key === key ? next : t)) : [...prev, next]));
  }, []);

  const unpin = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.pin?.key !== key));
  }, []);

  const toast = {
    pin,
    unpin,
    success: (message: string, duration?: number) => addToast('success', message, duration),
    error: (message: string, duration?: number) => addToast('error', message, duration),
    warning: (message: string, duration?: number) => addToast('warning', message, duration),
    info: (message: string, duration?: number, actions?: ToastAction[]) => addToast('info', message, duration, actions),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-28 left-4 z-[9999] flex flex-col gap-2 max-w-sm md:max-w-md" style={{ maxWidth: 'calc(max(200px, 100vw - 500px))' }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

const toastStyles: Record<ToastType, { bg: string; icon: typeof CheckCircle; iconColor: string }> = {
  success: { bg: 'bg-navy-700 border-navy-600 text-cream-50', icon: CheckCircle, iconColor: 'text-gold-400' },
  error: { bg: 'bg-red-50 border-red-200', icon: XCircle, iconColor: 'text-red-500' },
  warning: { bg: 'bg-cream-100 border-gold-300', icon: AlertTriangle, iconColor: 'text-gold-500' },
  info: { bg: 'bg-navy-700 border-navy-600 text-cream-50', icon: Info, iconColor: 'text-cream-200' },
};

function ToastItem({ toast, onClose }: ToastItemProps) {
  const style = toastStyles[toast.type];
  const Icon = style.icon;
  // A pinned toast asks before it throws the user's text away. The viewer has no confirm().
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${style.bg} animate-slide-in`}
      role="alert"
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${style.iconColor}`} />
      <div className="flex-1">
        {toast.pin?.heading && <p className="text-xs font-medium text-cream-200 mb-1">{toast.pin.heading}</p>}
        <p className={`text-sm ${toast.type === 'success' || toast.type === 'info' ? 'text-cream-50' : 'text-charcoal'}`}>{toast.message}</p>
        {toast.pin?.detail && <p className="mt-1 text-xs text-cream-200">{toast.pin.detail}</p>}
        {toast.pin && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-cream-50">Discard your text?</span>
                <button
                  onClick={() => { toast.pin?.onDiscard(); onClose(); }}
                  className="rounded border border-cream-200 px-2 py-1 text-xs text-cream-50 hover:bg-navy-600"
                >
                  Discard
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded border border-cream-200 px-2 py-1 text-xs text-cream-50 hover:bg-navy-600"
                >
                  Keep
                </button>
              </>
            ) : (
              <>
                {toast.pin.actions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => { action.onClick(); onClose(); }}
                    className="rounded border border-cream-200 px-2 py-1 text-xs text-cream-50 hover:bg-navy-600"
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  onClick={() => setConfirming(true)}
                  className="rounded px-2 py-1 text-xs text-cream-200 underline hover:text-white"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        )}
        {!toast.pin && toast.actions && toast.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {toast.actions.map((action) => (
              <button
                key={action.label}
                onClick={() => { action.onClick(); onClose(); }}
                className="rounded border border-cream-200 px-2 py-1 text-xs text-cream-50 hover:bg-navy-600"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!toast.pin && <button
        onClick={onClose}
        className={`p-0.5 rounded transition-colors ${toast.type === 'success' || toast.type === 'info' ? 'text-cream-200 hover:text-white' : 'text-warm-gray hover:text-charcoal'}`}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>}
    </div>
  );
}

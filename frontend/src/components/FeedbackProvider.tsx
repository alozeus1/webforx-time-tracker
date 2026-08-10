import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { FeedbackContext, type ConfirmOptions, type ToastOptions } from '../hooks/useFeedback';

type ToastItem = Required<ToastOptions> & { id: number; message: string };
type PendingConfirmation = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const toastIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export const FeedbackProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const nextToastId = useRef(0);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const toastTimers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const item: ToastItem = {
      id: ++nextToastId.current,
      message,
      tone: options.tone ?? 'info',
      durationMs: options.durationMs ?? 5000,
    };
    setToasts((current) => [...current, item]);
    toastTimers.current.set(item.id, window.setTimeout(() => dismissToast(item.id), item.durationMs));
  }, [dismissToast]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPendingConfirmation((current) => {
      current?.resolve(false);
      return { ...options, resolve };
    });
  }), []);

  const settleConfirmation = useCallback((confirmed: boolean) => {
    setPendingConfirmation((current) => {
      current?.resolve(confirmed);
      return null;
    });
    window.setTimeout(() => previouslyFocused.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!pendingConfirmation) return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        settleConfirmation(false);
      }
      if (event.key === 'Tab') {
        const dialog = cancelButtonRef.current?.closest('[role="alertdialog"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingConfirmation, settleConfirmation]);

  useEffect(() => () => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    toastTimers.current.clear();
  }, []);

  const contextValue = useMemo(() => ({ toast, confirm }), [confirm, toast]);

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-atomic="false">
        {toasts.map((item) => {
          const Icon = toastIcon[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <Icon aria-hidden="true" className={item.tone === 'error' ? 'text-rose-600' : item.tone === 'success' ? 'text-emerald-600' : 'text-primary'} size={18} />
              <span className="min-w-0 flex-1">{item.message}</span>
              <button type="button" onClick={() => dismissToast(item.id)} aria-label="Dismiss notification" className="rounded p-0.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary dark:hover:bg-slate-800">
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {pendingConfirmation && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) settleConfirmation(false);
        }}>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-950 dark:text-white">
              {pendingConfirmation.title ?? 'Please confirm'}
            </h2>
            <p id="confirm-dialog-description" className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
              {pendingConfirmation.message}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelButtonRef} type="button" onClick={() => settleConfirmation(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                {pendingConfirmation.cancelLabel ?? 'Cancel'}
              </button>
              <button type="button" onClick={() => settleConfirmation(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${pendingConfirmation.destructive ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-600' : 'bg-primary hover:bg-primary/90 focus:ring-primary'}`}>
                {pendingConfirmation.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

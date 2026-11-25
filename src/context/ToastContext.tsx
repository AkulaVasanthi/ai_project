import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 4200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-md transition-all ${
              toast.kind === 'error'
                ? 'border-red-200 text-red-900'
                : toast.kind === 'info'
                  ? 'border-blue-200 text-slate-900'
                  : 'border-teal-200 text-slate-900'
            }`}
          >
            {toast.kind === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            ) : toast.kind === 'info' ? (
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
            )}
            <p className="text-sm leading-snug flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

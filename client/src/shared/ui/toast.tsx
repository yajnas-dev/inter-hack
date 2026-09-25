import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Icon } from './Icon';

type Kind = 'success' | 'error';
export interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
  action?: ToastAction;
}
interface ToastApi {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: Kind, message: string, action?: ToastAction) => {
      const id = nextId++;
      setItems((current) => [...current, { id, kind, message, action }]);
      window.setTimeout(() => dismiss(id), action ? 7000 : 4500);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(() => ({ success: (m, a) => push('success', m, a), error: (m) => push('error', m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'check' : 'info'} />
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

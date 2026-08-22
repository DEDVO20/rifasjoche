'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4500 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) => showToast({ type: 'success', title, message }),
    [showToast]
  );

  const error = useCallback(
    (title: string, message?: string) => showToast({ type: 'error', title, message }),
    [showToast]
  );

  const warning = useCallback(
    (title: string, message?: string) => showToast({ type: 'warning', title, message }),
    [showToast]
  );

  const info = useCallback(
    (title: string, message?: string) => showToast({ type: 'info', title, message }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}

      {/* Contenedor de Toasts Flotantes */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0">
        {toasts.map((toast) => {
          const config = {
            success: {
              icon: 'check_circle',
              bg: 'bg-emerald-950/90 text-white border-emerald-500/30',
              iconColor: 'text-emerald-400',
              accent: 'bg-emerald-500',
            },
            error: {
              icon: 'error',
              bg: 'bg-rose-950/90 text-white border-rose-500/30',
              iconColor: 'text-rose-400',
              accent: 'bg-rose-500',
            },
            warning: {
              icon: 'warning',
              bg: 'bg-amber-950/90 text-white border-amber-500/30',
              iconColor: 'text-amber-400',
              accent: 'bg-amber-500',
            },
            info: {
              icon: 'info',
              bg: 'bg-slate-900/90 text-white border-slate-700',
              iconColor: 'text-sky-400',
              accent: 'bg-sky-500',
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl p-4 shadow-2xl backdrop-blur-xl border flex items-start gap-3.5 animate-in slide-in-from-top-3 fade-in duration-300 relative overflow-hidden transition-all ${config.bg}`}
            >
              {/* Barra de acento lateral */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${config.accent}`} />

              <span className={`material-symbols-outlined text-[24px] flex-shrink-0 mt-0.5 ${config.iconColor}`}>
                {config.icon}
              </span>

              <div className="flex-1 min-w-0 pr-2">
                <h4 className="font-bold text-sm leading-tight text-white">{toast.title}</h4>
                {toast.message && (
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{toast.message}</p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-full flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe ser utilizado dentro de un ToastProvider');
  }
  return context;
}

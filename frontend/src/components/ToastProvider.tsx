import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
};

type ToastContextValue = {
  push: (message: string, kind?: ToastKind, duration?: number) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "info", duration = 5000) => {
    const id = crypto.randomUUID();
    setItems((list) => [...list, { id, kind, message, duration }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), duration);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(100%-2rem,22rem)] flex-col gap-2 sm:right-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            aria-live={t.kind === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto overflow-hidden rounded-lg border bg-white shadow-lg ${
              t.kind === "success"
                ? "border-emerald-200"
                : t.kind === "error"
                  ? "border-red-200"
                  : t.kind === "warning"
                    ? "border-amber-200"
                    : "border-sky-200"
            }`}
          >
            <div className="flex items-start gap-2 px-3 py-2">
              <p className="flex-1 text-sm text-slate-800">{t.message}</p>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
                aria-label="Dismiss notification"
              >
                Close
              </button>
            </div>
            <div
              className={`h-1 ${
                t.kind === "success" ? "bg-emerald-500" : t.kind === "error" ? "bg-red-500" : t.kind === "warning" ? "bg-amber-500" : "bg-sky-500"
              }`}
              style={{ animation: `clinicflow-toast ${t.duration}ms linear forwards` }}
            />
          </div>
        ))}
      </div>
      <style>{`@keyframes clinicflow-toast { from { width: 100%; } to { width: 0%; } }`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

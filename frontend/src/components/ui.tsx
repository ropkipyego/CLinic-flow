import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] active:scale-[0.98]",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:scale-[0.98]",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium shadow-sm transition disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const cls =
    kind === "error"
      ? "bg-red-50 text-red-800 border-red-200"
      : kind === "success"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-sky-50 text-sky-800 border-sky-200";
  return <div className={`rounded-lg border px-3 py-2.5 text-sm ${cls}`}>{children}</div>;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    REGISTERED: "bg-slate-100 text-slate-700",
    WAITING_CONSULTATION: "bg-amber-50 text-amber-800",
    IN_CONSULTATION: "bg-sky-50 text-sky-800",
    WAITING_LAB: "bg-violet-50 text-violet-800",
    LAB_PROCESSING: "bg-violet-50 text-violet-800",
    WAITING_PHARMACY: "bg-indigo-50 text-indigo-800",
    WAITING_PAYMENT: "bg-orange-50 text-orange-800",
    COMPLETED: "bg-emerald-50 text-emerald-800",
    CANCELLED: "bg-red-50 text-red-700",
    UNPAID: "bg-orange-50 text-orange-800",
    PARTIALLY_PAID: "bg-amber-50 text-amber-800",
    PAID: "bg-emerald-50 text-emerald-800",
    QUEUED: "bg-slate-100 text-slate-700",
    SENDING: "bg-sky-50 text-sky-800",
    SENT: "bg-emerald-50 text-emerald-800",
    FAILED: "bg-red-50 text-red-700",
    PENDING: "bg-amber-50 text-amber-800",
    REQUESTED: "bg-amber-50 text-amber-800",
    STANDARD: "bg-slate-100 text-slate-700",
    OTC_PHARMACY: "bg-teal-50 text-teal-800",
    WALK_IN_LAB: "bg-violet-50 text-violet-800",
    DISPENSED: "bg-emerald-50 text-emerald-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || "bg-slate-100 text-slate-700"}`}>
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
}) {
  const cls = "rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition";
  const inner = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} w-full text-left hover:border-[var(--brand)] hover:shadow-sm`}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 md:p-5 ${className}`}>{children}</div>;
}

export const cellClass = "px-4 py-3 text-slate-700";

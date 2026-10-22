import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        variant === "primary" && "bg-brand-700 text-white hover:bg-brand-800",
        variant === "secondary" && "border border-brand-200 bg-white text-brand-800 hover:bg-brand-50",
        variant === "ghost" && "text-brand-800 hover:bg-brand-50",
        variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-brand-100 bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "warn" | "danger" | "ok" | "info"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "brand" && "bg-brand-100 text-brand-800",
        tone === "warn" && "bg-amber-100 text-amber-800",
        tone === "danger" && "bg-red-100 text-red-700",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
        tone === "info" && "bg-sky-100 text-sky-800",
      )}
    >
      {children}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, p.className)} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, p.className)} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={cx(inputCls, p.className)} />;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("w-full rounded-xl bg-white shadow-xl", wide ? "max-w-4xl" : "max-w-xl")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Fechar" onClick={onClose} className="rounded-lg p-1 text-ink/60 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-ink/60">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">Fertsan • Gestão de relacionamento</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "mb-4 rounded-xl border px-4 py-3 text-sm",
        tone === "info" ? "border-brand-100 bg-brand-50 text-brand-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {children}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink/60">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold">
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

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-brand-800">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/50">{hint}</p>}
    </Card>
  );
}

export function Spinner() {
  return <div className="p-8 text-center text-sm text-ink/50">Carregando…</div>;
}

// ---------------- Toasts ----------------
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "rounded-lg px-4 py-3 text-sm shadow-lg",
              t.tone === "ok" ? "bg-brand-800 text-white" : "bg-red-600 text-white",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Seleção múltipla simples de membros da equipe (responsáveis). */
export function MultiPick({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={cx(
              "rounded-full border px-3 py-1 text-xs",
              on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-ink/70 hover:border-brand-400",
            )}
          >
            {o.name}
          </button>
        );
      })}
      {options.length === 0 && <span className="text-xs text-ink/50">Cadastre a equipe em Configurações.</span>}
    </div>
  );
}

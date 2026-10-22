import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Briefcase,
  CalendarDays,
  Download,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { exportBackup } from "../lib/backup";
import { errorMessage, initials } from "../lib/format";
import { cx, useToast } from "./ui";

const NAV = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/oportunidades", label: "Oportunidades", icon: Briefcase },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/canais", label: "Canais", icon: Network },
  { to: "/jornada", label: "Linha do tempo", icon: GitBranch },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/propostas", label: "Propostas", icon: FileText },
  { to: "/risco-zero", label: "Risco Zero", icon: ShieldCheck },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/metas", label: "Metas trimestrais", icon: BarChart3 },
  { to: "/pendencias", label: "Fontes e pendências", icon: AlertTriangle },
];

const ROLE_LABEL = { admin: "Administrador", gestor: "Gestor", vendedor: "Vendedor" } as const;

export function Layout() {
  const { member, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const loc = useLocation();
  const items = isAdmin ? [...NAV, { to: "/configuracoes", label: "Configurações", icon: SettingsIcon }] : NAV;
  const current = items.find((i) => (i.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(i.to)));

  async function onExport() {
    setExporting(true);
    try {
      await exportBackup();
      toast("Backup exportado (JSON e XLSX).");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <img src={`${import.meta.env.BASE_URL}fertsan-logo.png`} alt="Fertsan — Ciência semeando produtividade" className="h-12 w-auto" />
        <div className="mt-5 rounded-xl bg-brand-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-600">Gestão comercial</p>
          <p className="text-sm font-semibold">Operação comercial</p>
          <p className="text-xs text-ink/60">Safra 2026 / 2027</p>
        </div>
      </div>
      <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">Espaço de trabalho</p>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                isActive ? "bg-brand-700 font-medium text-white" : "text-ink/70 hover:bg-brand-50",
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-brand-900 p-4 text-white">
        <p className="text-sm font-semibold">Resultado primeiro.</p>
        <p className="text-sm text-brand-200">Risco Zero Fertsan</p>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
          {initials(member?.name ?? "?")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{member?.name}</p>
          <p className="text-xs text-ink/50">{member ? ROLE_LABEL[member.role] : ""}</p>
        </div>
        <button onClick={() => void signOut()} aria-label="Sair" className="rounded-lg p-1.5 text-ink/50 hover:bg-slate-100">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-brand-100 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-ink/60 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-brand-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden">
            <Menu size={20} />
          </button>
          <p className="text-sm text-ink/50">
            Comercial <span className="mx-1">›</span>
            <span className="font-medium text-ink">{current?.label ?? "Propostas"}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-ink/50 sm:flex">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> Dados persistentes
          </span>
          <button
            onClick={() => void onExport()}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-brand-100 px-2.5 py-1.5 text-xs text-brand-800 hover:bg-brand-50 disabled:opacity-50"
          >
            <Download size={14} /> {exporting ? "Exportando…" : "Exportar backup"}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-ink/40 sm:px-8">FERTSAN · Central comercial</footer>
    </div>
  );
}

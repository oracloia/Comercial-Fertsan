const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const money = (v: number | null | undefined) => brl.format(v ?? 0);
export const money0 = (v: number | null | undefined) => brl0.format(v ?? 0);
export const number = (v: number | null | undefined) => num.format(v ?? 0);
export const liters = (v: number | null | undefined) => `${num.format(v ?? 0)} L`;
export const hectares = (v: number | null | undefined) => `${num.format(v ?? 0)} ha`;

export function plural(n: number, one: string, many: string) {
  return `${num.format(n)} ${n === 1 ? one : many}`;
}

/** yyyy-mm-dd → dd/mm/aaaa (sem fuso) */
export function dateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function dateTimeBR(iso: string | null | undefined, allDay = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR");
  return allDay ? date : `${date} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim().replace(/\s/g, "");
  // aceita "1.234,56" e "1234.56"
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function errorMessage(e: unknown): string {
  if (!e) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Erro desconhecido.";
}

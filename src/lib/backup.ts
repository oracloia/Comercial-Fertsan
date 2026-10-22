import * as XLSX from "xlsx";
import { check, supabase } from "./supabase";

export const BACKUP_TABLES = [
  "team_members",
  "products",
  "clients",
  "channels",
  "opportunities",
  "opportunity_owners",
  "journey_steps",
  "activities",
  "activity_owners",
  "proposals",
  "proposal_items",
  "proposal_versions",
  "risk_zero_trials",
  "stock_movements",
  "quarterly_goals",
  "forecasts",
] as const;

async function readTable(table: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await supabase.from(table).select("*").range(from, from + 999)) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Exporta tudo que o usuário pode ver (respeita as regras de acesso) em JSON e XLSX. */
export async function exportBackup() {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) data[t] = await readTable(t);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  download(
    `fertsan-backup-${stamp}.json`,
    new Blob([JSON.stringify({ exported_at: new Date().toISOString(), version: 1, data }, null, 2)], {
      type: "application/json",
    }),
  );

  const wb = XLSX.utils.book_new();
  for (const [t, rows] of Object.entries(data)) {
    const flat = rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])),
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), t.slice(0, 31));
  }
  XLSX.writeFile(wb, `fertsan-backup-${stamp}.xlsx`);
}

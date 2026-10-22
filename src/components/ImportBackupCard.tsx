import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useState } from "react";
import { BACKUP_TABLES } from "../lib/backup";
import { errorMessage } from "../lib/format";
import { supabase } from "../lib/supabase";
import { Card, useToast } from "./ui";

// Chave natural de cada tabela para "upsert" (reimportar não duplica)
const CONFLICT: Partial<Record<(typeof BACKUP_TABLES)[number], string>> = {
  opportunity_owners: "opportunity_id,member_id",
  activity_owners: "activity_id,member_id",
  journey_steps: "opportunity_id,step_order",
  proposal_versions: "proposal_id,version",
  products: "name",
};

// Colunas geradas ou que não devem ser regravadas
const DROP: Partial<Record<(typeof BACKUP_TABLES)[number], string[]>> = {
  opportunities: ["value"],
  team_members: ["user_id"],
  clients: ["name_norm"],
};

/**
 * Restaura um backup exportado por esta plataforma (formato { version: 1, data: {tabela: linhas} }).
 * Ordem respeita as chaves estrangeiras. Requer papel de administrador.
 */
export function ImportBackupCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(file: File) {
    setBusy(true);
    setLog([]);
    const out: string[] = [];
    try {
      const json = JSON.parse(await file.text()) as { version?: number; data?: Record<string, Record<string, unknown>[]> };
      if (!json.data || typeof json.data !== "object") {
        throw new Error("Arquivo não reconhecido. Use um backup exportado por esta plataforma.");
      }
      for (const table of BACKUP_TABLES) {
        const rows = (json.data[table] ?? []).map((r) => {
          const copy = { ...r };
          for (const c of DROP[table] ?? []) delete copy[c];
          return copy;
        });
        if (!rows.length) continue;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase.from(table).upsert(chunk, { onConflict: CONFLICT[table] ?? "id" });
          if (error) throw new Error(`${table}: ${error.message}`);
        }
        out.push(`${table}: ${rows.length}`);
        setLog([...out]);
      }
      await qc.invalidateQueries();
      toast("Backup importado.");
    } catch (e) {
      toast(errorMessage(e), "error");
      out.push(`Erro: ${errorMessage(e)}`);
      setLog([...out]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Restaurar backup</h2>
      <p className="mt-1 text-sm text-ink/60">
        Importa um arquivo <code>.json</code> gerado em “Exportar backup”. Registros com o mesmo identificador são atualizados, não duplicados.
      </p>
      <label className="mt-4 inline-block">
        <input type="file" accept=".json" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
        <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          <Upload size={16} /> {busy ? "Importando…" : "Escolher arquivo"}
        </span>
      </label>
      {log.length > 0 && (
        <ul className="mt-4 space-y-0.5 font-mono text-xs text-ink/70">
          {log.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { normalizeName } from "../lib/calc";
import { useClients, useMembers, useSave } from "../lib/data";
import { errorMessage, toNumber } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import { CLIENT_KINDS } from "../lib/types";
import { Button, Modal, Select, useToast } from "./ui";

const TARGETS = [
  { key: "name", label: "Nome *" },
  { key: "farm", label: "Fazenda" },
  { key: "city", label: "Cidade" },
  { key: "uf", label: "UF" },
  { key: "kind", label: "Tipo" },
  { key: "status", label: "Status" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "owner", label: "Responsável (nome)" },
  { key: "total_area_ha", label: "Área total (ha)" },
] as const;
type TargetKey = (typeof TARGETS)[number]["key"];

const GUESS: Record<TargetKey, RegExp> = {
  name: /^(nome|cliente|razao|produtor)/,
  farm: /fazenda/,
  city: /(cidade|municipio)/,
  uf: /^(uf|estado)$/,
  kind: /^tipo/,
  status: /(status|situacao)/,
  phone: /(telefone|celular|fone|contato)/,
  email: /e ?mail/,
  owner: /(responsavel|vendedor)/,
  total_area_ha: /area/,
};

/** Separa "CIDADE UF" (ex.: "BARREIRAS BA") quando não há coluna de UF. */
function splitCityUf(city: string): { city: string; uf: string | null } {
  const m = city.trim().match(/^(.*?)[\s\-/]+([A-Za-z]{2})$/);
  return m && m[1] ? { city: m[1], uf: m[2]!.toUpperCase() } : { city, uf: null };
}

export function ImportClientsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const clients = useClients();
  const members = useMembers();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<TargetKey, string>>>({});
  const [includeDups, setIncludeDups] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onFile(file: File) {
    const wb = XLSX.read(await file.arrayBuffer());
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return toast("Planilha vazia.", "error");
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, { defval: "" });
    const hs = data[0] ? Object.keys(data[0]) : [];
    setFileName(file.name);
    setRows(data);
    setHeaders(hs);
    const guess: Partial<Record<TargetKey, string>> = {};
    for (const t of TARGETS) {
      const h = hs.find((x) => GUESS[t.key].test(normalizeName(x)));
      if (h) guess[t.key] = h;
    }
    setMap(guess);
  }

  const existing = useMemo(() => new Set((clients.data ?? []).map((c) => c.name_norm)), [clients.data]);
  const memberByName = useMemo(
    () => new Map((members.data ?? []).map((m) => [normalizeName(m.name), m.id])),
    [members.data],
  );

  const prepared = useMemo(() => {
    const get = (r: Record<string, unknown>, k: TargetKey) => (map[k] ? String(r[map[k]!] ?? "").trim() : "");
    const seen = new Set<string>();
    return rows
      .map((r) => {
        const name = get(r, "name");
        let city = get(r, "city");
        let uf = get(r, "uf").toUpperCase() || null;
        if (city && !uf) ({ city, uf } = splitCityUf(city));
        const kindRaw = get(r, "kind");
        const statusRaw = normalizeName(get(r, "status"));
        const norm = normalizeName(name);
        const dup = existing.has(norm) || seen.has(norm);
        seen.add(norm);
        return {
          dup,
          row: {
            name,
            farm: get(r, "farm") || null,
            city: city || null,
            uf: uf && uf.length === 2 ? uf : null,
            kind: CLIENT_KINDS.find((k) => normalizeName(k) === normalizeName(kindRaw)) ?? (kindRaw ? "Outras" : "Produtor Rural"),
            status: statusRaw.startsWith("inativ") ? "Inativo" : "Ativo",
            phone: get(r, "phone") || null,
            email: get(r, "email") || null,
            owner_id: memberByName.get(normalizeName(get(r, "owner"))) ?? null,
            total_area_ha: toNumber(get(r, "total_area_ha")),
            origin: `Importação: ${fileName}`,
          },
        };
      })
      .filter((p) => p.row.name);
  }, [rows, map, existing, memberByName, fileName]);

  const toImport = prepared.filter((p) => includeDups || !p.dup);

  const save = useSave(async () => {
    for (let i = 0; i < toImport.length; i += 500) {
      check(await supabase.from("clients").insert(toImport.slice(i, i + 500).map((p) => p.row)));
    }
  }, [["clients"], ["duplicates"]]);

  async function run() {
    try {
      await save.mutateAsync(undefined);
      toast(`${toImport.length} clientes importados.`);
      setRows([]);
      onClose();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar clientes (XLSX ou CSV)" wide>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        className="mb-4 block text-sm"
      />
      {rows.length > 0 && (
        <>
          <p className="mb-3 text-sm font-medium">Mapeie as colunas da planilha:</p>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGETS.map((t) => (
              <label key={t.key} className="text-sm">
                <span className="mb-1 block text-ink/70">{t.label}</span>
                <Select value={map[t.key] ?? ""} onChange={(e) => setMap({ ...map, [t.key]: e.target.value || undefined })}>
                  <option value="">— ignorar —</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <p className="mb-2 text-sm">
            {prepared.length} linhas válidas · <strong>{prepared.filter((p) => p.dup).length}</strong> possíveis duplicados (mesmo nome já cadastrado ou repetido na planilha).
          </p>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDups} onChange={(e) => setIncludeDups(e.target.checked)} /> Importar também os possíveis duplicados
          </label>
          <div className="mb-4 max-h-64 overflow-auto rounded-lg border border-slate-200 text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-brand-50">
                <tr>
                  {["", "Nome", "Cidade/UF", "Tipo", "Status", "Telefone"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prepared.slice(0, 100).map((p, i) => (
                  <tr key={i} className={p.dup ? "bg-amber-50" : ""}>
                    <td className="px-2 py-1">{p.dup ? "dup." : ""}</td>
                    <td className="px-2 py-1">{p.row.name}</td>
                    <td className="px-2 py-1">{[p.row.city, p.row.uf].filter(Boolean).join("/")}</td>
                    <td className="px-2 py-1">{p.row.kind}</td>
                    <td className="px-2 py-1">{p.row.status}</td>
                    <td className="px-2 py-1">{p.row.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!map.name || toImport.length === 0 || save.isPending} onClick={() => void run()}>
              {save.isPending ? "Importando…" : `Importar ${toImport.length}`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

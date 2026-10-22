import { GitMerge, Plus, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ImportClientsDialog } from "../components/ImportClientsDialog";
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea, useToast } from "../components/ui";
import { displayName, normalizeName } from "../lib/calc";
import { useClients, useDuplicates, useMembers, useSave } from "../lib/data";
import { errorMessage, toNumber } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import { CLIENT_KINDS, UFS, type Client } from "../lib/types";

const PAGE = 50;

export default function Clients() {
  const clients = useClients();
  const members = useMembers();
  const { isManager } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [uf, setUf] = useState("");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [merging, setMerging] = useState(false);

  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);

  const rows = useMemo(() => {
    const nq = normalizeName(q);
    return (clients.data ?? []).filter(
      (c) =>
        (!status || c.status === status) &&
        (!kind || c.kind === kind) &&
        (!uf || c.uf === uf) &&
        (!owner || c.owner_id === owner) &&
        (!nq || normalizeName(`${c.name} ${c.farm ?? ""} ${c.city ?? ""} ${c.phone ?? ""}`).includes(nq)),
    );
  }, [clients.data, q, status, kind, uf, owner]);

  useEffect(() => setPage(0), [q, status, kind, uf, owner]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro único: oportunidades, propostas e agenda apontam para estes registros."
        actions={
          <>
            {isManager && (
              <Button variant="secondary" onClick={() => setMerging(true)}>
                <GitMerge size={16} /> Possíveis duplicados
              </Button>
            )}
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload size={16} /> Importar planilha
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> Novo cliente
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Input className="sm:col-span-3 lg:col-span-2" placeholder="Buscar por nome, fazenda, cidade ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          <option>Ativo</option>
          <option>Inativo</option>
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {CLIENT_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
        <Select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="UF">
          <option value="">Todas as UFs</option>
          {UFS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {(members.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>
      {clients.isLoading ? (
        <Spinner />
      ) : (
        <>
          <Table head={["Cliente", "Responsável", "Localidade", "Tipo / status", "Contato", "Origem", ""]}>
            {rows.slice(page * PAGE, page * PAGE + PAGE).map((c) => (
              <tr key={c.id} className="hover:bg-brand-50/40">
                <td className="px-4 py-3">
                  <p className="font-medium">{displayName(c.name)}</p>
                  {c.farm && <p className="text-xs text-ink/50">{displayName(c.farm)}</p>}
                </td>
                <td className="px-4 py-3 text-ink/70">{c.owner_id ? memberName.get(c.owner_id) : "—"}</td>
                <td className="px-4 py-3 text-ink/70">{c.city ? `${displayName(c.city)}${c.uf ? `/${c.uf}` : ""}` : c.uf ?? "—"}</td>
                <td className="px-4 py-3">
                  <p className="text-ink/70">{c.kind}</p>
                  <Badge tone={c.status === "Ativo" ? "ok" : "neutral"}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-ink/70">{c.phone || c.email || "—"}</td>
                <td className="px-4 py-3 text-xs text-ink/50">{c.origin ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(c)} className="text-xs text-brand-700 hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-ink/60">
            <span>
              {rows.length.toLocaleString("pt-BR")} {rows.length === 1 ? "cliente" : "clientes"}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span>
                {page + 1} / {pages}
              </span>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      <ClientDialog open={creating || !!editing} client={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <ImportClientsDialog open={importing} onClose={() => setImporting(false)} />
      <MergeDialog open={merging} onClose={() => setMerging(false)} />
    </>
  );
}

function ClientDialog({ open, client, onClose }: { open: boolean; client: Client | null; onClose: () => void }) {
  const members = useMembers();
  const clients = useClients();
  const toast = useToast();
  const empty = {
    name: "", farm: "", city: "", uf: "", kind: "Produtor Rural", status: "Ativo", phone: "", email: "",
    owner_id: "", origin: "", total_area_ha: "", notes: "",
  };
  const [f, setF] = useState(empty);
  useEffect(() => {
    if (!open) return;
    setF(
      client
        ? {
            name: displayName(client.name), farm: client.farm ?? "", city: client.city ?? "", uf: client.uf ?? "",
            kind: client.kind, status: client.status, phone: client.phone ?? "", email: client.email ?? "",
            owner_id: client.owner_id ?? "", origin: client.origin ?? "",
            total_area_ha: client.total_area_ha != null ? String(client.total_area_ha) : "", notes: client.notes ?? "",
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);

  const similar = useMemo(() => {
    const n = normalizeName(f.name);
    if (client || n.length < 4) return [];
    return (clients.data ?? []).filter((c) => c.name_norm === n || c.name_norm.includes(n) || n.includes(c.name_norm)).slice(0, 3);
  }, [f.name, clients.data, client]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useSave(async () => {
    const row = {
      name: f.name.trim(),
      farm: f.farm || null,
      city: f.city || null,
      uf: f.uf || null,
      kind: f.kind,
      status: f.status,
      phone: f.phone || null,
      email: f.email || null,
      owner_id: f.owner_id || null,
      origin: f.origin || null,
      total_area_ha: toNumber(f.total_area_ha),
      notes: f.notes || null,
    };
    if (client) check(await supabase.from("clients").update(row).eq("id", client.id));
    else check(await supabase.from("clients").insert(row));
  }, [["clients"], ["duplicates"], ["opportunities"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast(client ? "Cliente atualizado." : "Cliente cadastrado.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={client ? "Editar cliente" : "Novo cliente"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">
          <Input value={f.name} onChange={set("name")} required />
          {similar.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Já existe cliente parecido: {similar.map((s) => displayName(s.name)).join(", ")}. Confira antes de cadastrar.
            </p>
          )}
        </Field>
        <Field label="Fazenda">
          <Input value={f.farm} onChange={set("farm")} />
        </Field>
        <Field label="Área total (ha)">
          <Input inputMode="decimal" value={f.total_area_ha} onChange={set("total_area_ha")} />
        </Field>
        <Field label="Cidade">
          <Input value={f.city} onChange={set("city")} />
        </Field>
        <Field label="UF">
          <Select value={f.uf} onChange={set("uf")}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={f.kind} onChange={set("kind")}>
            {CLIENT_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={set("status")}>
            <option>Ativo</option>
            <option>Inativo</option>
          </Select>
        </Field>
        <Field label="Telefone">
          <Input value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Responsável">
          <Select value={f.owner_id} onChange={set("owner_id")}>
            <option value="">—</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Origem">
          <Input value={f.origin} onChange={set("origin")} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={set("notes")} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Salvar cliente</Button>
        </div>
      </form>
    </Modal>
  );
}

function MergeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dups = useDuplicates();
  const toast = useToast();
  const merge = useSave(
    async (v: { keep: string; remove: string }) => {
      check(await supabase.rpc("merge_clients", { p_keep: v.keep, p_remove: v.remove }));
    },
    [["clients"], ["duplicates"], ["opportunities"], ["activities"], ["proposals"]],
  );

  async function doMerge(keep: string, remove: string, keepName: string, removeName: string) {
    if (!confirm(`Mesclar "${displayName(removeName)}" em "${displayName(keepName)}"? Oportunidades, propostas e agenda serão transferidas. Não dá para desfazer.`)) return;
    try {
      await merge.mutateAsync({ keep, remove });
      toast("Clientes mesclados.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Possíveis clientes duplicados" wide>
      <p className="mb-4 text-sm text-ink/60">A mesclagem é sempre manual. Escolha qual cadastro manter.</p>
      {dups.isLoading ? (
        <Spinner />
      ) : (dups.data ?? []).length === 0 ? (
        <p className="text-sm text-ink/60">Nenhum par suspeito encontrado.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {(dups.data ?? []).map((d) => (
            <li key={d.a_id + d.b_id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="flex-1">
                <strong>{displayName(d.a_name)}</strong> × <strong>{displayName(d.b_name)}</strong>{" "}
                <span className="text-xs text-ink/50">({Math.round(d.score * 100)}% parecidos)</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => void doMerge(d.a_id, d.b_id, d.a_name, d.b_name)}>
                Manter o 1º
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void doMerge(d.b_id, d.a_id, d.b_name, d.a_name)}>
                Manter o 2º
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

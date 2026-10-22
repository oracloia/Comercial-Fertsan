import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Empty, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Table, useToast } from "../components/ui";
import { displayName } from "../lib/calc";
import { useChannels, useClients, useMembers, useSave } from "../lib/data";
import { errorMessage } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import type { Channel } from "../lib/types";

const KINDS = ["Finder", "Distribuidor", "Revenda", "Consultoria"] as const;
const STAGES = ["Indicação", "Contato iniciado", "Qualificado", "Habilitado", "Inativo"];

export default function Channels() {
  const channels = useChannels();
  const clients = useClients();
  const members = useMembers();
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Channel | null>(null);
  const [creating, setCreating] = useState(false);
  const clientName = useMemo(() => new Map((clients.data ?? []).map((c) => [c.id, c.name])), [clients.data]);
  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);
  const rows = (channels.data ?? []).filter((c) => !kind || c.kind === kind);

  return (
    <>
      <PageHeader
        title="Canais"
        subtitle="Finders, distribuidores, revendas e consultorias."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Novo canal
          </Button>
        }
      />
      <Notice>Indicações via Finder são relações de indicação — não representam revendas habilitadas. Cadastre distribuidores e revendas com o tipo correto.</Notice>
      <div className="mb-4 max-w-xs">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </div>
      {channels.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty>Nenhum canal cadastrado.</Empty>
      ) : (
        <Table head={["Canal", "Tipo", "Ponto focal", "Finder", "Cliente indicado", "Etapa", "Próxima ação", ""]}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{displayName(c.name)}</td>
              <td className="px-4 py-3">
                <Badge tone={c.kind === "Finder" ? "info" : "brand"}>{c.kind}</Badge>
              </td>
              <td className="px-4 py-3 text-ink/70">{c.focal_point ?? "—"}</td>
              <td className="px-4 py-3 text-ink/70">{c.finder_name ?? "—"}</td>
              <td className="px-4 py-3 text-ink/70">{c.client_id ? displayName(clientName.get(c.client_id) ?? "") : "—"}</td>
              <td className="px-4 py-3">
                <Badge>{c.stage}</Badge>
              </td>
              <td className="px-4 py-3 text-ink/70">
                {c.next_action ?? "—"}
                {c.owner_id && <p className="text-xs text-ink/40">{memberName.get(c.owner_id)}</p>}
              </td>
              <td className="px-4 py-3 text-right">
                <button className="text-xs text-brand-700 hover:underline" onClick={() => setEditing(c)}>
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <ChannelDialog open={creating || !!editing} channel={editing} onClose={() => (setCreating(false), setEditing(null))} />
    </>
  );
}

function ChannelDialog({ open, channel, onClose }: { open: boolean; channel: Channel | null; onClose: () => void }) {
  const clients = useClients();
  const members = useMembers();
  const toast = useToast();
  const blank = { name: "", kind: "Finder", focal_point: "", finder_name: "", client_id: "", stage: "Indicação", next_action: "", owner_id: "" };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setF(
      channel
        ? {
            name: channel.name, kind: channel.kind, focal_point: channel.focal_point ?? "", finder_name: channel.finder_name ?? "",
            client_id: channel.client_id ?? "", stage: channel.stage, next_action: channel.next_action ?? "", owner_id: channel.owner_id ?? "",
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useSave(async () => {
    const row = {
      name: f.name.trim(), kind: f.kind, focal_point: f.focal_point || null, finder_name: f.finder_name || null,
      client_id: f.client_id || null, stage: f.stage, next_action: f.next_action || null, owner_id: f.owner_id || null,
    };
    if (channel) check(await supabase.from("channels").update(row).eq("id", channel.id));
    else check(await supabase.from("channels").insert(row));
  }, [["channels"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Canal salvo.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={channel ? "Editar canal" : "Novo canal"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do canal / relação" className="sm:col-span-2">
          <Input value={f.name} onChange={set("name")} required />
        </Field>
        <Field label="Tipo">
          <Select value={f.kind} onChange={set("kind")}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Etapa">
          <Select value={f.stage} onChange={set("stage")}>
            {STAGES.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Ponto focal">
          <Input value={f.focal_point} onChange={set("focal_point")} />
        </Field>
        <Field label="Finder responsável">
          <Input value={f.finder_name} onChange={set("finder_name")} />
        </Field>
        <Field label="Cliente indicado">
          <Select value={f.client_id} onChange={set("client_id")}>
            <option value="">—</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {displayName(c.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável interno">
          <Select value={f.owner_id} onChange={set("owner_id")}>
            <option value="">—</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Próxima ação" className="sm:col-span-2">
          <Input value={f.next_action} onChange={set("next_action")} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

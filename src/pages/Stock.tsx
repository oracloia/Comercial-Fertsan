import { Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Table, useToast } from "../components/ui";
import { useProducts, useSave, useStock } from "../lib/data";
import { dateBR, errorMessage, liters, toNumber, todayISO } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import type { StockKind } from "../lib/types";

const KIND_LABEL: Record<StockKind, string> = { entrada: "Entrada", saida: "Saída", reserva: "Reserva", ajuste: "Ajuste" };
const sign = (k: StockKind, v: number) => (k === "entrada" || k === "ajuste" ? v : -v);

export default function Stock() {
  const stock = useStock();
  const products = useProducts();
  const [open, setOpen] = useState(false);

  const balance = useMemo(() => {
    const m = new Map<string, { free: number; reserved: number }>();
    for (const s of stock.data ?? []) {
      const b = m.get(s.product_id) ?? { free: 0, reserved: 0 };
      b.free += sign(s.kind, s.volume_l);
      if (s.kind === "reserva") b.reserved += s.volume_l;
      m.set(s.product_id, b);
    }
    return m;
  }, [stock.data]);

  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const limit = in60.toISOString().slice(0, 10);
  const expiring = (stock.data ?? []).filter((s) => s.kind === "entrada" && s.expires_on && s.expires_on <= limit);
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader
        title="Estoque"
        subtitle="Saldo calculado pelos movimentos. Saídas e reservas acima do saldo são bloqueadas."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> Novo movimento
          </Button>
        }
      />
      {expiring.length > 0 && (
        <Notice tone="warn">
          {expiring.length} {expiring.length === 1 ? "lote vence" : "lotes vencem"} nos próximos 60 dias:{" "}
          {expiring.map((e) => `${productName.get(e.product_id)} lote ${e.lot ?? "s/n"} (${dateBR(e.expires_on)})`).join("; ")}.
        </Notice>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(products.data ?? [])
          .filter((p) => p.active)
          .map((p) => {
            const b = balance.get(p.id) ?? { free: 0, reserved: 0 };
            return (
              <Card key={p.id} className="p-4">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-2xl font-semibold text-brand-800">{liters(b.free)}</p>
                <p className="text-xs text-ink/50">Saldo disponível{b.reserved > 0 ? ` · ${liters(b.reserved)} reservados` : ""}</p>
              </Card>
            );
          })}
      </div>
      {stock.isLoading ? (
        <Spinner />
      ) : (stock.data ?? []).length === 0 ? (
        <Empty>Nenhum movimento. Registre o saldo inicial como entrada, com lote, validade e depósito.</Empty>
      ) : (
        <Table head={["Data", "Produto", "Lote", "Depósito", "Validade", "Movimento", "Volume"]}>
          {(stock.data ?? []).map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">{dateBR(s.moved_on)}</td>
              <td className="px-4 py-3 font-medium">{productName.get(s.product_id)}</td>
              <td className="px-4 py-3 text-ink/70">{s.lot ?? "—"}</td>
              <td className="px-4 py-3 text-ink/70">{s.warehouse ?? "—"}</td>
              <td className="px-4 py-3 text-ink/70">{dateBR(s.expires_on)}</td>
              <td className="px-4 py-3">
                <Badge tone={s.kind === "entrada" ? "ok" : s.kind === "saida" ? "danger" : s.kind === "reserva" ? "warn" : "neutral"}>{KIND_LABEL[s.kind]}</Badge>
              </td>
              <td className="px-4 py-3 text-right font-medium">{liters(sign(s.kind, s.volume_l))}</td>
            </tr>
          ))}
        </Table>
      )}
      <MovementDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MovementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const products = useProducts();
  const toast = useToast();
  const [f, setF] = useState({ product_id: "", kind: "entrada" as StockKind, volume: "", lot: "", warehouse: "", expires_on: "", moved_on: todayISO(), notes: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useSave(async () => {
    const v = toNumber(f.volume);
    if (!v) throw new Error("Informe o volume.");
    check(
      await supabase.from("stock_movements").insert({
        product_id: f.product_id,
        kind: f.kind,
        volume_l: v,
        lot: f.lot || null,
        warehouse: f.warehouse || null,
        expires_on: f.expires_on || null,
        moved_on: f.moved_on,
        notes: f.notes || null,
      }),
    );
  }, [["stock"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Movimento registrado.");
      setF({ ...f, volume: "", lot: "", notes: "" });
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo movimento de estoque">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Produto" className="sm:col-span-2">
          <Select value={f.product_id} onChange={set("product_id")} required>
            <option value="">Selecione…</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Movimento">
          <Select value={f.kind} onChange={set("kind")}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Volume (L)" hint={f.kind === "ajuste" ? "Use valor negativo para baixar o saldo." : undefined}>
          <Input inputMode="decimal" value={f.volume} onChange={set("volume")} required />
        </Field>
        <Field label="Data">
          <Input type="date" value={f.moved_on} onChange={set("moved_on")} required />
        </Field>
        <Field label="Lote">
          <Input value={f.lot} onChange={set("lot")} />
        </Field>
        <Field label="Depósito">
          <Input value={f.warehouse} onChange={set("warehouse")} />
        </Field>
        <Field label="Validade">
          <Input type="date" value={f.expires_on} onChange={set("expires_on")} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Input value={f.notes} onChange={set("notes")} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}

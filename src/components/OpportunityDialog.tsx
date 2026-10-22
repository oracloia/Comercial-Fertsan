import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { displayName, type Modality } from "../lib/calc";
import { setOwners, useClients, useMembers, useProducts, useSave } from "../lib/data";
import { errorMessage, money, number, toNumber } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import type { Opportunity, OpportunityStatus } from "../lib/types";
import { Button, Field, Input, Modal, MultiPick, Select, Textarea, useToast } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  opportunity?: Opportunity | null;
}

export function OpportunityDialog({ open, onClose, opportunity }: Props) {
  const { member } = useAuth();
  const clients = useClients();
  const products = useProducts();
  const members = useMembers();
  const toast = useToast();

  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [modality, setModality] = useState<Modality>("risco_zero");
  const [area, setArea] = useState("");
  const [volume, setVolume] = useState("");
  const [owners, setOwnersState] = useState<string[]>([]);
  const [objective, setObjective] = useState("");
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState<OpportunityStatus>("aberta");
  const [statusReason, setStatusReason] = useState("");
  const [override, setOverride] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!open) return;
    const o = opportunity;
    setClientId(o?.client_id ?? "");
    setProductId(o?.product_id ?? "");
    setModality(o?.modality ?? "risco_zero");
    setArea(o?.area_ha != null ? String(o.area_ha) : "");
    setVolume(o ? String(o.volume_l) : "");
    setOwnersState(o ? (o.opportunity_owners ?? []).map((w) => w.member_id) : member ? [member.id] : []);
    setObjective(o?.objective ?? "");
    setOrigin(o?.origin ?? "");
    setStatus(o?.status ?? "aberta");
    setStatusReason(o?.status_reason ?? "");
    setOverride(o?.value_override != null ? String(o.value_override) : "");
    setOverrideReason(o?.override_reason ?? "");
  }, [open, opportunity, member]);

  const product = (products.data ?? []).find((p) => p.id === productId);
  const vol = toNumber(volume) ?? 0;
  const estimated = product?.price_per_l != null ? vol * product.price_per_l : null;
  const activeProducts = useMemo(() => (products.data ?? []).filter((p) => p.active || p.id === productId), [products.data, productId]);

  function suggestVolume() {
    const a = toNumber(area);
    if (a && product) setVolume(String(Math.round(a * product.default_dose_l_ha)));
  }

  const save = useSave(
    async () => {
      if (!product) throw new Error("Escolha o produto.");
      if (product.price_per_l == null) throw new Error("Produto com preço pendente — cadastre o preço em Configurações.");
      if (owners.length === 0) throw new Error("Escolha ao menos um responsável.");
      if ((status === "perdida" || status === "em_pausa") && !statusReason.trim()) throw new Error("Informe o motivo.");
      const ov = toNumber(override);
      if (ov != null && !overrideReason.trim()) throw new Error("Justifique o valor diferente do catálogo.");
      const row = {
        client_id: clientId,
        product_id: productId,
        modality,
        area_ha: toNumber(area),
        volume_l: vol,
        objective: objective || null,
        origin: origin || null,
        status,
        status_reason: statusReason || null,
        value_override: ov,
        override_reason: ov != null ? overrideReason : null,
      };
      let id = opportunity?.id;
      if (id) {
        check(await supabase.from("opportunities").update(row).eq("id", id));
      } else {
        const created = check(await supabase.from("opportunities").insert(row).select("id").single()) as { id: string };
        id = created.id;
      }
      await setOwners("opportunity_owners", "opportunity_id", id, owners);
    },
    [["opportunities"], ["journey"]],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast(opportunity ? "Oportunidade atualizada." : "Oportunidade criada.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={opportunity ? "Editar oportunidade" : "Nova oportunidade"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" className="sm:col-span-2" hint="Não encontrou? Cadastre antes em Clientes.">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Selecione…</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {displayName(c.name)}
                {c.city ? ` — ${displayName(c.city)}/${c.uf ?? ""}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Produto">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Selecione…</option>
            {activeProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.price_per_l == null ? " (preço pendente)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Modalidade">
          <Select value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
            <option value="risco_zero">Risco Zero</option>
            <option value="convencional">Convencional</option>
          </Select>
        </Field>
        <Field label="Área alvo (ha)">
          <Input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} onBlur={() => !volume && suggestVolume()} />
        </Field>
        <Field
          label="Volume previsto (L)"
          hint={product ? `Dose padrão: ${number(product.default_dose_l_ha)} L/ha` : undefined}
        >
          <Input inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} required />
        </Field>
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm sm:col-span-2">
          {product?.price_per_l == null && product ? (
            <span className="text-red-700">Preço pendente — cadastre em Configurações.</span>
          ) : (
            <>
              Valor pelo catálogo: <strong>{estimated != null ? money(estimated) : "—"}</strong>
              {product?.price_per_l != null && <span className="text-ink/60"> ({money(product.price_per_l)}/L)</span>}
            </>
          )}
        </div>
        <Field label="Responsáveis" className="sm:col-span-2">
          <MultiPick options={(members.data ?? []).filter((m) => m.active)} value={owners} onChange={setOwnersState} />
        </Field>
        <Field label="Objetivo / próxima ação" className="sm:col-span-2">
          <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: 1.000 ha na soja" />
        </Field>
        <Field label="Origem">
          <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Indicação, prospecção…" />
        </Field>
        <Field label="Situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value as OpportunityStatus)}>
            <option value="aberta">Aberta</option>
            <option value="em_pausa">Em pausa</option>
            <option value="perdida">Perdida</option>
            {status === "ganha" && <option value="ganha">Ganha</option>}
          </Select>
        </Field>
        {(status === "perdida" || status === "em_pausa") && (
          <Field label="Motivo" className="sm:col-span-2">
            <Textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} required />
          </Field>
        )}
        <details className="sm:col-span-2">
          <summary className="cursor-pointer text-sm text-brand-700">Valor negociado diferente do catálogo</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Valor (R$)">
              <Input inputMode="decimal" value={override} onChange={(e) => setOverride(e.target.value)} />
            </Field>
            <Field label="Justificativa">
              <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </Field>
          </div>
        </details>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar oportunidade"}</Button>
        </div>
      </form>
    </Modal>
  );
}

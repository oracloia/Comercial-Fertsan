import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea, useToast } from "../components/ui";
import { displayName, riskZeroResult } from "../lib/calc";
import { useOpportunities, useSave, useTrials } from "../lib/data";
import { errorMessage, money, money0, number, toNumber, todayISO } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import type { RiskZeroTrial } from "../lib/types";

export const RZ_CRITERIA = [
  { key: "protocolo", label: "Protocolo e área elegível acordados" },
  { key: "testemunha", label: "Testemunha comparável e mesma unidade de medida" },
  { key: "precos", label: "Preço da commodity e custos elegíveis definidos" },
  { key: "pesagens", label: "Pesagens, umidade e laudo de colheita verificáveis" },
  { key: "validacao", label: "Validação técnica e aceite das partes" },
];

const CONCLUSION = {
  coberto: { label: "Coberto", tone: "ok" },
  nao_coberto: { label: "Não coberto", tone: "danger" },
  pendente: { label: "Pendente", tone: "warn" },
} as const;

export default function RiskZero() {
  const opps = useOpportunities();
  const trials = useTrials();
  const [editing, setEditing] = useState<RiskZeroTrial | null>(null);
  const [creating, setCreating] = useState(false);

  const rzOpps = (opps.data ?? []).filter((o) => o.modality === "risco_zero");
  const exposure = rzOpps.filter((o) => o.status === "aberta" || o.status === "em_pausa").reduce((s, o) => s + (o.value_override ?? o.value), 0);
  const oppById = useMemo(() => new Map((opps.data ?? []).map((o) => [o.id, o])), [opps.data]);

  return (
    <>
      <PageHeader
        title="Risco Zero"
        subtitle="Produtividade que sustenta a venda."
        actions={
          <Button onClick={() => setCreating(true)} disabled={rzOpps.length === 0}>
            <Plus size={16} /> Registrar apuração
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="font-semibold">Regra de apuração</p>
          <p className="mt-2 text-sm text-ink/70">
            <strong>Ganho financeiro por hectare</strong> = (produtividade tratada − testemunha) × preço da unidade.
            <br />
            <strong>Cobertura</strong> = ganho financeiro ≥ custo elegível por hectare.
          </p>
          <p className="mt-4 text-sm font-medium">Critérios antes da liberação</p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink/70">
            {RZ_CRITERIA.map((c) => (
              <li key={c.key}>{c.label}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Exposição comercial planejada</p>
          <p className="mt-2 text-2xl font-semibold text-brand-800">{money0(exposure)}</p>
          <p className="mt-1 text-xs text-ink/60">
            Soma das oportunidades Risco Zero abertas. Não representa estoque entregue nem receita a receber.
          </p>
        </Card>
      </div>

      {trials.isLoading ? (
        <Spinner />
      ) : (trials.data ?? []).length === 0 ? (
        <Empty>Nenhuma apuração registrada.</Empty>
      ) : (
        <Table head={["Cliente", "Incremento", "Ganho por ha", "Custo por ha", "Incremento mínimo", "Critérios", "Conclusão", ""]}>
          {(trials.data ?? []).map((t) => {
            const o = oppById.get(t.opportunity_id);
            const r = riskZeroResult(t);
            const ok = RZ_CRITERIA.filter((c) => t.criteria?.[c.key]).length;
            return (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{displayName(o?.clients?.name ?? "—")}</p>
                  <p className="text-xs text-ink/50">{o?.products?.name}</p>
                </td>
                <td className="px-4 py-3">{r.increment != null ? `${number(r.increment)} ${t.unit.replace("/ha", "")}/ha` : "—"}</td>
                <td className="px-4 py-3">{r.gainPerHa != null ? money(r.gainPerHa) : "—"}</td>
                <td className="px-4 py-3">{t.eligible_cost_ha != null ? money(t.eligible_cost_ha) : "—"}</td>
                <td className="px-4 py-3">{r.minIncrement != null ? `${number(r.minIncrement)} ${t.unit}` : "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={ok === RZ_CRITERIA.length ? "ok" : "warn"}>
                    {ok}/{RZ_CRITERIA.length}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={CONCLUSION[r.conclusion].tone}>{CONCLUSION[r.conclusion].label}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-brand-700 hover:underline" onClick={() => setEditing(t)}>
                    Editar
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <TrialDialog open={creating || !!editing} trial={editing} onClose={() => (setCreating(false), setEditing(null))} />
    </>
  );
}

function TrialDialog({ open, trial, onClose }: { open: boolean; trial: RiskZeroTrial | null; onClose: () => void }) {
  const opps = useOpportunities();
  const toast = useToast();
  const blank = { opportunity_id: "", treated: "", control: "", unit: "sc/ha", price: "", cost: "", notes: "" };
  const [f, setF] = useState(blank);
  const [criteria, setCriteria] = useState<Record<string, boolean>>({});
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(
      trial
        ? {
            opportunity_id: trial.opportunity_id,
            treated: trial.treated_yield?.toString() ?? "",
            control: trial.control_yield?.toString() ?? "",
            unit: trial.unit,
            price: trial.commodity_price?.toString() ?? "",
            cost: trial.eligible_cost_ha?.toString() ?? "",
            notes: trial.notes ?? "",
          }
        : blank,
    );
    setCriteria(trial?.criteria ?? {});
    setFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trial]);

  const result = riskZeroResult({
    treated_yield: toNumber(f.treated),
    control_yield: toNumber(f.control),
    commodity_price: toNumber(f.price),
    eligible_cost_ha: toNumber(f.cost),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useSave(async () => {
    let report_path = trial?.report_path ?? null;
    if (file) {
      const path = `risco-zero/${f.opportunity_id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("evidencias").upload(path, file);
      if (error) throw error;
      report_path = path;
    }
    const row = {
      opportunity_id: f.opportunity_id,
      treated_yield: toNumber(f.treated),
      control_yield: toNumber(f.control),
      unit: f.unit,
      commodity_price: toNumber(f.price),
      eligible_cost_ha: toNumber(f.cost),
      criteria,
      notes: f.notes || null,
      report_path,
    };
    if (trial) check(await supabase.from("risk_zero_trials").update(row).eq("id", trial.id));
    else check(await supabase.from("risk_zero_trials").insert(row));

    // Coberto e com todos os critérios: oferece concluir "Resultado validado" na jornada
    const allCriteria = RZ_CRITERIA.every((c) => criteria[c.key]);
    if (result.conclusion === "coberto" && allCriteria) {
      const { data: steps } = await supabase
        .from("journey_steps")
        .select("id, done, step_order")
        .eq("opportunity_id", f.opportunity_id)
        .order("step_order");
      const target = (steps ?? []).find((s: { step_order: number }) => s.step_order === 10) as { id: string; done: boolean } | undefined;
      const prevDone = (steps ?? []).find((s: { step_order: number }) => s.step_order === 9) as { done: boolean } | undefined;
      if (target && !target.done && prevDone?.done && confirm('Resultado coberto. Concluir a etapa "Resultado validado" da jornada?')) {
        check(
          await supabase
            .from("journey_steps")
            .update({ done: true, completed_on: todayISO(), evidence: `Apuração Risco Zero: ganho ${money(result.gainPerHa)}/ha` })
            .eq("id", target.id),
        );
      }
    }
  }, [["trials"], ["journey"], ["opportunities"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Apuração salva.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={trial ? "Editar apuração" : "Registrar apuração Risco Zero"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Oportunidade" className="sm:col-span-2">
          <Select value={f.opportunity_id} onChange={set("opportunity_id")} required>
            <option value="">Selecione…</option>
            {(opps.data ?? [])
              .filter((o) => o.modality === "risco_zero")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {displayName(o.clients?.name ?? "")} · {o.products?.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Produtividade tratada">
          <Input inputMode="decimal" value={f.treated} onChange={set("treated")} />
        </Field>
        <Field label="Produtividade testemunha">
          <Input inputMode="decimal" value={f.control} onChange={set("control")} />
        </Field>
        <Field label="Unidade">
          <Select value={f.unit} onChange={set("unit")}>
            {["sc/ha", "@/ha", "t/ha", "kg/ha"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label={`Preço da commodity (R$ por ${f.unit.replace("/ha", "")})`}>
          <Input inputMode="decimal" value={f.price} onChange={set("price")} />
        </Field>
        <Field label="Custo elegível por ha (R$)" className="sm:col-span-2">
          <Input inputMode="decimal" value={f.cost} onChange={set("cost")} />
        </Field>
        <div className="rounded-lg bg-brand-50 p-3 text-sm sm:col-span-2">
          {result.conclusion === "pendente" ? (
            <>
              Conclusão: <strong>Pendente</strong>
              {result.minIncrement != null && ` · incremento mínimo para cobrir o custo: ${number(result.minIncrement)} ${f.unit}`}
            </>
          ) : (
            <>
              Incremento {number(result.increment)} {f.unit} · ganho {money(result.gainPerHa)}/ha ·{" "}
              <strong>{CONCLUSION[result.conclusion].label}</strong>
            </>
          )}
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Critérios</legend>
          {RZ_CRITERIA.map((c) => (
            <label key={c.key} className="mb-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!criteria[c.key]} onChange={(e) => setCriteria({ ...criteria, [c.key]: e.target.checked })} /> {c.label}
            </label>
          ))}
        </fieldset>
        <Field label="Laudo de colheita (anexo)" className="sm:col-span-2">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          {trial?.report_path && !file && <span className="mt-1 block text-xs text-ink/50">Já existe um laudo anexado.</span>}
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={set("notes")} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Salvar apuração</Button>
        </div>
      </form>
    </Modal>
  );
}

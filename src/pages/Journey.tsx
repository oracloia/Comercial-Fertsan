import { CheckCircle2, Circle, Paperclip, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { OpportunityDialog } from "../components/OpportunityDialog";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx, useToast } from "../components/ui";
import { displayName } from "../lib/calc";
import { useJourney, useMembers, useOpportunities, useSave } from "../lib/data";
import { dateBR, errorMessage, money0, todayISO } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import { MODALITY_LABEL, OPP_STATUS_LABEL, type JourneyStep } from "../lib/types";

export default function Journey() {
  const [params, setParams] = useSearchParams();
  const opps = useOpportunities();
  const members = useMembers();
  const opId = params.get("op") ?? opps.data?.[0]?.id;
  const opp = (opps.data ?? []).find((o) => o.id === opId);
  const steps = useJourney(opId);
  const [registering, setRegistering] = useState<JourneyStep | null>(null);
  const [editingOpp, setEditingOpp] = useState(false);
  const toast = useToast();
  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);

  const reopen = useSave(async (s: JourneyStep) => {
    check(await supabase.from("journey_steps").update({ done: false }).eq("id", s.id));
  }, [["journey"], ["opportunities"]]);

  async function onReopen(s: JourneyStep) {
    if (!confirm(`Reabrir a etapa "${s.name}"?`)) return;
    try {
      await reopen.mutateAsync(s);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage.from("evidencias").createSignedUrl(path, 300);
    if (error) return toast(error.message, "error");
    window.open(data.signedUrl, "_blank");
  }

  const nextStep = (steps.data ?? []).find((s) => !s.done);

  return (
    <>
      <PageHeader title="Linha do tempo" subtitle="Cada etapa depende da anterior. A etapa da oportunidade acompanha a jornada." />
      <div className="mb-4 max-w-xl">
        <Select value={opId ?? ""} onChange={(e) => setParams({ op: e.target.value })} aria-label="Oportunidade">
          {(opps.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {displayName(o.clients?.name ?? "—")} · {o.products?.name} · {money0(o.value_override ?? o.value)}
            </option>
          ))}
        </Select>
      </div>
      {!opp ? (
        opps.isLoading ? <Spinner /> : <Empty>Nenhuma oportunidade cadastrada.</Empty>
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex gap-1">
                  <Badge tone={opp.modality === "risco_zero" ? "brand" : "neutral"}>{MODALITY_LABEL[opp.modality]}</Badge>
                  <Badge tone={opp.status === "aberta" ? "ok" : "warn"}>{OPP_STATUS_LABEL[opp.status]}</Badge>
                </div>
                <h2 className="text-xl font-semibold">{displayName(opp.clients?.name ?? "")}</h2>
                <p className="text-sm text-ink/60">
                  {opp.products?.name} · {money0(opp.value_override ?? opp.value)} ·{" "}
                  {(opp.opportunity_owners ?? []).map((w) => memberName.get(w.member_id)).join(", ") || "sem responsável"}
                </p>
                {opp.status_reason && <p className="mt-1 text-sm text-amber-700">Motivo: {opp.status_reason}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditingOpp(true)}>
                  Pausar / perder / editar
                </Button>
                <Button disabled={!nextStep || opp.status === "perdida"} onClick={() => nextStep && setRegistering(nextStep)}>
                  Registrar etapa
                </Button>
              </div>
            </div>
          </Card>
          {steps.isLoading ? (
            <Spinner />
          ) : (
            <ol className="relative space-y-3 border-l-2 border-brand-100 pl-6">
              {(steps.data ?? []).map((s) => (
                <li key={s.id} className="relative">
                  <span className={cx("absolute -left-[34px] top-3 rounded-full bg-canvas", s.done ? "text-brand-500" : "text-slate-300")}>
                    {s.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </span>
                  <Card className={cx("p-4", s.id === nextStep?.id && "border-brand-400")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-ink/40">{String(s.step_order).padStart(2, "0")}</p>
                        <p className="font-medium">{s.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.done ? (
                          <>
                            <Badge tone="ok">Concluída em {dateBR(s.completed_on)}</Badge>
                            <button aria-label="Reabrir etapa" className="text-ink/40 hover:text-ink" onClick={() => void onReopen(s)}>
                              <RotateCcw size={14} />
                            </button>
                          </>
                        ) : s.id === nextStep?.id ? (
                          <Button size="sm" onClick={() => setRegistering(s)}>
                            Concluir
                          </Button>
                        ) : (
                          <Badge>Depende de {steps.data?.[s.step_order - 2]?.name.toLowerCase()}</Badge>
                        )}
                      </div>
                    </div>
                    {(s.evidence || s.responsible_id || s.attachment_path) && (
                      <div className="mt-2 text-sm text-ink/70">
                        {s.responsible_id && <p>Responsável: {memberName.get(s.responsible_id)}</p>}
                        {s.evidence && <p>Evidência: {s.evidence}</p>}
                        {s.attachment_path && (
                          <button className="mt-1 inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => void openAttachment(s.attachment_path!)}>
                            <Paperclip size={13} /> Anexo
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <StepDialog step={registering} onClose={() => setRegistering(null)} />
      <OpportunityDialog open={editingOpp} opportunity={opp} onClose={() => setEditingOpp(false)} />
    </>
  );
}

function StepDialog({ step, onClose }: { step: JourneyStep | null; onClose: () => void }) {
  const members = useMembers();
  const toast = useToast();
  const [responsible, setResponsible] = useState("");
  const [date, setDate] = useState(todayISO());
  const [evidence, setEvidence] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!step) return;
    setResponsible(step.responsible_id ?? "");
    setDate(todayISO());
    setEvidence(step.evidence ?? "");
    setFile(null);
  }, [step]);

  const save = useSave(async () => {
    if (!step) return;
    let attachment_path = step.attachment_path;
    if (file) {
      const path = `jornada/${step.opportunity_id}/${step.step_order}-${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("evidencias").upload(path, file);
      if (error) throw error;
      attachment_path = path;
    }
    check(
      await supabase
        .from("journey_steps")
        .update({ done: true, responsible_id: responsible || null, completed_on: date, evidence: evidence || null, attachment_path })
        .eq("id", step.id),
    );
  }, [["journey"], ["opportunities"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Etapa registrada.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={!!step} onClose={onClose} title={`Concluir etapa: ${step?.name ?? ""}`}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Responsável">
          <Select value={responsible} onChange={(e) => setResponsible(e.target.value)} required>
            <option value="">Selecione…</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data da conclusão">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Evidência / resultado / documento">
          <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </Field>
        <Field label="Anexo (opcional)">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Salvar registro</Button>
        </div>
      </form>
    </Modal>
  );
}

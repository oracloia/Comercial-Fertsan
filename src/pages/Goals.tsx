import { Pencil } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, cx, useToast } from "../components/ui";
import { displayName, quarterOf, summarizeProposal } from "../lib/calc";
import { useForecasts, useGoals, useMembers, useProducts, useProposals, useSave } from "../lib/data";
import { errorMessage, money0, toNumber } from "../lib/format";
import { check, supabase } from "../lib/supabase";

export default function Goals() {
  const { isManager } = useAuth();
  const members = useMembers();
  const goals = useGoals();
  const forecasts = useForecasts();
  const proposals = useProposals();
  const products = useProducts();
  const now = quarterOf(new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState(now.year);
  const [quarter, setQuarter] = useState<number | 0>(now.quarter);
  const [member, setMember] = useState("");
  const [editing, setEditing] = useState(false);

  // Vendedores sem nomes duplicados (lista vem da tabela de equipe, por id)
  const sellers = (members.data ?? []).filter((m) => m.active);
  const memberName = new Map((members.data ?? []).map((m) => [m.id, m.name]));
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.name]));

  const inQ = (q: number) => quarter === 0 || q === quarter;
  const fc = (forecasts.data ?? []).filter((f) => f.year === year && inQ(f.quarter) && (!member || f.member_id === member));
  const forecastTotal = fc.reduce((s, f) => s + Number(f.forecast), 0);
  const potentialTotal = fc.reduce((s, f) => s + Number(f.potential), 0);

  const goalTotal = (goals.data ?? [])
    .filter((g) => g.year === year && inQ(g.quarter) && (member ? g.member_id === member : g.member_id === null))
    .reduce((s, g) => s + Number(g.target), 0);

  // Realizado = propostas aceitas no período (valor garantido + Risco Zero)
  const realized = useMemo(() => {
    return (proposals.data ?? [])
      .filter((p) => p.status === "aceita" && p.accepted_on)
      .filter((p) => {
        const q = quarterOf(p.accepted_on!);
        return q.year === year && inQ(q.quarter) && (!member || p.owner_id === member);
      })
      .reduce((s, p) => {
        const sum = summarizeProposal(
          (p.proposal_items ?? []).map((i) => ({ ...i, unit_price: i.unit_price ?? null })),
          { enabled: false, area_ha: 0, price_ha: 0 },
        );
        return s + sum.maxWithRiskZero;
      }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals.data, year, quarter, member]);

  const byQuarter = [1, 2, 3, 4].map((q) =>
    (forecasts.data ?? []).filter((f) => f.year === year && f.quarter === q && (!member || f.member_id === member)).reduce((s, f) => s + Number(f.forecast), 0),
  );
  const maxQ = Math.max(1, ...byQuarter);

  return (
    <>
      <PageHeader
        title="Metas trimestrais"
        subtitle="Meta cadastrada é independente da previsão. Realizado vem das propostas aceitas."
        actions={
          isManager && (
            <Button onClick={() => setEditing(true)}>
              <Pencil size={16} /> Definir metas
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano">
          {[now.year - 1, now.year, now.year + 1].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {[1, 2, 3, 4, 0].map((q) => (
            <button key={q} onClick={() => setQuarter(q)} className={cx("rounded-md px-3 py-1.5", quarter === q && "bg-brand-50 font-medium text-brand-800")}>
              {q === 0 ? "Ano" : `${q}T${String(year).slice(2)}`}
            </button>
          ))}
        </div>
        <Select className="w-52" value={member} onChange={(e) => setMember(e.target.value)} aria-label="Vendedor">
          <option value="">Toda a equipe</option>
          {sellers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Previsão" value={money0(forecastTotal)} hint="Planilha de previsão importada" />
        <Stat label="Meta cadastrada" value={goalTotal ? money0(goalTotal) : "A definir"} hint={goalTotal ? `${Math.round((realized / goalTotal) * 100)}% atingido` : undefined} />
        <Stat label="Realizado" value={money0(realized)} hint="Propostas aceitas no período" />
        <Stat label="Potencial da seleção" value={money0(potentialTotal)} hint="Somatório por produto / cultura" />
      </div>

      <Card className="mb-6">
        <p className="mb-4 font-semibold">Distribuição da previsão por trimestre — {year}</p>
        <div className="flex h-40 items-end gap-4">
          {byQuarter.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs text-ink/60">{money0(v)}</span>
              <div className={cx("w-full rounded-t-md", quarter === i + 1 ? "bg-brand-700" : "bg-brand-200")} style={{ height: `${(v / maxQ) * 100}%`, minHeight: 2 }} />
              <span className="text-xs font-medium">{i + 1}T</span>
            </div>
          ))}
        </div>
      </Card>

      {fc.length === 0 ? (
        <Empty>Sem previsões para o filtro. Elas entram pela importação do backup/planilha de previsão.</Empty>
      ) : (
        <Table head={["Cliente", "Responsável", "Produto", "Trimestre", "Potencial", "Previsão"]}>
          {[...fc]
            .sort((a, b) => Number(b.forecast) - Number(a.forecast))
            .map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 font-medium">{displayName(f.client_label ?? "")}</td>
                <td className="px-4 py-3 text-ink/70">{f.member_id ? memberName.get(f.member_id) : "—"}</td>
                <td className="px-4 py-3 text-ink/70">{f.product_id ? productName.get(f.product_id) : "—"}</td>
                <td className="px-4 py-3 text-ink/70">
                  {f.quarter}T{String(f.year).slice(2)}
                </td>
                <td className="px-4 py-3 text-right">{money0(f.potential)}</td>
                <td className="px-4 py-3 text-right font-medium">{money0(f.forecast)}</td>
              </tr>
            ))}
        </Table>
      )}
      <GoalsDialog open={editing} year={year} onClose={() => setEditing(false)} />
    </>
  );
}

function GoalsDialog({ open, year, onClose }: { open: boolean; year: number; onClose: () => void }) {
  const members = useMembers();
  const goals = useGoals();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const people = [{ id: "", name: "Equipe (meta geral)" }, ...(members.data ?? []).filter((m) => m.active)];
  const key = (m: string, q: number) => `${m}|${q}`;
  const current = (m: string, q: number) => (goals.data ?? []).find((g) => g.year === year && g.quarter === q && (g.member_id ?? "") === m);

  const save = useSave(async () => {
    for (const [k, v] of Object.entries(values)) {
      const [m, qs] = k.split("|");
      const q = Number(qs);
      const target = toNumber(v);
      const existing = current(m ?? "", q);
      if (target == null) {
        if (existing) check(await supabase.from("quarterly_goals").delete().eq("id", existing.id));
      } else if (existing) {
        check(await supabase.from("quarterly_goals").update({ target }).eq("id", existing.id));
      } else {
        check(await supabase.from("quarterly_goals").insert({ member_id: m || null, year, quarter: q, target }));
      }
    }
  }, [["goals"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Metas salvas.");
      setValues({});
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Metas ${year} (R$)`} wide>
      <form onSubmit={submit}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink/60">
                <th className="py-2">Pessoa</th>
                {[1, 2, 3, 4].map((q) => (
                  <th key={q} className="py-2">
                    {q}T
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id || "team"}>
                  <td className="py-1 pr-3">{p.name}</td>
                  {[1, 2, 3, 4].map((q) => (
                    <td key={q} className="py-1 pr-2">
                      <Field label="" className="[&>span]:hidden">
                        <Input
                          inputMode="decimal"
                          value={values[key(p.id, q)] ?? current(p.id, q)?.target?.toString() ?? ""}
                          onChange={(e) => setValues({ ...values, [key(p.id, q)]: e.target.value })}
                        />
                      </Field>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Salvar metas</Button>
        </div>
      </form>
    </Modal>
  );
}

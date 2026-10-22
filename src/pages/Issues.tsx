import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Card, PageHeader, Select, Spinner, Table } from "../components/ui";
import { displayName, doseDeviation, proposalExpiry } from "../lib/calc";
import { useActivities, useAudit, useDuplicates, useOpportunities, useProducts, useProposals } from "../lib/data";
import { dateTimeBR, todayISO } from "../lib/format";
import { effectiveActivityStatus } from "../lib/types";

interface Issue {
  group: string;
  text: string;
  to: string;
}

const ENTITY_LABEL: Record<string, string> = {
  clients: "Clientes",
  channels: "Canais",
  opportunities: "Oportunidades",
  journey_steps: "Jornada",
  activities: "Agenda",
  proposals: "Propostas",
  risk_zero_trials: "Risco Zero",
  stock_movements: "Estoque",
  quarterly_goals: "Metas",
  products: "Produtos",
  team_members: "Equipe",
};

export default function Issues() {
  const { isManager } = useAuth();
  const products = useProducts();
  const opps = useOpportunities();
  const acts = useActivities();
  const proposals = useProposals();
  const dups = useDuplicates();
  const audit = useAudit();
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");

  const issues = useMemo(() => {
    const out: Issue[] = [];
    for (const p of products.data ?? []) {
      if (p.active && p.price_per_l == null) out.push({ group: "Produtos sem preço", text: `${p.name}: preço por litro não cadastrado.`, to: "/configuracoes" });
    }
    for (const d of dups.data ?? []) {
      out.push({ group: "Possíveis clientes duplicados", text: `${displayName(d.a_name)} × ${displayName(d.b_name)}`, to: "/clientes" });
    }
    const rescheduledIds = new Set((acts.data ?? []).map((a) => a.rescheduled_from_id).filter(Boolean));
    for (const a of acts.data ?? []) {
      const who = displayName(a.clients?.name ?? a.title);
      if (effectiveActivityStatus(a) === "vencida") out.push({ group: "Atividades vencidas", text: `${who} — ${a.kind} em ${dateTimeBR(a.starts_at, a.all_day)}`, to: "/agenda" });
      if (a.status === "reagendado" && !rescheduledIds.has(a.id)) out.push({ group: "Reagendadas sem nova data", text: `${who} — ${a.kind}`, to: "/agenda" });
    }
    for (const o of opps.data ?? []) {
      if (o.status !== "aberta") continue;
      const name = `${displayName(o.clients?.name ?? "")} · ${o.products?.name ?? ""}`;
      if (!(o.opportunity_owners ?? []).length) out.push({ group: "Oportunidades sem responsável", text: name, to: "/oportunidades" });
      if (!o.objective?.trim()) out.push({ group: "Oportunidades sem próxima ação", text: name, to: "/oportunidades" });
      const dev = doseDeviation(o.volume_l, o.area_ha, o.products?.default_dose_l_ha ?? 0);
      if (dev != null && Math.abs(dev) > 0.5) {
        out.push({
          group: "Dose fora do padrão",
          text: `${name}: ${(o.volume_l / (o.area_ha ?? 1)).toFixed(2)} L/ha contra ${o.products?.default_dose_l_ha} L/ha do catálogo.`,
          to: `/jornada?op=${o.id}`,
        });
      }
    }
    for (const p of proposals.data ?? []) {
      if (p.status === "enviada" && proposalExpiry(p.issued_on, p.validity_days) < todayISO()) {
        out.push({ group: "Propostas vencidas ainda como Enviada", text: `${p.number} — ${displayName(p.clients?.name ?? "")}`, to: `/propostas/${p.id}` });
      }
    }
    return out;
  }, [products.data, dups.data, acts.data, opps.data, proposals.data]);

  const groups = [...new Set(issues.map((i) => i.group))];
  const actors = [...new Set((audit.data ?? []).map((a) => a.actor_name).filter(Boolean))] as string[];
  const log = (audit.data ?? []).filter((a) => (!entity || a.entity === entity) && (!actor || a.actor_name === actor));

  return (
    <>
      <PageHeader title="Fontes e pendências" subtitle="Conferências automáticas antes da operação e histórico de alterações." />
      {products.isLoading || opps.isLoading ? (
        <Spinner />
      ) : issues.length === 0 ? (
        <Card className="mb-6 flex items-center gap-3">
          <CheckCircle2 className="text-brand-500" /> Nenhuma pendência encontrada.
        </Card>
      ) : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const list = issues.filter((i) => i.group === g);
            return (
              <Card key={g}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={16} className="text-amber-600" /> {g}
                  </p>
                  <Badge tone="warn">{list.length}</Badge>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {list.slice(0, 8).map((i, n) => (
                    <li key={n}>
                      <Link to={i.to} className="text-ink/80 hover:text-brand-700 hover:underline">
                        {i.text}
                      </Link>
                    </li>
                  ))}
                  {list.length > 8 && <li className="text-xs text-ink/50">+ {list.length - 8} outras</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Histórico de alterações</h2>
        <div className="flex gap-2">
          <Select className="w-44" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entidade">
            <option value="">Todas as áreas</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          {isManager && (
            <Select className="w-44" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Usuário">
              <option value="">Todos os usuários</option>
              {actors.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          )}
        </div>
      </div>
      <Table head={["Quando", "Quem", "Área", "Ação", "O que mudou"]}>
        {log.slice(0, 200).map((a) => (
          <tr key={a.id}>
            <td className="whitespace-nowrap px-4 py-2 text-xs">{dateTimeBR(a.at)}</td>
            <td className="px-4 py-2 text-xs">{a.actor_name ?? "Sistema"}</td>
            <td className="px-4 py-2 text-xs">{ENTITY_LABEL[a.entity] ?? a.entity}</td>
            <td className="px-4 py-2 text-xs">{a.action}</td>
            <td className="max-w-md truncate px-4 py-2 text-xs text-ink/60" title={JSON.stringify(a.diff)}>
              {a.action === "edição" && a.diff ? Object.keys(a.diff).join(", ") : ((a.diff as Record<string, unknown> | null)?.["name"] as string) ?? ""}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

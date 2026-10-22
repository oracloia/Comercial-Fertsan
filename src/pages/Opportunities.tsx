import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { OpportunityDialog } from "../components/OpportunityDialog";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, cx } from "../components/ui";
import { displayName, normalizeName } from "../lib/calc";
import { useMembers, useOpportunities } from "../lib/data";
import { hectares, liters, money0 } from "../lib/format";
import { JOURNEY_STEPS, MODALITY_LABEL, OPP_STATUS_LABEL, type Opportunity } from "../lib/types";

const STAGES = ["Prospecção", ...JOURNEY_STEPS];

export default function Opportunities() {
  const opps = useOpportunities();
  const members = useMembers();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [modality, setModality] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("ativas");
  const [view, setView] = useState<"cards" | "kanban">("cards");
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [creating, setCreating] = useState(false);

  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);

  const rows = useMemo(() => {
    const nq = normalizeName(q);
    return (opps.data ?? []).filter((o) => {
      if (status === "ativas" && !(o.status === "aberta" || o.status === "em_pausa")) return false;
      if (status !== "ativas" && status && o.status !== status) return false;
      if (stage && o.stage !== stage) return false;
      if (modality && o.modality !== modality) return false;
      if (owner && !(o.opportunity_owners ?? []).some((w) => w.member_id === owner)) return false;
      if (nq) {
        const hay = normalizeName(
          [
            o.clients?.name,
            o.products?.name,
            o.origin,
            o.objective,
            ...(o.opportunity_owners ?? []).map((w) => memberName.get(w.member_id)),
          ].join(" "),
        );
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [opps.data, q, stage, modality, owner, status, memberName]);

  const value = (o: Opportunity) => o.value_override ?? o.value;

  const card = (o: Opportunity) => {
    const owners = (o.opportunity_owners ?? []).map((w) => memberName.get(w.member_id)).filter(Boolean);
    return (
      <Card key={o.id} className="flex flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            <Badge tone={o.modality === "risco_zero" ? "brand" : "neutral"}>{MODALITY_LABEL[o.modality]}</Badge>
            {o.status !== "aberta" && <Badge tone={o.status === "ganha" ? "ok" : "warn"}>{OPP_STATUS_LABEL[o.status]}</Badge>}
          </div>
          <button onClick={() => setEditing(o)} className="text-xs text-brand-700 hover:underline">
            Editar
          </button>
        </div>
        <h3 className="mt-2 font-semibold">{displayName(o.clients?.name ?? "—")}</h3>
        <p className="text-xs text-ink/50">{o.products?.name}</p>
        <p className="mt-3 text-xl font-semibold text-brand-800">{money0(value(o))}</p>
        <p className="text-xs text-ink/60">
          {liters(o.volume_l)}
          {o.area_ha ? ` · ${hectares(o.area_ha)}` : ""}
        </p>
        <p className="mt-2 text-xs text-ink/70">{owners.length ? owners.join(", ") : <span className="text-amber-700">Sem responsável</span>}</p>
        {o.objective && <p className="mt-2 line-clamp-2 text-xs text-ink/60">{o.objective}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <Badge>{o.stage}</Badge>
          <Link to={`/jornada?op=${o.id}`} className="text-xs font-medium text-brand-700 hover:underline">
            Abrir jornada
          </Link>
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title="Oportunidades"
        subtitle="Relacionamentos, próximos passos e decisões com rastreabilidade."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Nova oportunidade
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          className="lg:col-span-2"
          placeholder="Buscar por cliente, responsável, produto ou origem…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select value={modality} onChange={(e) => setModality(e.target.value)} aria-label="Modalidade">
          <option value="">Todas as modalidades</option>
          <option value="risco_zero">Risco Zero</option>
          <option value="convencional">Convencional</option>
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {(members.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
            <option value="ativas">Ativas</option>
            <option value="">Todas</option>
            <option value="ganha">Ganhas</option>
            <option value="perdida">Perdidas</option>
          </Select>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button aria-label="Cartões" onClick={() => setView("cards")} className={cx("rounded-md p-1.5", view === "cards" && "bg-brand-50 text-brand-800")}>
              <LayoutGrid size={16} />
            </button>
            <button aria-label="Kanban" onClick={() => setView("kanban")} className={cx("rounded-md p-1.5", view === "kanban" && "bg-brand-50 text-brand-800")}>
              <Rows3 size={16} className="rotate-90" />
            </button>
          </div>
        </div>
      </div>
      <p className="mb-3 text-xs text-ink/50">
        {rows.length} {rows.length === 1 ? "oportunidade" : "oportunidades"} · {money0(rows.reduce((s, o) => s + value(o), 0))}. Valores de
        planejamento não representam pedidos ou faturamento.
      </p>

      {opps.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty>Nenhuma oportunidade encontrada.</Empty>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(card)}</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => {
            const col = rows.filter((o) => o.stage === s);
            return (
              <div key={s} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-sm font-semibold">{s}</p>
                  <span className="text-xs text-ink/50">{col.length}</span>
                </div>
                <div className="space-y-3">{col.map(card)}</div>
              </div>
            );
          })}
        </div>
      )}

      <OpportunityDialog open={creating || !!editing} opportunity={editing} onClose={() => (setCreating(false), setEditing(null))} />
    </>
  );
}

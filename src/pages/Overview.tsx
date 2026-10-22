import { ArrowUpRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { OpportunityDialog } from "../components/OpportunityDialog";
import { Badge, Button, Card, Empty, PageHeader, Stat } from "../components/ui";
import { displayName } from "../lib/calc";
import { useActivities, useClients, useMembers, useOpportunities } from "../lib/data";
import { initials, money0, plural } from "../lib/format";
import { MODALITY_LABEL, effectiveActivityStatus } from "../lib/types";

export default function Overview() {
  const opps = useOpportunities();
  const clients = useClients();
  const acts = useActivities();
  const members = useMembers();
  const [creating, setCreating] = useState(false);
  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);

  const open = (opps.data ?? []).filter((o) => o.status === "aberta" || o.status === "em_pausa");
  const valueOf = (o: { value_override: number | null; value: number }) => o.value_override ?? o.value;
  const pipeline = open.reduce((s, o) => s + valueOf(o), 0);
  const rz = open.filter((o) => o.modality === "risco_zero").reduce((s, o) => s + valueOf(o), 0);
  const overdue = (acts.data ?? []).filter((a) => effectiveActivityStatus(a) === "vencida");
  const upcoming = (acts.data ?? [])
    .filter((a) => {
      const s = effectiveActivityStatus(a);
      return s === "agendado" || s === "vencida";
    })
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Sua operação, em perspectiva."
        subtitle="Do primeiro contato ao resultado no campo. Tudo conectado."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Nova oportunidade
          </Button>
        }
      />

      <div className="mb-6 overflow-hidden rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white sm:p-8">
        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">Safra 26/27</span>
        <h2 className="mt-4 max-w-xl text-2xl font-semibold leading-snug sm:text-3xl">O próximo resultado começa com uma boa conversa.</h2>
        <p className="mt-2 text-sm text-brand-100/80">Acompanhe oportunidades e transforme visitas em avanço comercial.</p>
        <Link to="/agenda" className="mt-5 inline-flex items-center gap-1 text-sm font-medium hover:underline">
          Organizar minha agenda <ArrowUpRight size={15} />
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pipeline planejado" value={money0(pipeline)} hint={plural(open.length, "oportunidade aberta", "oportunidades abertas")} />
        <Stat label="Potencial Risco Zero" value={money0(rz)} hint="Valor condicional, não é receita" />
        <Stat label="Base de relacionamentos" value={(clients.data ?? []).length.toLocaleString("pt-BR")} hint="Clientes cadastrados" />
        <Stat label="Atividades vencidas" value={overdue.length} hint="Agendadas com data anterior a hoje" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Oportunidades em foco</h3>
            <Link to="/oportunidades" className="text-sm text-brand-700 hover:underline">
              Ver todas
            </Link>
          </div>
          {open.length === 0 ? (
            <Empty>Nenhuma oportunidade aberta.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...open]
                .sort((a, b) => valueOf(b) - valueOf(a))
                .slice(0, 6)
                .map((o) => {
                  const name = displayName(o.clients?.name ?? "—");
                  const owners = (o.opportunity_owners ?? []).map((w) => memberName.get(w.member_id)).filter(Boolean).join(", ");
                  return (
                    <li key={o.id} className="flex items-center gap-3 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                        {initials(name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="truncate text-xs text-ink/50">
                          {o.products?.name} · {owners || "Sem responsável"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{money0(valueOf(o))}</p>
                        <div className="mt-0.5 flex justify-end gap-1">
                          <Badge tone={o.modality === "risco_zero" ? "brand" : "neutral"}>{MODALITY_LABEL[o.modality]}</Badge>
                          <Badge>{o.stage}</Badge>
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Próximos passos</h3>
            <Link to="/agenda" className="text-sm text-brand-700 hover:underline">
              Agenda
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <Empty>Nada agendado.</Empty>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((a) => {
                const d = new Date(a.starts_at);
                const late = effectiveActivityStatus(a) === "vencida";
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <div className="w-12 shrink-0 rounded-lg bg-brand-50 py-1 text-center">
                      <p className="text-lg font-semibold leading-none text-brand-800">{String(d.getDate()).padStart(2, "0")}</p>
                      <p className="text-[10px] uppercase text-ink/50">{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{displayName(a.clients?.name ?? a.title)}</p>
                      <p className="truncate text-xs text-ink/50">{a.kind}</p>
                    </div>
                    {late && <Badge tone="danger">Prazo vencido</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 bg-brand-50">
        <p className="font-semibold">Risco Zero exige prova de resultado.</p>
        <p className="mt-1 text-sm text-ink/70">
          O valor em negociação só avança após apuração do incremento e validação das condições.{" "}
          <Link to="/risco-zero" className="text-brand-700 hover:underline">
            Acompanhar resultados
          </Link>
        </p>
      </Card>

      <OpportunityDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

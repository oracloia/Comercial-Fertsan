import { FileDown, Layers, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Empty, Notice, PageHeader, Spinner, cx, useToast } from "../components/ui";
import { displayName, proposalExpiry, summarizeProposal } from "../lib/calc";
import { useProducts, useProposals } from "../lib/data";
import { dateBR, errorMessage, money, todayISO } from "../lib/format";
import { proposalPdf } from "../lib/pdf";
import { PROPOSAL_STATUS_LABEL, type Proposal, type ProposalStatus } from "../lib/types";

const FILTERS: { key: string; label: string; match: (p: Proposal) => boolean }[] = [
  { key: "ativas", label: "Ativas", match: (p) => !["arquivada", "recusada"].includes(p.status) },
  { key: "todas", label: "Todas", match: () => true },
  ...(["rascunho", "pendente_aprovacao", "enviada", "aceita", "recusada", "arquivada"] as ProposalStatus[]).map((s) => ({
    key: s,
    label: PROPOSAL_STATUS_LABEL[s],
    match: (p: Proposal) => p.status === s,
  })),
];

const TONE: Record<ProposalStatus, "neutral" | "info" | "ok" | "danger" | "warn"> = {
  rascunho: "neutral",
  pendente_aprovacao: "warn",
  enviada: "info",
  aceita: "ok",
  recusada: "danger",
  arquivada: "neutral",
};

export default function Proposals() {
  const proposals = useProposals();
  const products = useProducts();
  const nav = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState("ativas");
  const [selected, setSelected] = useState<string[]>([]);

  const rows = useMemo(() => (proposals.data ?? []).filter(FILTERS.find((f) => f.key === filter)!.match), [proposals.data, filter]);
  const selectedProps = (proposals.data ?? []).filter((p) => selected.includes(p.id));
  const sameClient = selectedProps.length > 1 && selectedProps.every((p) => p.client_id === selectedProps[0]?.client_id);

  function combine() {
    if (!sameClient) return;
    nav(`/propostas/nova?combinar=${selected.join(",")}`);
  }

  async function pdf(p: Proposal) {
    try {
      await proposalPdf(p, p.proposal_items ?? [], products.data ?? []);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Propostas"
        subtitle="Propostas individuais ou conjuntas, com venda convencional, Risco Zero e Oráclo opcional."
        actions={
          <>
            <Button variant="secondary" disabled={!sameClient} onClick={combine} title="Selecione propostas do mesmo cliente">
              <Layers size={16} /> Combinar{selected.length > 1 ? ` (${selected.length})` : ""}
            </Button>
            <Button onClick={() => nav("/propostas/nova")}>
              <Plus size={16} /> Nova proposta
            </Button>
          </>
        }
      />
      {selected.length > 1 && !sameClient && <Notice tone="warn">Para combinar, selecione propostas do mesmo cliente.</Notice>}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              "rounded-full border px-3 py-1 text-sm",
              filter === f.key ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-ink/70",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {proposals.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty>Nenhuma proposta neste filtro.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const priceOf = new Map((products.data ?? []).map((x) => [x.id, x.price_per_l]));
            const s = summarizeProposal(
              (p.proposal_items ?? []).map((i) => ({ ...i, unit_price: i.unit_price ?? priceOf.get(i.product_id) ?? null })),
              { enabled: p.oraclo_enabled, area_ha: p.oraclo_area_ha, price_ha: p.oraclo_price_ha },
            );
            const names = [...new Set((p.proposal_items ?? []).map((i) => (products.data ?? []).find((x) => x.id === i.product_id)?.name))].filter(Boolean);
            const expired = p.status === "enviada" && proposalExpiry(p.issued_on, p.validity_days) < todayISO();
            return (
              <Card key={p.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={TONE[p.status]}>{PROPOSAL_STATUS_LABEL[p.status]}</Badge>
                    {expired && <Badge tone="danger">Vencida</Badge>}
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Selecionar para combinar"
                    checked={selected.includes(p.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
                  />
                </div>
                <p className="mt-2 text-xs text-ink/50">
                  {p.number} · v{p.version} · emitida em {dateBR(p.issued_on)}
                </p>
                <h3 className="font-semibold">{displayName(p.clients?.name ?? "")}</h3>
                <p className="text-xs text-ink/60">{names.join(" + ") || "Sem produtos"}</p>
                <p className="mt-3 text-xs text-ink/50">Investimento garantido</p>
                <p className="text-xl font-semibold text-brand-800">{money(s.guaranteed)}</p>
                <p className="text-xs text-ink/60">
                  Risco Zero: {money(s.riskZero)}
                  {s.bonus > 0 && ` · Bonificação: ${money(s.bonus)}`}
                </p>
                <div className="mt-auto flex justify-between pt-4">
                  <button className="text-sm font-medium text-brand-700 hover:underline" onClick={() => nav(`/propostas/${p.id}`)}>
                    Editar
                  </button>
                  <button className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" onClick={() => void pdf(p)}>
                    <FileDown size={14} /> PDF
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

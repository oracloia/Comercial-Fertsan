import { ArrowLeft, FileDown, History, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Textarea, cx, useToast } from "../components/ui";
import { displayName, itemTotals, summarizeProposal, type Modality } from "../lib/calc";
import { useClients, useOpportunities, useProducts, useProposals, useSave } from "../lib/data";
import { dateTimeBR, errorMessage, liters, money, plural, toNumber, todayISO } from "../lib/format";
import { proposalPdf } from "../lib/pdf";
import { check, supabase } from "../lib/supabase";
import { PROPOSAL_STATUS_LABEL, type Proposal, type ProposalItem, type ProposalStatus } from "../lib/types";

type Draft = Omit<Proposal, "id" | "number" | "version" | "updated_at" | "accepted_on" | "owner_id" | "clients" | "proposal_items"> & {
  id?: string;
  number?: string;
  version?: number;
};
type ItemDraft = Omit<ProposalItem, "area_ha" | "dose_l_ha" | "package_l" | "discount_pct"> & {
  area_ha: string;
  dose_l_ha: string;
  package_l: string;
  discount_pct: string;
};

const DEFAULT_CONDITIONS = "Acompanhamento técnico Fertsan nas aplicações.\nPrazo de entrega e pagamento a combinar.\nValores expressos em reais (R$).";
const DEFAULT_RZ =
  "Nas áreas de Risco Zero, o produto é aplicado com faixa testemunha lado a lado. O produtor só paga se o incremento de produtividade comprovado cobrir o custo elegível por hectare.";

function blankDraft(): Draft {
  return {
    client_id: "",
    opportunity_id: null,
    farm: "",
    city_uf: "",
    season: "2026/27",
    issued_on: todayISO(),
    validity_days: 30,
    status: "rascunho",
    presentation: "",
    oraclo_enabled: false,
    oraclo_area_ha: null,
    oraclo_price_ha: 14.8,
    oraclo_months: 12,
    conditions: DEFAULT_CONDITIONS,
    risk_zero_condition: DEFAULT_RZ,
  };
}

const toItemDraft = (i: ProposalItem): ItemDraft => ({
  ...i,
  area_ha: String(i.area_ha),
  dose_l_ha: String(i.dose_l_ha),
  package_l: String(i.package_l),
  discount_pct: String(i.discount_pct),
});

export default function ProposalEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = id === "nova";
  const nav = useNavigate();
  const toast = useToast();
  const proposals = useProposals();
  const products = useProducts();
  const clients = useClients();
  const opps = useOpportunities();

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Carrega a proposta (ou monta a combinação) uma única vez
  useEffect(() => {
    if (!proposals.data) return;
    const key = `${id}|${params.get("combinar") ?? ""}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    if (!isNew) {
      const p = proposals.data.find((x) => x.id === id);
      if (!p) return;
      const { clients: _c, proposal_items, updated_at: _u, accepted_on: _a, owner_id: _o, ...rest } = p;
      setDraft(rest);
      setItems([...(proposal_items ?? [])].sort((a, b) => a.position - b.position).map(toItemDraft));
    } else {
      const ids = (params.get("combinar") ?? "").split(",").filter(Boolean);
      const src = proposals.data.filter((x) => ids.includes(x.id));
      if (src.length) {
        const first = src[0]!;
        setDraft({
          ...blankDraft(),
          client_id: first.client_id,
          farm: first.farm,
          city_uf: first.city_uf,
          season: first.season,
          oraclo_enabled: src.some((s) => s.oraclo_enabled),
          oraclo_area_ha: Math.max(...src.map((s) => s.oraclo_area_ha ?? 0)) || null,
          presentation: `Proposta conjunta (${src.map((s) => s.number).join(", ")}).`,
        });
        setItems(src.flatMap((s) => s.proposal_items ?? []).map((i, n) => toItemDraft({ ...i, id: undefined, position: n })));
        setDirty(true);
      }
    }
  }, [proposals.data, id, isNew, params]);

  // Aviso ao sair com alterações não salvas
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (confirm("Há alterações não salvas. Sair mesmo assim?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const upd = (patch: Partial<Draft>) => (setDraft((d) => ({ ...d, ...patch })), setDirty(true));
  const updItem = (i: number, patch: Partial<ItemDraft>) => (setItems((xs) => xs.map((x, n) => (n === i ? { ...x, ...patch } : x))), setDirty(true));

  // Preço SEMPRE do catálogo atual (é o que o banco grava ao salvar)
  const priced = items.map((i) => ({
    product_id: i.product_id,
    modality: i.modality,
    area_ha: toNumber(i.area_ha) ?? 0,
    dose_l_ha: toNumber(i.dose_l_ha) ?? 0,
    discount_pct: toNumber(i.discount_pct) ?? 0,
    unit_price: productById.get(i.product_id)?.price_per_l ?? null,
  }));
  const summary = summarizeProposal(priced, { enabled: draft.oraclo_enabled, area_ha: draft.oraclo_area_ha, price_ha: draft.oraclo_price_ha });

  function addItem(modality: Modality) {
    const p = (products.data ?? []).find((x) => x.active && x.price_per_l != null);
    setItems((xs) => [
      ...xs,
      {
        position: xs.length,
        product_id: p?.id ?? "",
        modality,
        area_ha: "",
        dose_l_ha: String(p?.default_dose_l_ha ?? 1),
        package_l: String(p?.package_l ?? 5),
        discount_pct: "0",
        protocol: "",
      },
    ]);
    setDirty(true);
  }

  const save = useSave(async () => {
    if (!draft.client_id) throw new Error("Escolha o cliente.");
    if (items.length === 0) throw new Error("Adicione ao menos um produto.");
    if (summary.hasMissingPrice) throw new Error("Há produto com preço pendente — cadastre o preço em Configurações.");
    if (items.some((i) => !(toNumber(i.area_ha)! > 0) || !(toNumber(i.dose_l_ha)! > 0))) throw new Error("Informe área e dose em todos os itens.");
    const header = { ...draft, id: isNew ? null : draft.id };
    const payload = items.map((i, n) => ({
      product_id: i.product_id,
      modality: i.modality,
      area_ha: toNumber(i.area_ha),
      dose_l_ha: toNumber(i.dose_l_ha),
      package_l: toNumber(i.package_l) ?? 5,
      discount_pct: toNumber(i.discount_pct) ?? 0,
      protocol: i.protocol || null,
      position: n,
    }));
    return check(await supabase.rpc("save_proposal", { p_header: header, p_items: payload })) as string;
  }, [["proposals"]]);

  async function onSave() {
    try {
      const newId = await save.mutateAsync(undefined);
      setDirty(false);
      toast("Proposta salva.");
      if (isNew) setTimeout(() => nav(`/propostas/${newId as string}`, { replace: true }), 0);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  // Prévia/PDF NÃO salva nada: usa o rascunho em memória
  async function onPdf() {
    try {
      const fake: Proposal = {
        ...draft,
        id: draft.id ?? "rascunho",
        number: draft.number ?? "RASCUNHO",
        version: draft.version ?? 0,
        accepted_on: null,
        owner_id: null,
        updated_at: new Date().toISOString(),
        clients: (clients.data ?? []).find((c) => c.id === draft.client_id) ?? null,
      };
      const its: ProposalItem[] = items.map((i, n) => ({
        ...i,
        position: n,
        area_ha: toNumber(i.area_ha) ?? 0,
        dose_l_ha: toNumber(i.dose_l_ha) ?? 0,
        package_l: toNumber(i.package_l) ?? 5,
        discount_pct: toNumber(i.discount_pct) ?? 0,
        unit_price: productById.get(i.product_id)?.price_per_l ?? null,
      }));
      await proposalPdf(fake, its, products.data ?? [], dirty);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  if (!isNew && proposals.isLoading) return <Spinner />;
  if (!isNew && proposals.data && !proposals.data.some((p) => p.id === id)) return <p>Proposta não encontrada.</p>;

  const clientOpps = (opps.data ?? []).filter((o) => o.client_id === draft.client_id);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => nav("/propostas")}>
            <ArrowLeft size={16} /> Propostas
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{isNew ? "Nova proposta" : draft.number}</h1>
            <p className="text-xs text-ink/50">
              {!isNew && `v${draft.version ?? 1}`} {dirty && <span className="font-medium text-amber-700">· alterações não salvas</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
              <History size={16} /> Versões
            </Button>
          )}
          <Button variant="secondary" onClick={() => void onPdf()}>
            <FileDown size={16} /> Prévia / baixar PDF
          </Button>
          <Button onClick={() => void onSave()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar proposta"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 font-semibold">1. Cliente e proposta</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente" className="sm:col-span-2">
                <Select
                  value={draft.client_id}
                  onChange={(e) => {
                    const c = (clients.data ?? []).find((x) => x.id === e.target.value);
                    upd({
                      client_id: e.target.value,
                      opportunity_id: null,
                      farm: draft.farm || c?.farm || "",
                      city_uf: draft.city_uf || (c?.city ? `${displayName(c.city)}-${c.uf ?? ""}` : ""),
                    });
                  }}
                >
                  <option value="">Selecione…</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {displayName(c.name)}
                    </option>
                  ))}
                </Select>
              </Field>
              {clientOpps.length > 0 && (
                <Field label="Oportunidade vinculada" className="sm:col-span-2">
                  <Select value={draft.opportunity_id ?? ""} onChange={(e) => upd({ opportunity_id: e.target.value || null })}>
                    <option value="">—</option>
                    {clientOpps.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.products?.name} · {o.stage}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Fazenda">
                <Input value={draft.farm ?? ""} onChange={(e) => upd({ farm: e.target.value })} />
              </Field>
              <Field label="Cidade / UF">
                <Input value={draft.city_uf ?? ""} onChange={(e) => upd({ city_uf: e.target.value })} placeholder="Barreiras-BA" />
              </Field>
              <Field label="Safra">
                <Input value={draft.season} onChange={(e) => upd({ season: e.target.value })} />
              </Field>
              <Field label="Emissão">
                <Input type="date" value={draft.issued_on} onChange={(e) => upd({ issued_on: e.target.value })} />
              </Field>
              <Field label="Validade (dias)">
                <Input type="number" min={1} value={draft.validity_days} onChange={(e) => upd({ validity_days: Number(e.target.value) || 30 })} />
              </Field>
              <Field label="Situação">
                <Select value={draft.status} onChange={(e) => upd({ status: e.target.value as ProposalStatus })}>
                  {Object.entries(PROPOSAL_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Apresentação da proposta" className="sm:col-span-2">
                <Textarea value={draft.presentation ?? ""} onChange={(e) => upd({ presentation: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">2. Produtos e áreas</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => addItem("convencional")}>
                  <Plus size={14} /> Convencional
                </Button>
                <Button size="sm" variant="secondary" onClick={() => addItem("risco_zero")}>
                  <Plus size={14} /> Risco Zero
                </Button>
              </div>
            </div>
            <p className="mb-4 text-xs text-ink/50">Use linhas separadas para a área convencional e a área em Risco Zero, inclusive para o mesmo produto.</p>
            {items.length === 0 && <p className="text-sm text-ink/50">Nenhum produto adicionado.</p>}
            <div className="space-y-4">
              {items.map((it, n) => {
                const p = productById.get(it.product_id);
                const t = itemTotals(priced[n]!);
                return (
                  <div key={n} className={cx("rounded-xl border p-4", it.modality === "risco_zero" ? "border-brand-200 bg-brand-50/50" : "border-slate-200")}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Item {n + 1} <Badge tone={it.modality === "risco_zero" ? "brand" : "neutral"}>{it.modality === "risco_zero" ? "Risco Zero" : "Convencional"}</Badge>
                      </p>
                      <button aria-label="Remover item" className="text-ink/40 hover:text-red-600" onClick={() => (setItems(items.filter((_, i) => i !== n)), setDirty(true))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Produto">
                        <Select
                          value={it.product_id}
                          onChange={(e) => {
                            const np = productById.get(e.target.value);
                            updItem(n, { product_id: e.target.value, dose_l_ha: String(np?.default_dose_l_ha ?? it.dose_l_ha), package_l: String(np?.package_l ?? it.package_l) });
                          }}
                        >
                          {(products.data ?? [])
                            .filter((x) => x.active || x.id === it.product_id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                                {x.price_per_l == null ? " (preço pendente)" : ""}
                              </option>
                            ))}
                        </Select>
                      </Field>
                      <Field label="Modalidade">
                        <Select value={it.modality} onChange={(e) => updItem(n, { modality: e.target.value as Modality })}>
                          <option value="convencional">Convencional</option>
                          <option value="risco_zero">Risco Zero</option>
                        </Select>
                      </Field>
                      <Field label="Área (ha)">
                        <Input inputMode="decimal" value={it.area_ha} onChange={(e) => updItem(n, { area_ha: e.target.value })} />
                      </Field>
                      <Field label="Dose total (L/ha)">
                        <Input inputMode="decimal" value={it.dose_l_ha} onChange={(e) => updItem(n, { dose_l_ha: e.target.value })} />
                      </Field>
                      <Field label="Embalagem (L)">
                        <Input inputMode="decimal" value={it.package_l} onChange={(e) => updItem(n, { package_l: e.target.value })} />
                      </Field>
                      <Field label="Desconto (%)">
                        <Input inputMode="decimal" value={it.discount_pct} onChange={(e) => updItem(n, { discount_pct: e.target.value })} />
                      </Field>
                      <Field label="Protocolo / aplicações" className="sm:col-span-3">
                        <Textarea rows={2} value={it.protocol ?? ""} onChange={(e) => updItem(n, { protocol: e.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      {t.missingPrice ? (
                        <span className="text-red-700">Preço pendente — cadastre em Configurações.</span>
                      ) : (
                        <span className="text-ink/60">
                          Tabela: {money(p?.price_per_l)}/L · Volume: {liters(t.volume_l)}
                          {p && t.volume_l > 0 && ` (${Math.ceil(t.volume_l / (toNumber(it.package_l) || p.package_l))} emb.)`} · Preço final: {money(t.final_price)}/L
                        </span>
                      )}
                      <strong className="text-base">{money(t.subtotal)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">3. Bonificação Oráclo</h2>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.oraclo_enabled} onChange={(e) => upd({ oraclo_enabled: e.target.checked })} /> Incluir licença bonificada pela Fertsan
            </label>
            {draft.oraclo_enabled && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Área coberta (ha)">
                  <Input inputMode="decimal" value={draft.oraclo_area_ha ?? ""} onChange={(e) => upd({ oraclo_area_ha: toNumber(e.target.value) })} />
                </Field>
                <Field label="Valor de referência (R$/ha)">
                  <Input inputMode="decimal" value={draft.oraclo_price_ha} onChange={(e) => upd({ oraclo_price_ha: toNumber(e.target.value) ?? 0 })} />
                </Field>
                <Field label="Licença (meses)">
                  <Input type="number" min={1} value={draft.oraclo_months} onChange={(e) => upd({ oraclo_months: Number(e.target.value) || 12 })} />
                </Field>
              </div>
            )}
            <p className="mt-3 text-xs text-ink/50">A bonificação aparece no pacote, mas não entra no valor devido pelo produtor.</p>
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">4. Condições e Risco Zero</h2>
            <Field label="Condições comerciais — uma por linha">
              <Textarea rows={4} value={draft.conditions} onChange={(e) => upd({ conditions: e.target.value })} />
            </Field>
            <Field label="Condição Risco Zero" className="mt-4">
              <Textarea rows={4} value={draft.risk_zero_condition} onChange={(e) => upd({ risk_zero_condition: e.target.value })} />
            </Field>
            <p className="mt-3 text-xs text-ink/50">O PDF traz os campos de aceite e assinatura. Gerar o arquivo não registra aceite nem faturamento.</p>
          </Card>
        </div>

        <div>
          <Card className="sticky top-20">
            <h2 className="mb-4 font-semibold">Resumo do investimento</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/60">Pacote completo</dt>
                <dd>{money(summary.fullPackage)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Bonificação Fertsan</dt>
                <dd>− {money(summary.bonus)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Condicionado ao Risco Zero</dt>
                <dd>{money(summary.riskZero)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-semibold">
                <dt>Investimento garantido do produtor</dt>
                <dd className="text-brand-800">{money(summary.guaranteed)}</dd>
              </div>
            </dl>
            {summary.riskZero > 0 && (
              <p className="mt-4 rounded-lg bg-brand-50 p-3 text-xs text-ink/70">
                Com resultado comprovado em todas as áreas de Risco Zero, o total do produtor poderá chegar a {money(summary.maxWithRiskZero)}.
              </p>
            )}
            {summary.hasMissingPrice && <p className="mt-3 text-xs text-red-700">Há item com preço pendente; a proposta não pode ser salva.</p>}
            <p className="mt-4 text-xs text-ink/50">
              {plural(summary.itemCount, "item", "itens")} · {plural(summary.productCount, "produto", "produtos")}
            </p>
            <Button className="mt-4 w-full" onClick={() => void onSave()} disabled={save.isPending}>
              Salvar proposta
            </Button>
          </Card>
        </div>
      </div>
      {!isNew && draft.id && <VersionsDialog open={historyOpen} proposalId={draft.id} onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

function VersionsDialog({ open, proposalId, onClose }: { open: boolean; proposalId: string; onClose: () => void }) {
  const [rows, setRows] = useState<{ version: number; saved_at: string; snapshot: { items?: { area_ha: number; unit_price: number; dose_l_ha: number; discount_pct: number }[] } }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    void supabase
      .from("proposal_versions")
      .select("version, saved_at, snapshot")
      .eq("proposal_id", proposalId)
      .order("version", { ascending: false })
      .then(({ data }) => setRows((data as typeof rows) ?? []));
  }, [open, proposalId]);
  return (
    <Modal open={open} onClose={onClose} title="Histórico de versões">
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/60">Sem versões registradas.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => {
            const total = (r.snapshot.items ?? []).reduce((s, i) => s + i.area_ha * i.dose_l_ha * i.unit_price * (1 - i.discount_pct / 100), 0);
            return (
              <li key={r.version} className="flex justify-between py-2">
                <span>
                  v{r.version} · {dateTimeBR(r.saved_at)}
                </span>
                <span className="text-ink/60">{money(total)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

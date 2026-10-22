// Regras de negócio puras (sem acesso ao banco), cobertas por testes.

export type Modality = "convencional" | "risco_zero";

export interface PricedItem {
  modality: Modality;
  area_ha: number;
  dose_l_ha: number;
  discount_pct: number;
  /** Preço de tabela R$/L vindo do catálogo; null = preço pendente */
  unit_price: number | null;
}

export interface ItemTotals {
  volume_l: number;
  final_price: number;
  subtotal: number;
  missingPrice: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function itemTotals(it: PricedItem): ItemTotals {
  const volume = round2((it.area_ha || 0) * (it.dose_l_ha || 0));
  if (it.unit_price == null) {
    return { volume_l: volume, final_price: 0, subtotal: 0, missingPrice: true };
  }
  const disc = Math.min(Math.max(it.discount_pct || 0, 0), 100);
  const finalPrice = round2(it.unit_price * (1 - disc / 100));
  return { volume_l: volume, final_price: finalPrice, subtotal: round2(volume * finalPrice), missingPrice: false };
}

export interface OracloBonus {
  enabled: boolean;
  area_ha: number | null;
  price_ha: number;
}

export interface ProposalSummary {
  conventional: number;
  riskZero: number;
  bonus: number;
  /** Pacote completo = itens + bonificação Oráclo */
  fullPackage: number;
  /** O que o produtor paga de qualquer forma (só itens convencionais) */
  guaranteed: number;
  /** Máximo a pagar se todas as áreas de Risco Zero comprovarem resultado */
  maxWithRiskZero: number;
  itemCount: number;
  productCount: number;
  hasMissingPrice: boolean;
}

export function summarizeProposal(
  items: (PricedItem & { product_id: string })[],
  oraclo: OracloBonus,
): ProposalSummary {
  let conventional = 0;
  let riskZero = 0;
  let hasMissingPrice = false;
  for (const it of items) {
    const t = itemTotals(it);
    if (t.missingPrice) hasMissingPrice = true;
    if (it.modality === "risco_zero") riskZero += t.subtotal;
    else conventional += t.subtotal;
  }
  const bonus = oraclo.enabled ? round2((oraclo.area_ha || 0) * (oraclo.price_ha || 0)) : 0;
  conventional = round2(conventional);
  riskZero = round2(riskZero);
  return {
    conventional,
    riskZero,
    bonus,
    fullPackage: round2(conventional + riskZero + bonus),
    guaranteed: conventional,
    maxWithRiskZero: round2(conventional + riskZero),
    itemCount: items.length,
    productCount: new Set(items.map((i) => i.product_id)).size,
    hasMissingPrice,
  };
}

export interface RiskZeroTrialInput {
  treated_yield: number | null;
  control_yield: number | null;
  commodity_price: number | null;
  eligible_cost_ha: number | null;
}

export type RiskZeroConclusion = "coberto" | "nao_coberto" | "pendente";

export function riskZeroResult(t: RiskZeroTrialInput): {
  increment: number | null;
  gainPerHa: number | null;
  minIncrement: number | null;
  conclusion: RiskZeroConclusion;
} {
  const { treated_yield, control_yield, commodity_price, eligible_cost_ha } = t;
  const minIncrement =
    commodity_price && commodity_price > 0 && eligible_cost_ha != null
      ? round2(eligible_cost_ha / commodity_price)
      : null;
  if (treated_yield == null || control_yield == null || commodity_price == null || eligible_cost_ha == null) {
    return { increment: null, gainPerHa: null, minIncrement, conclusion: "pendente" };
  }
  const increment = round2(treated_yield - control_yield);
  const gainPerHa = round2(increment * commodity_price);
  return {
    increment,
    gainPerHa,
    minIncrement,
    conclusion: gainPerHa >= eligible_cost_ha ? "coberto" : "nao_coberto",
  };
}

/** Data de vencimento de uma proposta (emissão + validade em dias), em ISO yyyy-mm-dd. */
export function proposalExpiry(issuedOn: string, validityDays: number): string {
  const [y = 1970, m = 1, d = 1] = issuedOn.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + validityDays));
  return dt.toISOString().slice(0, 10);
}

/** Dose real (L/ha) da oportunidade comparada com a dose padrão do produto. */
export function doseDeviation(volume_l: number, area_ha: number | null, defaultDose: number): number | null {
  if (!area_ha || area_ha <= 0 || !defaultDose) return null;
  const dose = volume_l / area_ha;
  return round2((dose - defaultDose) / defaultDose);
}

export function quarterOf(isoDate: string): { year: number; quarter: number } {
  const [y = 1970, m = 1] = isoDate.split("-").map(Number);
  return { year: y, quarter: Math.floor((m - 1) / 3) + 1 };
}

/** Normaliza nomes para comparação (sem acentos, minúsculo, só letras/números). */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LOWER_WORDS = new Set(["da", "de", "do", "das", "dos", "e"]);
const UPPER_WORDS = new Set(["ltda", "me", "epp", "sa", "s/a", "eireli", "ii", "iii"]);

/** Exibe nomes em "Title Case" respeitando preposições e siglas societárias. */
export function displayName(s: string): string {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      if (UPPER_WORDS.has(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

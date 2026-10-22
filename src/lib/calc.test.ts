import { describe, expect, it } from "vitest";
import {
  displayName,
  doseDeviation,
  itemTotals,
  normalizeName,
  proposalExpiry,
  quarterOf,
  riskZeroResult,
  summarizeProposal,
} from "./calc";

describe("itemTotals", () => {
  it("calcula volume e subtotal a partir do preço do catálogo", () => {
    const t = itemTotals({ modality: "convencional", area_ha: 1500, dose_l_ha: 2, discount_pct: 0, unit_price: 60 });
    expect(t.volume_l).toBe(3000);
    expect(t.subtotal).toBe(180000);
  });

  it("aplica desconto no preço por litro", () => {
    const t = itemTotals({ modality: "convencional", area_ha: 100, dose_l_ha: 1, discount_pct: 10, unit_price: 60 });
    expect(t.final_price).toBe(54);
    expect(t.subtotal).toBe(5400);
  });

  it("produto sem preço não vira R$ 0 silencioso: marca preço pendente", () => {
    const t = itemTotals({ modality: "convencional", area_ha: 100, dose_l_ha: 1, discount_pct: 0, unit_price: null });
    expect(t.missingPrice).toBe(true);
  });
});

describe("summarizeProposal", () => {
  // Mesmo cenário observado na plataforma original
  const items = [
    { product_id: "poly", modality: "convencional" as const, area_ha: 1500, dose_l_ha: 2, discount_pct: 0, unit_price: 60 },
    { product_id: "poly", modality: "risco_zero" as const, area_ha: 500, dose_l_ha: 2, discount_pct: 0, unit_price: 60 },
  ];
  const s = summarizeProposal(items, { enabled: true, area_ha: 3200, price_ha: 14.8 });

  it("separa convencional, Risco Zero e bonificação", () => {
    expect(s.guaranteed).toBe(180000);
    expect(s.riskZero).toBe(60000);
    expect(s.bonus).toBe(47360);
    expect(s.fullPackage).toBe(287360);
    expect(s.maxWithRiskZero).toBe(240000);
  });

  it("conta itens e produtos distintos", () => {
    expect(s.itemCount).toBe(2);
    expect(s.productCount).toBe(1);
  });

  it("bonificação desligada não soma", () => {
    expect(summarizeProposal(items, { enabled: false, area_ha: 3200, price_ha: 14.8 }).bonus).toBe(0);
  });
});

describe("riskZeroResult", () => {
  it("coberto quando ganho/ha >= custo elegível", () => {
    const r = riskZeroResult({ treated_yield: 68, control_yield: 64, commodity_price: 120, eligible_cost_ha: 400 });
    expect(r.increment).toBe(4);
    expect(r.gainPerHa).toBe(480);
    expect(r.conclusion).toBe("coberto");
  });
  it("não coberto quando o ganho não paga o custo", () => {
    const r = riskZeroResult({ treated_yield: 65, control_yield: 64, commodity_price: 120, eligible_cost_ha: 400 });
    expect(r.conclusion).toBe("nao_coberto");
  });
  it("pendente sem dados completos, mas informa incremento mínimo", () => {
    const r = riskZeroResult({ treated_yield: null, control_yield: 64, commodity_price: 120, eligible_cost_ha: 360 });
    expect(r.conclusion).toBe("pendente");
    expect(r.minIncrement).toBe(3);
  });
});

describe("utilitários", () => {
  it("vencimento da proposta", () => {
    expect(proposalExpiry("2026-10-22", 30)).toBe("2026-11-21");
  });
  it("trimestre", () => {
    expect(quarterOf("2026-10-22")).toEqual({ year: 2026, quarter: 4 });
    expect(quarterOf("2026-03-31")).toEqual({ year: 2026, quarter: 1 });
  });
  it("desvio de dose", () => {
    expect(doseDeviation(200, 100, 4)).toBe(-0.5);
    expect(doseDeviation(200, null, 4)).toBeNull();
  });
  it("normaliza nomes para achar duplicados", () => {
    expect(normalizeName("Dirceu Didomênico")).toBe(normalizeName("DIRCEU DIDOMENICO"));
  });
  it("exibe nomes padronizados", () => {
    expect(displayName("FAZENDA SÃO JOÃO")).toBe("Fazenda São João");
    expect(displayName("R3 COMERCIAL LTDA")).toBe("R3 Comercial LTDA");
    expect(displayName("ana paula da silva")).toBe("Ana Paula da Silva");
  });
});

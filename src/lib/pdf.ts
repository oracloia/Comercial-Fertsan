import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { displayName, itemTotals, proposalExpiry, summarizeProposal } from "./calc";
import { dateBR, liters, money, number } from "./format";
import type { Product, Proposal, ProposalItem } from "./types";

const TEAL: [number, number, number] = [15, 110, 106];
const INK: [number, number, number] = [18, 48, 46];

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/fertsan-logo.png");
    const blob = await res.blob();
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = () => ok(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Gera o PDF da proposta a partir dos dados recebidos (rascunho em memória ou proposta salva).
 * Não grava nada no banco.
 */
export async function proposalPdf(p: Proposal, items: ProposalItem[], products: Product[], draft = false) {
  const prod = new Map(products.map((x) => [x.id, x]));
  const priced = items.map((i) => ({ ...i, unit_price: i.unit_price ?? prod.get(i.product_id)?.price_per_l ?? null }));
  const s = summarizeProposal(priced, { enabled: p.oraclo_enabled, area_ha: p.oraclo_area_ha, price_ha: p.oraclo_price_ha });
  if (s.hasMissingPrice) throw new Error("Há produto com preço pendente - cadastre o preço antes de gerar o PDF.");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const logo = await loadLogo();

  // Cabeçalho
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 62, "F");
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 10, 62, 24, 3, 3, "F");
    doc.addImage(logo, "PNG", 17, 12.5, 56, 19.7);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text("PROPOSTA COMERCIAL · " + p.season.toUpperCase(), 14, 44);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const names = [...new Set(priced.map((i) => prod.get(i.product_id)?.name ?? ""))].filter(Boolean);
  doc.text((names.join(" + ") + (p.oraclo_enabled ? " + Oráclo" : "")).toUpperCase(), 14, 53, { maxWidth: W - 90 });
  doc.setFont("helvetica", "normal");

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - 74, 10, 60, 32, 2, 2, "F");
  doc.setTextColor(...INK);
  doc.setFontSize(7);
  doc.text("PREPARADO PARA", W - 70, 17);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(displayName(p.clients?.name ?? ""), W - 70, 23, { maxWidth: 52 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text([p.farm ?? "", p.city_uf ?? ""].filter(Boolean).join(" · "), W - 70, 30, { maxWidth: 52 });
  doc.text(`${p.number} · v${p.version || 1}`, W - 70, 38);

  let y = 72;
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(
    `Emissão: ${dateBR(p.issued_on)}   ·   Validade: ${p.validity_days} dias (até ${dateBR(proposalExpiry(p.issued_on, p.validity_days))})`,
    14,
    y,
  );
  y += 6;
  if (p.presentation) {
    const lines = doc.splitTextToSize(p.presentation, W - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 2;
  }

  // Tabela de investimento
  autoTable(doc, {
    startY: y + 2,
    head: [["Produto", "Modalidade", "Área", "Dose", "Volume", "R$/L", "Subtotal"]],
    body: priced.map((i) => {
      const t = itemTotals(i);
      return [
        prod.get(i.product_id)?.name ?? "",
        i.modality === "risco_zero" ? "Risco Zero" : "Convencional",
        `${number(i.area_ha)} ha`,
        `${number(i.dose_l_ha)} L/ha`,
        liters(t.volume_l),
        money(t.final_price),
        money(t.subtotal),
      ];
    }),
    styles: { fontSize: 8, textColor: INK },
    headStyles: { fillColor: TEAL },
    columnStyles: { 6: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  const protocols = priced.filter((i) => i.protocol);
  if (protocols.length) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Protocolos", 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    for (const i of protocols) {
      const lines = doc.splitTextToSize(`${prod.get(i.product_id)?.name}: ${i.protocol}`, W - 28);
      doc.text(lines, 14, y);
      y += lines.length * 4.5;
    }
    y += 3;
  }

  // Resumo
  const rows: [string, string][] = [
    ["Pacote completo", money(s.fullPackage)],
    ["Bonificação Fertsan (Oráclo)", s.bonus ? `- ${money(s.bonus)}` : money(0)],
    ["Condicionado ao Risco Zero", money(s.riskZero)],
    ["Investimento garantido do produtor", money(s.guaranteed)],
  ];
  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "plain",
    styles: { fontSize: 9, textColor: INK },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (d) => {
      if (d.row.index === 3) {
        d.cell.styles.fillColor = [236, 246, 244];
        d.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: W / 2, right: 14 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 5;
  if (s.riskZero > 0) {
    doc.setFontSize(8);
    doc.text(`Com resultado comprovado em todas as áreas de Risco Zero, o total poderá chegar a ${money(s.maxWithRiskZero)}.`, 14, y, { maxWidth: W - 28 });
    y += 8;
  }
  if (p.oraclo_enabled) {
    doc.setFontSize(8);
    doc.text(
      `Licença Oráclo bonificada: ${number(p.oraclo_area_ha ?? 0)} ha · ${p.oraclo_months} meses · referência ${money(p.oraclo_price_ha)}/ha. A bonificação não entra no valor devido pelo produtor.`,
      14,
      y,
      { maxWidth: W - 28 },
    );
    y += 9;
  }

  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 20;
    }
  };

  // Condições
  ensure(30);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Condições comerciais", 14, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  for (const line of p.conditions.split("\n").filter(Boolean)) {
    const l = doc.splitTextToSize(`- ${line}`, W - 28);
    ensure(l.length * 4.5);
    doc.text(l, 14, y);
    y += l.length * 4.5;
  }
  if (s.riskZero > 0 && p.risk_zero_condition) {
    y += 3;
    ensure(20);
    doc.setFont("helvetica", "bold");
    doc.text("Condição Risco Zero", 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    const l = doc.splitTextToSize(p.risk_zero_condition, W - 28);
    ensure(l.length * 4.5);
    doc.text(l, 14, y);
    y += l.length * 4.5;
  }

  // Aceite
  ensure(40);
  y += 14;
  doc.setDrawColor(...INK);
  doc.line(14, y, 90, y);
  doc.line(W - 90, y, W - 14, y);
  doc.setFontSize(8);
  doc.text("Produtor - aceite e assinatura", 14, y + 5);
  doc.text("Fertsan - representante", W - 90, y + 5);
  doc.text("Data: ____/____/______", 14, y + 11);

  // Rodapé
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 130);
    doc.text(`FERTSAN · Ciência semeando produtividade${draft ? " · PRÉVIA - alterações não salvas" : ""}`, 14, 291);
    doc.text(`${i}/${pages}`, W - 14, 291, { align: "right" });
  }

  doc.save(`${p.number || "proposta"}-${displayName(p.clients?.name ?? "cliente").replace(/\s+/g, "-")}.pdf`);
}

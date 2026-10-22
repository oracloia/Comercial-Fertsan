import type { Modality } from "./calc";

export type Role = "admin" | "gestor" | "vendedor";
export type OpportunityStatus = "aberta" | "em_pausa" | "perdida" | "ganha";
export type ActivityStatus = "agendado" | "realizado" | "reagendado" | "cancelado";
export type ProposalStatus = "rascunho" | "pendente_aprovacao" | "enviada" | "aceita" | "recusada" | "arquivada";
export type StockKind = "entrada" | "saida" | "reserva" | "ajuste";

export interface Member {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  active: boolean;
  user_id: string | null;
}

export interface Product {
  id: string;
  name: string;
  culture: string | null;
  price_per_l: number | null;
  default_dose_l_ha: number;
  package_l: number;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  name_norm: string;
  farm: string | null;
  city: string | null;
  uf: string | null;
  kind: string;
  status: "Ativo" | "Inativo";
  phone: string | null;
  email: string | null;
  owner_id: string | null;
  origin: string | null;
  total_area_ha: number | null;
  notes: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  kind: "Finder" | "Distribuidor" | "Revenda" | "Consultoria";
  focal_point: string | null;
  finder_name: string | null;
  client_id: string | null;
  stage: string;
  next_action: string | null;
  owner_id: string | null;
}

export interface Opportunity {
  id: string;
  client_id: string;
  product_id: string;
  modality: Modality;
  area_ha: number | null;
  volume_l: number;
  unit_price: number | null;
  value: number;
  value_override: number | null;
  override_reason: string | null;
  stage: string;
  status: OpportunityStatus;
  status_reason: string | null;
  objective: string | null;
  origin: string | null;
  created_by: string | null;
  created_at: string;
  clients?: Pick<Client, "id" | "name" | "city" | "uf"> | null;
  products?: Pick<Product, "id" | "name" | "default_dose_l_ha"> | null;
  opportunity_owners?: { member_id: string }[];
}

export interface JourneyStep {
  id: string;
  opportunity_id: string;
  step_order: number;
  name: string;
  done: boolean;
  responsible_id: string | null;
  completed_on: string | null;
  evidence: string | null;
  attachment_path: string | null;
}

export interface Activity {
  id: string;
  client_id: string | null;
  opportunity_id: string | null;
  title: string;
  kind: string;
  starts_at: string;
  all_day: boolean;
  location: string | null;
  status: ActivityStatus;
  notes: string | null;
  rescheduled_from_id: string | null;
  clients?: Pick<Client, "id" | "name"> | null;
  activity_owners?: { member_id: string }[];
}

export interface Proposal {
  id: string;
  number: string;
  version: number;
  client_id: string;
  opportunity_id: string | null;
  farm: string | null;
  city_uf: string | null;
  season: string;
  issued_on: string;
  validity_days: number;
  status: ProposalStatus;
  presentation: string | null;
  oraclo_enabled: boolean;
  oraclo_area_ha: number | null;
  oraclo_price_ha: number;
  oraclo_months: number;
  conditions: string;
  risk_zero_condition: string;
  accepted_on: string | null;
  owner_id: string | null;
  updated_at: string;
  clients?: Pick<Client, "id" | "name"> | null;
  proposal_items?: ProposalItem[];
}

export interface ProposalItem {
  id?: string;
  proposal_id?: string;
  position: number;
  product_id: string;
  modality: Modality;
  area_ha: number;
  dose_l_ha: number;
  package_l: number;
  discount_pct: number;
  protocol: string | null;
  unit_price?: number | null;
}

export interface RiskZeroTrial {
  id: string;
  opportunity_id: string;
  treated_yield: number | null;
  control_yield: number | null;
  unit: string;
  commodity_price: number | null;
  eligible_cost_ha: number | null;
  criteria: Record<string, boolean>;
  report_path: string | null;
  notes: string | null;
  created_at: string;
}

export interface StockMovement {
  id: string;
  moved_on: string;
  product_id: string;
  lot: string | null;
  warehouse: string | null;
  expires_on: string | null;
  kind: StockKind;
  volume_l: number;
  proposal_id: string | null;
  notes: string | null;
}

export interface Goal {
  id: string;
  member_id: string | null;
  year: number;
  quarter: number;
  target: number;
}

export interface Forecast {
  id: string;
  client_id: string | null;
  client_label: string | null;
  member_id: string | null;
  product_id: string | null;
  year: number;
  quarter: number;
  potential: number;
  forecast: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor_name: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  diff: Record<string, unknown> | null;
}

export const JOURNEY_STEPS = [
  "Primeiro contato",
  "Qualificação",
  "Proposta",
  "Negociação",
  "Protocolo aceito",
  "Entrega",
  "Aplicação",
  "Acompanhamento",
  "Colheita",
  "Resultado validado",
  "Venda efetivada",
] as const;

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
  arquivada: "Arquivada",
};

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus | "vencida", string> = {
  agendado: "Agendado",
  realizado: "Realizado",
  reagendado: "Reagendado",
  cancelado: "Cancelado",
  vencida: "Vencida",
};

export const MODALITY_LABEL: Record<Modality, string> = {
  convencional: "Convencional",
  risco_zero: "Risco Zero",
};

export const OPP_STATUS_LABEL: Record<OpportunityStatus, string> = {
  aberta: "Aberta",
  em_pausa: "Em pausa",
  perdida: "Perdida",
  ganha: "Ganha",
};

export const ACTIVITY_KINDS = ["Visita comercial", "Reunião de negociação", "Ligação", "Dia de campo", "Outra"];
export const CLIENT_KINDS = ["Produtor Rural", "Empresa Rural", "Revenda", "Consultoria", "Outras"];
export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
  "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

/** Status efetivo: agendado com data passada aparece como "Vencida". */
export function effectiveActivityStatus(a: Pick<Activity, "status" | "starts_at" | "all_day">): ActivityStatus | "vencida" {
  if (a.status !== "agendado") return a.status;
  const start = new Date(a.starts_at);
  const now = new Date();
  if (a.all_day) {
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay < now ? "vencida" : "agendado";
  }
  return start < now ? "vencida" : "agendado";
}

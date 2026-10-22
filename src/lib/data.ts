import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { check, supabase } from "./supabase";
import type {
  Activity,
  AuditEntry,
  Channel,
  Client,
  Forecast,
  Goal,
  JourneyStep,
  Member,
  Opportunity,
  Product,
  Proposal,
  RiskZeroTrial,
  StockMovement,
} from "./types";

// Leitura paginada: o PostgREST limita a 1000 linhas por requisição.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const res = await build(from, from + page - 1);
    const rows = check(res) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export const useMembers = () =>
  useQuery({
    queryKey: ["members"],
    queryFn: async () => check(await supabase.from("team_members").select("*").order("name")) as Member[],
  });

export const useProducts = () =>
  useQuery({
    queryKey: ["products"],
    queryFn: async () => check(await supabase.from("products").select("*").order("name")) as Product[],
  });

export const useClients = () =>
  useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchAll<Client>((a, b) => supabase.from("clients").select("*").order("name").range(a, b)),
  });

export const useChannels = () =>
  useQuery({
    queryKey: ["channels"],
    queryFn: async () => check(await supabase.from("channels").select("*").order("name")) as Channel[],
  });

const OPP_SELECT = "*, clients(id,name,city,uf), products(id,name,default_dose_l_ha), opportunity_owners(member_id)";
export const useOpportunities = () =>
  useQuery({
    queryKey: ["opportunities"],
    queryFn: () =>
      fetchAll<Opportunity>((a, b) =>
        supabase.from("opportunities").select(OPP_SELECT).order("created_at", { ascending: false }).range(a, b),
      ),
  });

export const useJourney = (opportunityId: string | undefined) =>
  useQuery({
    queryKey: ["journey", opportunityId],
    enabled: Boolean(opportunityId),
    queryFn: async () =>
      check(
        await supabase.from("journey_steps").select("*").eq("opportunity_id", opportunityId!).order("step_order"),
      ) as JourneyStep[],
  });

export const useActivities = () =>
  useQuery({
    queryKey: ["activities"],
    queryFn: () =>
      fetchAll<Activity>((a, b) =>
        supabase
          .from("activities")
          .select("*, clients(id,name), activity_owners(member_id)")
          .order("starts_at", { ascending: true })
          .range(a, b),
      ),
  });

export const useProposals = () =>
  useQuery({
    queryKey: ["proposals"],
    queryFn: async () =>
      check(
        await supabase
          .from("proposals")
          .select("*, clients(id,name), proposal_items(*)")
          .order("updated_at", { ascending: false }),
      ) as Proposal[],
  });

export const useTrials = () =>
  useQuery({
    queryKey: ["trials"],
    queryFn: async () =>
      check(await supabase.from("risk_zero_trials").select("*").order("created_at", { ascending: false })) as RiskZeroTrial[],
  });

export const useStock = () =>
  useQuery({
    queryKey: ["stock"],
    queryFn: async () =>
      check(await supabase.from("stock_movements").select("*").order("moved_on", { ascending: false })) as StockMovement[],
  });

export const useGoals = () =>
  useQuery({
    queryKey: ["goals"],
    queryFn: async () => check(await supabase.from("quarterly_goals").select("*")) as Goal[],
  });

export const useForecasts = () =>
  useQuery({
    queryKey: ["forecasts"],
    queryFn: () => fetchAll<Forecast>((a, b) => supabase.from("forecasts").select("*").range(a, b)),
  });

export const useAudit = () =>
  useQuery({
    queryKey: ["audit"],
    queryFn: async () =>
      check(await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(300)) as AuditEntry[],
  });

export const useDuplicates = () =>
  useQuery({
    queryKey: ["duplicates"],
    queryFn: async () =>
      check(await supabase.rpc("possible_duplicate_clients", { p_threshold: 0.72 })) as {
        a_id: string;
        a_name: string;
        b_id: string;
        b_name: string;
        score: number;
      }[],
  });

/** Mutação genérica que invalida as consultas afetadas. */
export function useSave<TVars>(fn: (v: TVars) => Promise<unknown>, invalidate: QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: k });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function byId<T extends { id: string }>(rows: T[] | undefined) {
  const m = new Map<string, T>();
  for (const r of rows ?? []) m.set(r.id, r);
  return m;
}

/** Substitui os responsáveis (N:N) de uma oportunidade ou atividade. */
export async function setOwners(
  table: "opportunity_owners" | "activity_owners",
  fk: "opportunity_id" | "activity_id",
  id: string,
  memberIds: string[],
) {
  check(await supabase.from(table).delete().eq(fk, id));
  if (memberIds.length) {
    check(await supabase.from(table).insert(memberIds.map((m) => ({ [fk]: id, member_id: m }))));
  }
}

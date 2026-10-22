-- Regras de acesso (RLS)
-- admin/gestor: tudo. vendedor: apenas os próprios registros.

-- Helpers (security definer evita recursão entre políticas)
create or replace function public.can_access_opportunity(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or exists (
    select 1 from public.opportunities o
     where o.id = p_id
       and (o.created_by = public.current_member_id()
            or exists (select 1 from public.opportunity_owners w
                        where w.opportunity_id = o.id and w.member_id = public.current_member_id())))
$$;

create or replace function public.can_access_client(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or exists (
    select 1 from public.clients c
     where c.id = p_id
       and (c.owner_id = public.current_member_id() or c.created_by = public.current_member_id()))
  or exists (select 1 from public.opportunities o
              where o.client_id = p_id and public.can_access_opportunity(o.id))
$$;

create or replace function public.can_access_activity(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or exists (
    select 1 from public.activities a
     where a.id = p_id
       and (a.created_by = public.current_member_id()
            or exists (select 1 from public.activity_owners w
                        where w.activity_id = a.id and w.member_id = public.current_member_id())))
$$;

create or replace function public.can_access_proposal(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or exists (
    select 1 from public.proposals p
     where p.id = p_id
       and (p.owner_id = public.current_member_id() or p.created_by = public.current_member_id()
            or (p.opportunity_id is not null and public.can_access_opportunity(p.opportunity_id))))
$$;

alter table public.team_members enable row level security;
alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.channels enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_owners enable row level security;
alter table public.journey_steps enable row level security;
alter table public.activities enable row level security;
alter table public.activity_owners enable row level security;
alter table public.proposal_counters enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.risk_zero_trials enable row level security;
alter table public.stock_movements enable row level security;
alter table public.quarterly_goals enable row level security;
alter table public.forecasts enable row level security;
alter table public.audit_log enable row level security;

-- Equipe
create policy team_read on public.team_members for select to authenticated using (public.is_member());
create policy team_admin_write on public.team_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Produtos
create policy products_read on public.products for select to authenticated using (public.is_member());
create policy products_admin_write on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Clientes
create policy clients_read on public.clients for select to authenticated using (public.can_access_client(id));
create policy clients_insert on public.clients for insert to authenticated with check (public.is_member());
create policy clients_update on public.clients for update to authenticated
  using (public.can_access_client(id)) with check (public.is_member());
create policy clients_delete on public.clients for delete to authenticated using (public.is_manager());

-- Canais
create policy channels_read on public.channels for select to authenticated
  using (public.is_manager() or owner_id = public.current_member_id());
create policy channels_insert on public.channels for insert to authenticated with check (public.is_member());
create policy channels_update on public.channels for update to authenticated
  using (public.is_manager() or owner_id = public.current_member_id());
create policy channels_delete on public.channels for delete to authenticated using (public.is_manager());

-- Oportunidades
create policy opp_read on public.opportunities for select to authenticated using (public.can_access_opportunity(id));
create policy opp_insert on public.opportunities for insert to authenticated with check (public.is_member());
create policy opp_update on public.opportunities for update to authenticated using (public.can_access_opportunity(id));
create policy opp_delete on public.opportunities for delete to authenticated using (public.is_manager());

create policy opp_owners_read on public.opportunity_owners for select to authenticated
  using (public.can_access_opportunity(opportunity_id));
create policy opp_owners_write on public.opportunity_owners for all to authenticated
  using (public.can_access_opportunity(opportunity_id))
  with check (public.is_manager() or exists (
    select 1 from public.opportunities o where o.id = opportunity_id
       and (o.created_by = public.current_member_id() or public.can_access_opportunity(o.id))));

create policy journey_read on public.journey_steps for select to authenticated
  using (public.can_access_opportunity(opportunity_id));
create policy journey_update on public.journey_steps for update to authenticated
  using (public.can_access_opportunity(opportunity_id));

-- Agenda
create policy act_read on public.activities for select to authenticated using (public.can_access_activity(id));
create policy act_insert on public.activities for insert to authenticated with check (public.is_member());
create policy act_update on public.activities for update to authenticated using (public.can_access_activity(id));
create policy act_delete on public.activities for delete to authenticated using (public.is_manager());

create policy act_owners_read on public.activity_owners for select to authenticated
  using (public.can_access_activity(activity_id));
create policy act_owners_write on public.activity_owners for all to authenticated
  using (public.can_access_activity(activity_id))
  with check (public.is_manager() or exists (
    select 1 from public.activities a where a.id = activity_id and a.created_by = public.current_member_id())
    or public.can_access_activity(activity_id));

-- Propostas (proposal_counters: sem política, só a função de numeração acessa)
create policy prop_read on public.proposals for select to authenticated using (public.can_access_proposal(id));
create policy prop_insert on public.proposals for insert to authenticated with check (public.is_member());
create policy prop_update on public.proposals for update to authenticated using (public.can_access_proposal(id));
create policy prop_delete on public.proposals for delete to authenticated using (public.is_manager());

create policy prop_items_all on public.proposal_items for all to authenticated
  using (public.can_access_proposal(proposal_id)) with check (public.can_access_proposal(proposal_id));
create policy prop_versions_read on public.proposal_versions for select to authenticated
  using (public.can_access_proposal(proposal_id));
create policy prop_versions_insert on public.proposal_versions for insert to authenticated
  with check (public.can_access_proposal(proposal_id));

-- Risco Zero
create policy rz_read on public.risk_zero_trials for select to authenticated
  using (public.can_access_opportunity(opportunity_id));
create policy rz_write on public.risk_zero_trials for all to authenticated
  using (public.can_access_opportunity(opportunity_id))
  with check (public.can_access_opportunity(opportunity_id));

-- Estoque
create policy stock_read on public.stock_movements for select to authenticated using (public.is_member());
create policy stock_insert on public.stock_movements for insert to authenticated with check (public.is_member());
create policy stock_delete on public.stock_movements for delete to authenticated using (public.is_manager());

-- Metas e previsões
create policy goals_read on public.quarterly_goals for select to authenticated using (public.is_member());
create policy goals_write on public.quarterly_goals for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy forecasts_read on public.forecasts for select to authenticated
  using (public.is_manager() or member_id = public.current_member_id());
create policy forecasts_write on public.forecasts for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Histórico
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_manager() or actor_id = public.current_member_id());

-- Funções: apenas usuários autenticados
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.audit_trigger() from authenticated;

-- Storage: anexos de evidências e laudos
insert into storage.buckets (id, name, public) values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

create policy evidencias_read on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and public.is_member());
create policy evidencias_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and public.is_member());
create policy evidencias_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias' and public.is_manager());

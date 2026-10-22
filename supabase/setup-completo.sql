-- Arquivo único para colar no SQL Editor do Supabase (mesmo conteúdo das 3 migrações, em ordem).

-- Fertsan | Gestão Comercial — schema inicial
-- Postgres / Supabase. Todas as tabelas com RLS.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'gestor', 'vendedor');
create type public.modality as enum ('convencional', 'risco_zero');
create type public.opportunity_status as enum ('aberta', 'em_pausa', 'perdida', 'ganha');
create type public.activity_status as enum ('agendado', 'realizado', 'reagendado', 'cancelado');
create type public.proposal_status as enum ('rascunho', 'pendente_aprovacao', 'enviada', 'aceita', 'recusada', 'arquivada');
create type public.stock_kind as enum ('entrada', 'saida', 'reserva', 'ajuste');

-- ---------------------------------------------------------------------------
-- Equipe (pessoas). Pode existir sem login; user_id liga a uma conta.
-- ---------------------------------------------------------------------------
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role public.app_role not null default 'vendedor',
  active boolean not null default true,
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers de permissão
-- ---------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.team_members where user_id = auth.uid() and active
$$;

create or replace function public.current_role_name()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.team_members where user_id = auth.uid() and active
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin', 'gestor'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

create or replace function public.normalize_name(t text)
returns text language sql immutable set search_path = public, extensions as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g')
$$;

-- Novo usuário: liga a um membro existente pelo e-mail ou cria um.
-- O primeiro usuário do sistema vira admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_first boolean;
begin
  select not exists (select 1 from public.team_members where user_id is not null) into v_first;

  select id into v_member from public.team_members
   where lower(email) = lower(new.email) and user_id is null
   limit 1;

  if v_member is not null then
    update public.team_members
       set user_id = new.id,
           role = case when v_first then 'admin'::public.app_role else role end
     where id = v_member;
  else
    insert into public.team_members (name, email, role, user_id)
    values (
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      new.email,
      case when v_first then 'admin'::public.app_role else 'vendedor'::public.app_role end,
      new.id
    );
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Catálogo de produtos — fonte única de preço
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  culture text,
  price_per_l numeric(12, 2) check (price_per_l is null or price_per_l > 0),
  default_dose_l_ha numeric(10, 3) not null default 1 check (default_dose_l_ha > 0),
  package_l numeric(10, 2) not null default 5 check (package_l > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.product_price_or_fail(p_product uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  select price_per_l into v from public.products where id = p_product;
  if v is null then
    raise exception 'Produto com preço pendente — cadastre o preço em Configurações.'
      using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_norm text not null default '',
  farm text,
  city text,
  uf text check (uf is null or length(uf) = 2),
  kind text not null default 'Produtor Rural',
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  phone text,
  email text,
  owner_id uuid references public.team_members (id) on delete set null,
  origin text,
  total_area_ha numeric(12, 2),
  notes text,
  created_by uuid references public.team_members (id) default public.current_member_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_name_norm_trgm on public.clients using gin (name_norm extensions.gin_trgm_ops);

create or replace function public.clients_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.name_norm := btrim(public.normalize_name(new.name));
  new.uf := upper(nullif(btrim(new.uf), ''));
  new.updated_at := now();
  return new;
end $$;
create trigger clients_normalize before insert or update on public.clients
  for each row execute function public.clients_normalize();

-- ---------------------------------------------------------------------------
-- Canais (Finder, distribuidor, revenda, consultoria)
-- ---------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'Finder' check (kind in ('Finder', 'Distribuidor', 'Revenda', 'Consultoria')),
  focal_point text,
  finder_name text,
  client_id uuid references public.clients (id) on delete set null,
  stage text not null default 'Indicação',
  next_action text,
  owner_id uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Oportunidades + responsáveis (N:N) + jornada
-- ---------------------------------------------------------------------------
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  product_id uuid not null references public.products (id),
  modality public.modality not null default 'risco_zero',
  area_ha numeric(12, 2) check (area_ha is null or area_ha >= 0),
  volume_l numeric(12, 2) not null check (volume_l >= 0),
  unit_price numeric(12, 2),
  value numeric(14, 2) generated always as (volume_l * coalesce(unit_price, 0)) stored,
  value_override numeric(14, 2),
  override_reason text,
  stage text not null default 'Prospecção',
  status public.opportunity_status not null default 'aberta',
  status_reason text,
  objective text,
  origin text,
  created_by uuid references public.team_members (id) default public.current_member_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint override_needs_reason check (value_override is null or coalesce(btrim(override_reason), '') <> '')
);

create or replace function public.opportunities_price_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.unit_price is null)
     or (tg_op = 'UPDATE' and (new.product_id is distinct from old.product_id or new.unit_price is null)) then
    new.unit_price := public.product_price_or_fail(new.product_id);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger opportunities_price_snapshot before insert or update on public.opportunities
  for each row execute function public.opportunities_price_snapshot();

create table public.opportunity_owners (
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  member_id uuid references public.team_members (id) on delete cascade,
  primary key (opportunity_id, member_id)
);

create table public.journey_steps (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  step_order int not null check (step_order between 1 and 11),
  name text not null,
  done boolean not null default false,
  responsible_id uuid references public.team_members (id) on delete set null,
  completed_on date,
  evidence text,
  attachment_path text,
  unique (opportunity_id, step_order)
);

create or replace function public.journey_stage_names()
returns text[] language sql immutable set search_path = public as $$
  select array['Primeiro contato', 'Qualificação', 'Proposta', 'Negociação', 'Protocolo aceito',
               'Entrega', 'Aplicação', 'Acompanhamento', 'Colheita', 'Resultado validado', 'Venda efetivada']
$$;

create or replace function public.create_journey_steps()
returns trigger language plpgsql security definer set search_path = public as $$
declare n text[] := public.journey_stage_names();
begin
  insert into public.journey_steps (opportunity_id, step_order, name)
  select new.id, i, n[i] from generate_series(1, 11) as i;
  return new;
end $$;
create trigger create_journey_steps after insert on public.opportunities
  for each row execute function public.create_journey_steps();

create or replace function public.journey_steps_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and not coalesce(old.done, false) then
    if new.step_order > 1 and not exists (
      select 1 from public.journey_steps
       where opportunity_id = new.opportunity_id and step_order = new.step_order - 1 and done
    ) then
      raise exception 'Conclua a etapa anterior antes de "%".', new.name using errcode = 'P0001';
    end if;
    if new.completed_on is null then new.completed_on := current_date; end if;
  end if;
  if not new.done and coalesce(old.done, false) then
    if exists (select 1 from public.journey_steps
                where opportunity_id = new.opportunity_id and step_order > new.step_order and done) then
      raise exception 'Reabra primeiro as etapas posteriores.' using errcode = 'P0001';
    end if;
    new.completed_on := null;
  end if;
  return new;
end $$;
create trigger journey_steps_validate before update on public.journey_steps
  for each row execute function public.journey_steps_validate();

-- A etapa da oportunidade deriva da jornada.
create or replace function public.journey_sync_opportunity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_last text; v_order int;
begin
  select name, step_order into v_last, v_order from public.journey_steps
   where opportunity_id = new.opportunity_id and done
   order by step_order desc limit 1;
  update public.opportunities
     set stage = coalesce(v_last, 'Prospecção'),
         status = case when v_order = 11 then 'ganha'::public.opportunity_status
                       when status = 'ganha' then 'aberta'::public.opportunity_status
                       else status end
   where id = new.opportunity_id;
  return new;
end $$;
create trigger journey_sync_opportunity after update on public.journey_steps
  for each row execute function public.journey_sync_opportunity();

-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  title text not null default 'Visita comercial',
  kind text not null default 'Visita comercial',
  starts_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  status public.activity_status not null default 'agendado',
  notes text,
  rescheduled_from_id uuid references public.activities (id) on delete set null,
  created_by uuid references public.team_members (id) default public.current_member_id(),
  created_at timestamptz not null default now()
);

create table public.activity_owners (
  activity_id uuid references public.activities (id) on delete cascade,
  member_id uuid references public.team_members (id) on delete cascade,
  primary key (activity_id, member_id)
);

-- Reagendar exige nova data: marca a original e cria a nova atividade ligada.
create or replace function public.reschedule_activity(p_id uuid, p_new_start timestamptz, p_reason text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_new uuid; a public.activities;
begin
  if p_new_start is null then
    raise exception 'Informe a nova data para reagendar.' using errcode = 'P0001';
  end if;
  select * into a from public.activities where id = p_id;
  if not found then raise exception 'Atividade não encontrada.'; end if;

  insert into public.activities (client_id, opportunity_id, title, kind, starts_at, all_day, location, notes, rescheduled_from_id)
  values (a.client_id, a.opportunity_id, a.title, a.kind, p_new_start, a.all_day, a.location, a.notes, a.id)
  returning id into v_new;

  insert into public.activity_owners (activity_id, member_id)
  select v_new, member_id from public.activity_owners where activity_id = p_id;

  update public.activities
     set status = 'reagendado',
         notes = concat_ws(E'\n', notes, 'Reagendado: ' || coalesce(p_reason, ''))
   where id = p_id;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Propostas
-- ---------------------------------------------------------------------------
create table public.proposal_counters (
  year int primary key,
  last_seq int not null default 0
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  year int,
  seq int,
  version int not null default 1,
  client_id uuid not null references public.clients (id) on delete restrict,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  farm text,
  city_uf text,
  season text not null default '2026/27',
  issued_on date not null default current_date,
  validity_days int not null default 30 check (validity_days > 0),
  status public.proposal_status not null default 'rascunho',
  presentation text,
  oraclo_enabled boolean not null default true,
  oraclo_area_ha numeric(12, 2),
  oraclo_price_ha numeric(10, 2) not null default 14.80,
  oraclo_months int not null default 12,
  conditions text not null default E'Acompanhamento técnico Fertsan nas aplicações.\nPrazo de entrega e pagamento a combinar.\nValores expressos em reais (R$).',
  risk_zero_condition text not null default 'Nas áreas de Risco Zero, o produto é aplicado com faixa testemunha lado a lado. O produtor só paga se o incremento de produtividade comprovado cobrir o custo elegível por hectare.',
  accepted_on date,
  owner_id uuid references public.team_members (id) default public.current_member_id(),
  created_by uuid references public.team_members (id) default public.current_member_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.proposals_assign_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from coalesce(new.issued_on, current_date))::int; v_seq int;
begin
  if new.number is null then
    insert into public.proposal_counters (year, last_seq)
    values (v_year, (select coalesce(max(seq), 0) + 1 from public.proposals where year = v_year))
    on conflict (year) do update
      set last_seq = greatest(public.proposal_counters.last_seq,
                              (select coalesce(max(seq), 0) from public.proposals where year = v_year)) + 1
    returning last_seq into v_seq;
    new.year := v_year;
    new.seq := v_seq;
    new.number := 'FT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;
create trigger proposals_assign_number before insert on public.proposals
  for each row execute function public.proposals_assign_number();

create or replace function public.proposals_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'aceita' and old.status is distinct from 'aceita' and new.accepted_on is null then
    new.accepted_on := current_date;
  end if;
  return new;
end $$;
create trigger proposals_touch before update on public.proposals
  for each row execute function public.proposals_touch();

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  position int not null default 0,
  product_id uuid not null references public.products (id),
  modality public.modality not null,
  area_ha numeric(12, 2) not null check (area_ha > 0),
  dose_l_ha numeric(10, 3) not null check (dose_l_ha > 0),
  package_l numeric(10, 2) not null default 5 check (package_l > 0),
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  protocol text,
  unit_price numeric(12, 2) not null
);

create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  saved_by uuid references public.team_members (id) default public.current_member_id(),
  saved_at timestamptz not null default now(),
  unique (proposal_id, version)
);

-- Salvamento atômico da proposta (cabeçalho + itens) com versionamento.
-- O preço de cada item vem SEMPRE do catálogo (snapshot no momento do salvamento).
create or replace function public.save_proposal(p_header jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
  v_version int;
  it jsonb;
  i int := 0;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Adicione ao menos um produto.' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.proposals (client_id, opportunity_id, farm, city_uf, season, issued_on, validity_days, status,
      presentation, oraclo_enabled, oraclo_area_ha, oraclo_price_ha, oraclo_months, conditions, risk_zero_condition)
    values (
      (p_header ->> 'client_id')::uuid,
      nullif(p_header ->> 'opportunity_id', '')::uuid,
      p_header ->> 'farm', p_header ->> 'city_uf', coalesce(p_header ->> 'season', '2026/27'),
      coalesce((p_header ->> 'issued_on')::date, current_date),
      coalesce((p_header ->> 'validity_days')::int, 30),
      coalesce((p_header ->> 'status')::public.proposal_status, 'rascunho'),
      p_header ->> 'presentation',
      coalesce((p_header ->> 'oraclo_enabled')::boolean, false),
      nullif(p_header ->> 'oraclo_area_ha', '')::numeric,
      coalesce(nullif(p_header ->> 'oraclo_price_ha', '')::numeric, 14.80),
      coalesce(nullif(p_header ->> 'oraclo_months', '')::int, 12),
      coalesce(p_header ->> 'conditions', ''),
      coalesce(p_header ->> 'risk_zero_condition', ''))
    returning id, version into v_id, v_version;
  else
    update public.proposals set
      client_id = (p_header ->> 'client_id')::uuid,
      opportunity_id = nullif(p_header ->> 'opportunity_id', '')::uuid,
      farm = p_header ->> 'farm', city_uf = p_header ->> 'city_uf', season = p_header ->> 'season',
      issued_on = (p_header ->> 'issued_on')::date,
      validity_days = (p_header ->> 'validity_days')::int,
      status = (p_header ->> 'status')::public.proposal_status,
      presentation = p_header ->> 'presentation',
      oraclo_enabled = (p_header ->> 'oraclo_enabled')::boolean,
      oraclo_area_ha = nullif(p_header ->> 'oraclo_area_ha', '')::numeric,
      oraclo_price_ha = coalesce(nullif(p_header ->> 'oraclo_price_ha', '')::numeric, 14.80),
      oraclo_months = coalesce(nullif(p_header ->> 'oraclo_months', '')::int, 12),
      conditions = p_header ->> 'conditions',
      risk_zero_condition = p_header ->> 'risk_zero_condition',
      version = version + 1
    where id = v_id
    returning version into v_version;
    if not found then raise exception 'Proposta não encontrada ou sem permissão.'; end if;
    delete from public.proposal_items where proposal_id = v_id;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.proposal_items (proposal_id, position, product_id, modality, area_ha, dose_l_ha, package_l, discount_pct, protocol, unit_price)
    values (v_id, i, (it ->> 'product_id')::uuid, (it ->> 'modality')::public.modality,
      (it ->> 'area_ha')::numeric, (it ->> 'dose_l_ha')::numeric, coalesce((it ->> 'package_l')::numeric, 5),
      coalesce((it ->> 'discount_pct')::numeric, 0), it ->> 'protocol',
      public.product_price_or_fail((it ->> 'product_id')::uuid));
    i := i + 1;
  end loop;

  insert into public.proposal_versions (proposal_id, version, snapshot)
  select v_id, v_version, jsonb_build_object(
    'header', to_jsonb(p) - 'created_at',
    'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.position), '[]') from public.proposal_items x where x.proposal_id = v_id))
  from public.proposals p where p.id = v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Risco Zero — apurações
-- ---------------------------------------------------------------------------
create table public.risk_zero_trials (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  treated_yield numeric(12, 3),
  control_yield numeric(12, 3),
  unit text not null default 'sc/ha' check (unit in ('sc/ha', '@/ha', 't/ha', 'kg/ha')),
  commodity_price numeric(12, 2),
  eligible_cost_ha numeric(12, 2),
  criteria jsonb not null default '{}'::jsonb,
  report_path text,
  notes text,
  created_by uuid references public.team_members (id) default public.current_member_id(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  moved_on date not null default current_date,
  product_id uuid not null references public.products (id),
  lot text,
  warehouse text,
  expires_on date,
  kind public.stock_kind not null,
  volume_l numeric(12, 2) not null check (volume_l <> 0),
  proposal_id uuid references public.proposals (id) on delete set null,
  notes text,
  created_by uuid references public.team_members (id) default public.current_member_id(),
  created_at timestamptz not null default now(),
  constraint signed_only_for_adjust check (kind = 'ajuste' or volume_l > 0)
);

create or replace function public.stock_balance(p_product uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case kind when 'entrada' then volume_l when 'ajuste' then volume_l else -volume_l end), 0)
    from public.stock_movements where product_id = p_product
$$;

create or replace function public.stock_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bal numeric;
begin
  perform pg_advisory_xact_lock(hashtext(new.product_id::text));
  v_bal := public.stock_balance(new.product_id);
  if new.kind in ('saida', 'reserva') and new.volume_l > v_bal then
    raise exception 'Saldo insuficiente: disponível % L.', v_bal using errcode = 'P0001';
  end if;
  if new.kind = 'ajuste' and v_bal + new.volume_l < 0 then
    raise exception 'O ajuste deixaria o saldo negativo (saldo atual % L).', v_bal using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger stock_validate before insert on public.stock_movements
  for each row execute function public.stock_validate();

-- ---------------------------------------------------------------------------
-- Metas e previsões
-- ---------------------------------------------------------------------------
create table public.quarterly_goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.team_members (id) on delete cascade,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  target numeric(14, 2) not null check (target >= 0),
  unique nulls not distinct (member_id, year, quarter)
);

create table public.forecasts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  client_label text,
  member_id uuid references public.team_members (id) on delete set null,
  product_id uuid references public.products (id),
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  potential numeric(14, 2) not null default 0,
  forecast numeric(14, 2) not null default 0
);

-- ---------------------------------------------------------------------------
-- Histórico de alterações
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  entity text not null,
  entity_id text,
  action text not null,
  diff jsonb
);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_diff jsonb;
  v_actor uuid := public.current_member_id();
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('de', v_old -> k, 'para', v_new -> k)) into v_diff
      from jsonb_object_keys(v_new) k
     where v_new -> k is distinct from v_old -> k and k not in ('updated_at', 'name_norm');
    if v_diff is null then return new; end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;
  insert into public.audit_log (actor_id, actor_name, entity, entity_id, action, diff)
  values (v_actor, (select name from public.team_members where id = v_actor), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id'),
          case tg_op when 'INSERT' then 'criação' when 'UPDATE' then 'edição' else 'exclusão' end,
          v_diff);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'channels', 'opportunities', 'journey_steps', 'activities', 'proposals',
                           'risk_zero_trials', 'stock_movements', 'quarterly_goals', 'products', 'team_members']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Deduplicação e mesclagem de clientes
-- ---------------------------------------------------------------------------
create or replace function public.possible_duplicate_clients(p_threshold real default 0.72)
returns table (a_id uuid, a_name text, b_id uuid, b_name text, score real)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, a.name, b.id, b.name, similarity(a.name_norm, b.name_norm)
    from public.clients a
    join public.clients b on a.id < b.id and a.name_norm % b.name_norm
   where similarity(a.name_norm, b.name_norm) >= p_threshold
   order by 5 desc
   limit 200
$$;

create or replace function public.merge_clients(p_keep uuid, p_remove uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_manager() then
    raise exception 'Somente gestores e administradores podem mesclar clientes.' using errcode = '42501';
  end if;
  if p_keep = p_remove then raise exception 'Escolha dois clientes diferentes.'; end if;
  update public.opportunities set client_id = p_keep where client_id = p_remove;
  update public.activities set client_id = p_keep where client_id = p_remove;
  update public.proposals set client_id = p_keep where client_id = p_remove;
  update public.channels set client_id = p_keep where client_id = p_remove;
  update public.forecasts set client_id = p_keep where client_id = p_remove;
  update public.clients k set
    phone = coalesce(k.phone, r.phone), email = coalesce(k.email, r.email),
    farm = coalesce(k.farm, r.farm), city = coalesce(k.city, r.city), uf = coalesce(k.uf, r.uf),
    total_area_ha = coalesce(k.total_area_ha, r.total_area_ha), owner_id = coalesce(k.owner_id, r.owner_id)
    from public.clients r where k.id = p_keep and r.id = p_remove;
  delete from public.clients where id = p_remove;
end $$;
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
-- Catálogo inicial de produtos (preços por litro e doses padrão).
-- Valores conferidos na plataforma anterior; revisar em Configurações.
-- FT Pasto usa o preço da Política Comercial 2026 (R$ 50/L), não o do planejamento (R$ 40/L).
-- Produtos sem preço ficam como "preço pendente" e não entram em propostas até o preço ser cadastrado.
insert into public.products (name, culture, price_per_l, default_dose_l_ha, package_l) values
  ('FT Poly Campo', 'Soja / multiculturas', 60, 2, 5),
  ('FT Corn', 'Milho', 60, 2, 5),
  ('FT Cotton', 'Algodão', 90, 4, 5),
  ('FT Pasto', 'Pastagem', 50, 1, 5),
  ('FT Bean', 'Feijão', 80, 2, 5),
  ('SC Booster', 'Multiculturas', 65, 2, 5),
  ('FT Wheat', 'Trigo', 40, 2, 5),
  ('FT Advanced', 'Multiculturas', 120, 2, 5),
  ('FT Hort', 'Hortaliças', null, 2, 5),
  ('FT Fruit', 'Frutíferas', null, 2, 5),
  ('FT Grass', 'Gramados', null, 2, 5),
  ('FT Garden Plus', 'Jardinagem', null, 2, 5)
on conflict (name) do nothing;

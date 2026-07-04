-- ============================================================
-- Final Experience Betano — JUEGO de pronósticos en vivo
-- Final Mundial 2026 · 19 jul 2026
-- Ejecutar en el SQL Editor del proyecto Supabase (una vez).
--
-- Tablas con prefijo `juego_` para convivir con el concurso
-- (participantes/sorteos) en el MISMO proyecto, sin colisión.
-- Fuente de datos en vivo: API-Football (poller server-side).
--
-- Orden de ejecución: este archivo primero, luego seed-mercados.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Jugadores  (registro por QR: nombre, apellido, alias único)
-- ------------------------------------------------------------
create table if not exists public.juego_players (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  apellido      text not null,
  alias         text not null,
  -- Normalización determinista: trim + colapsa espacios internos + minúsculas.
  alias_norm    text generated always as (
                  lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))
                ) stored,
  device_token  uuid,
  created_at    timestamptz not null default now()
);

-- El ranking se arma por alias → único case/space-insensitive.
create unique index if not exists juego_players_alias_norm_uidx
  on public.juego_players (alias_norm);

-- Un dispositivo → un registro (anti-duplicado blando por refresco).
create unique index if not exists juego_players_device_token_uidx
  on public.juego_players (device_token)
  where device_token is not null;

-- ------------------------------------------------------------
-- 2. Catálogo de mercados data-driven (puntos editables en admin)
-- ------------------------------------------------------------
create table if not exists public.juego_markets (
  id           text primary key,                 -- slug: 'campeon', 'total_corners_ou', ...
  titulo       text not null,
  descripcion  text,
  resolves_at  text not null default 'fulltime'
                 check (resolves_at in ('live','halftime','fulltime')),
  -- Ventana de tiempo que cuenta la estadística (chip en la UI):
  --   '90' = solo 90' reglamentarios · '120' = incluye alargue · 'ht' = 1er tiempo
  --   null = no aplica (mercados de desenlace: va_alargue, metodo_victoria, ...)
  tiempo       text check (tiempo in ('90','120','ht')),
  orden        int  not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.juego_market_options (
  id           uuid primary key default gen_random_uuid(),
  market_id    text not null references public.juego_markets (id) on delete cascade,
  etiqueta     text not null,                    -- mostrado: "Más de 5 córners"
  valor        text,                             -- resolución: 'home'|'away'|'draw'|'si'|'no'|'2-1'
  umbral       numeric,                          -- para over/under
  direccion    text check (direccion in ('over','under')),
  puntos       int  not null default 0,          -- editable desde /juego/admin/mercados
  orden        int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists juego_market_options_market_idx
  on public.juego_market_options (market_id, orden);

-- Clave natural → seed idempotente (on conflict do nothing no pisa ediciones del admin).
create unique index if not exists juego_market_options_natural_uidx
  on public.juego_market_options (market_id, etiqueta);

-- ------------------------------------------------------------
-- 3. Pronósticos  (1 por jugador y mercado)
-- ------------------------------------------------------------
create table if not exists public.juego_predictions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.juego_players (id) on delete cascade,
  market_id   text not null references public.juego_markets (id) on delete cascade,
  option_id   uuid not null references public.juego_market_options (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (player_id, market_id)
);

create index if not exists juego_predictions_player_idx
  on public.juego_predictions (player_id);

-- ------------------------------------------------------------
-- 4. Estado del partido  (fila única, control operativo)
-- ------------------------------------------------------------
create table if not exists public.juego_match_state (
  id                  int primary key default 1 check (id = 1),
  match_status        text not null default 'scheduled'
                        check (match_status in
                          ('scheduled','live_1h','halftime','live_2h','extra_time','penalties','finished')),
  predictions_locked  boolean not null default false,
  kickoff_at          timestamptz,
  -- Nombres de los equipos (se actualizan automáticamente desde API-Football).
  home_team           text,
  away_team           text,
  -- Guard anti-solapamiento del poller (alternativa a advisory lock).
  polling_owner       uuid,
  lock_expires_at     timestamptz,
  updated_at          timestamptz not null default now()
);

insert into public.juego_match_state (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. Snapshots del partido  (append-only, 1 por poll)
--    Guarda HECHOS YA RESUELTOS: el poller (lib/juego/apifootball.ts)
--    interpreta el payload y deja aquí campos listos para puntuar.
-- ------------------------------------------------------------
create table if not exists public.juego_match_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'apifootball'
                        check (source in ('apifootball','manual')),
  match_status        text not null,
  home_score          int  not null default 0,   -- goles actuales (incluye alargue)
  away_score          int  not null default 0,
  ht_home_score       int,                        -- marcador al descanso
  ht_away_score       int,
  reg_home_score      int,                        -- marcador al minuto 90 (resultado exacto)
  reg_away_score      int,
  corners_total       int  not null default 0,
  yellow_cards_total  int  not null default 0,
  red_cards_total     int  not null default 0,
  shots_on_goal_total int  not null default 0,   -- tiros al arco
  fouls_total         int  not null default 0,   -- faltas
  offsides_total      int  not null default 0,   -- fuera de juego
  possession_home     numeric,                   -- % posesión local (ej: 52)
  possession_away     numeric,                   -- % posesión visita
  both_teams_scored   boolean not null default false,
  first_scorer_side   text check (first_scorer_side in ('home','away')),
  winner_side         text check (winner_side in ('home','away','draw')),  -- incluye penales
  went_to_extra_time  boolean not null default false,
  went_to_penalties   boolean not null default false,
  raw                 jsonb,                      -- payload API-Football (debug/replay)
  fetched_at          timestamptz not null default now()
);

create index if not exists juego_snapshots_fetched_idx
  on public.juego_match_snapshots (fetched_at desc);

-- ------------------------------------------------------------
-- 6. Puntajes por jugador  (breakdown para el detalle en la UI)
-- ------------------------------------------------------------
create table if not exists public.juego_player_scores (
  player_id   uuid primary key references public.juego_players (id) on delete cascade,
  puntos      int   not null default 0,
  detalle     jsonb not null default '{}'::jsonb,  -- { market_id: puntos }
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. Cache del leaderboard  (fila única, empujada por Realtime)
--    Los clientes se suscriben SOLO a esta fila y reciben el ranking
--    completo en el payload del evento → cero queries extra por cliente.
-- ------------------------------------------------------------
create table if not exists public.juego_leaderboard_cache (
  id          int primary key default 1 check (id = 1),
  ranking     jsonb not null default '[]'::jsonb,  -- [{posicion, player_id, alias, puntos}]
  updated_at  timestamptz not null default now()
);

insert into public.juego_leaderboard_cache (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- Trigger: cierre de pronósticos a nivel DB.
-- Rechaza insert/update tras el lock — vale incluso para service_role,
-- "aunque manipulen el frontend". También sella updated_at.
-- ============================================================
create or replace function public.juego_guard_predictions_lock()
returns trigger
language plpgsql
as $$
begin
  if (select predictions_locked from public.juego_match_state where id = 1) then
    raise exception 'Los pronósticos están cerrados' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists juego_predictions_lock_guard on public.juego_predictions;
create trigger juego_predictions_lock_guard
  before insert or update on public.juego_predictions
  for each row execute function public.juego_guard_predictions_lock();

-- ============================================================
-- Row Level Security
--   · Escrituras de jugador → por API (service_role, bypassa RLS).
--   · anon SOLO lee catálogo + estado + leaderboard (sin PII).
--   · authenticated (admin) gestiona todo.
-- ============================================================
alter table public.juego_players           enable row level security;
alter table public.juego_markets           enable row level security;
alter table public.juego_market_options    enable row level security;
alter table public.juego_predictions       enable row level security;
alter table public.juego_match_state       enable row level security;
alter table public.juego_match_snapshots   enable row level security;
alter table public.juego_player_scores     enable row level security;
alter table public.juego_leaderboard_cache enable row level security;

-- Lectura pública: catálogo, estado y ranking (nada de PII de jugadores).
drop policy if exists "juego_markets_read" on public.juego_markets;
create policy "juego_markets_read" on public.juego_markets
  for select to anon, authenticated using (true);

drop policy if exists "juego_market_options_read" on public.juego_market_options;
create policy "juego_market_options_read" on public.juego_market_options
  for select to anon, authenticated using (true);

drop policy if exists "juego_match_state_read" on public.juego_match_state;
create policy "juego_match_state_read" on public.juego_match_state
  for select to anon, authenticated using (true);

drop policy if exists "juego_leaderboard_read" on public.juego_leaderboard_cache;
create policy "juego_leaderboard_read" on public.juego_leaderboard_cache
  for select to anon, authenticated using (true);

-- Gestión completa para admin autenticado (paneles /juego/admin/*).
do $$
declare t text;
begin
  foreach t in array array[
    'juego_players','juego_markets','juego_market_options','juego_predictions',
    'juego_match_state','juego_match_snapshots','juego_player_scores','juego_leaderboard_cache'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'juego_admin_all_'||t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'juego_admin_all_'||t, t);
  end loop;
end $$;

-- Grants explícitos de lectura anon (Realtime del leaderboard + estado, y catálogo).
-- Supabase ya concede por defecto en public; esto es cinturón y tirantes.
grant select on
  public.juego_markets,
  public.juego_market_options,
  public.juego_match_state,
  public.juego_leaderboard_cache
  to anon, authenticated;

-- ============================================================
-- Motor de puntaje: juego_recompute_scores()
--   Set-based. Invocado EXPLÍCITAMENTE tras cada snapshot (poller) y
--   desde un botón admin — NO como trigger recursivo.
--   Escribe player_scores (breakdown) y reconstruye leaderboard_cache
--   (esta escritura dispara el evento Realtime hacia los clientes).
--
--   Mercados 'live' se evalúan contra el snapshot más reciente en cualquier
--   minuto (los puntos suben/bajan en vivo); 'halftime'/'fulltime' sólo cuando
--   el dato correspondiente ya existe en el snapshot.
-- ============================================================
create or replace function public.juego_recompute_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Puntaje por jugador contra el último snapshot.
  --    SOLO si el partido ya está en curso o terminó (status != 'scheduled').
  --    Si aún no hay snapshot o está scheduled → todos en 0, pero visibles en ranking.
  with latest as (
    select * from public.juego_match_snapshots
    where match_status != 'scheduled'
    order by fetched_at desc limit 1
  ),
  scored as (
    select
      pr.player_id,
      pr.market_id,
      mo.puntos,
      coalesce(case pr.market_id
        when 'campeon' then
          l.winner_side is not null and mo.valor = l.winner_side
        when 'resultado_exacto' then
          l.reg_home_score is not null
          and case
            -- "Otro resultado": acierta si el marcador al 90' no coincide con
            -- NINGÚN otro marcador ofrecido en el catálogo del mercado.
            when mo.valor = 'otro' then not exists (
              select 1 from public.juego_market_options x
              where x.market_id = 'resultado_exacto' and x.valor <> 'otro'
                and x.valor = (l.reg_home_score::text || '-' || l.reg_away_score::text))
            else mo.valor = (l.reg_home_score::text || '-' || l.reg_away_score::text)
          end
        when 'ganador_ht' then
          l.ht_home_score is not null and mo.valor = (case
            when l.ht_home_score > l.ht_away_score then 'home'
            when l.ht_home_score < l.ht_away_score then 'away'
            else 'draw' end)
        when 'total_goles_ou' then case mo.direccion
            when 'over'  then (l.home_score + l.away_score) > mo.umbral
            when 'under' then l.match_status = 'finished' and (l.home_score + l.away_score) < mo.umbral
            else false end
        when 'ambas_anotan' then
          case
            when mo.valor = 'si' and l.both_teams_scored then true
            when mo.valor = 'no' and l.match_status = 'finished' and not l.both_teams_scored then true
            else false
          end
        when 'total_corners_ou' then case mo.direccion
            when 'over'  then l.corners_total > mo.umbral
            when 'under' then l.match_status = 'finished' and l.corners_total < mo.umbral
            else false end
        when 'total_amarillas_ou' then case mo.direccion
            when 'over'  then l.yellow_cards_total > mo.umbral
            when 'under' then l.match_status = 'finished' and l.yellow_cards_total < mo.umbral
            else false end
        when 'habra_roja' then
          case
            when mo.valor = 'si' and l.red_cards_total > 0 then true
            when mo.valor = 'no' and l.match_status = 'finished' and l.red_cards_total = 0 then true
            else false
          end
        when 'primer_gol' then
          l.first_scorer_side is not null and mo.valor = l.first_scorer_side
        when 'va_alargue' then
          case
            -- 'sí' acierta EN VIVO apenas arranca el alargue; 'no' recién al final.
            when mo.valor = 'si' then l.went_to_extra_time
            when mo.valor = 'no' then l.match_status = 'finished' and not l.went_to_extra_time
            else false
          end
        when 'metodo_victoria' then
          case
            -- 'penales' acierta en vivo apenas arranca la tanda;
            -- '90 min' / 'alargue' solo pueden confirmarse con el partido terminado.
            when mo.valor = 'pen' then l.went_to_penalties
            when mo.valor = 'et'  then l.match_status = 'finished'
                                       and l.went_to_extra_time and not l.went_to_penalties
            when mo.valor = 'reg' then l.match_status = 'finished'
                                       and not l.went_to_extra_time
            else false
          end
        when 'habra_penales' then
          case
            when mo.valor = 'si' then l.went_to_penalties
            when mo.valor = 'no' then l.match_status = 'finished' and not l.went_to_penalties
            else false
          end
        when 'tiros_arco_ou' then case mo.direccion
            when 'over'  then l.shots_on_goal_total > mo.umbral
            when 'under' then l.match_status = 'finished' and l.shots_on_goal_total < mo.umbral
            else false end
        when 'faltas_ou' then case mo.direccion
            when 'over'  then l.fouls_total > mo.umbral
            when 'under' then l.match_status = 'finished' and l.fouls_total < mo.umbral
            else false end
        when 'offsides_ou' then case mo.direccion
            when 'over'  then l.offsides_total > mo.umbral
            when 'under' then l.match_status = 'finished' and l.offsides_total < mo.umbral
            else false end
        when 'posesion' then
          l.possession_home is not null and l.possession_away is not null
          and mo.valor = (case
            when l.possession_home > l.possession_away then 'home'
            when l.possession_away > l.possession_home then 'away'
            else 'draw' end)
        else false
      end, false) as correcto
    from public.juego_predictions pr
    join public.juego_market_options mo on mo.id = pr.option_id
    left join latest l on true
  ),
  per_player as (
    select
      player_id,
      sum(case when correcto then puntos else 0 end)::int as puntos,
      jsonb_object_agg(market_id, case when correcto then puntos else 0 end) as detalle
    from scored
    group by player_id
  ),
  final as (
    select
      pl.id                          as player_id,
      coalesce(pp.puntos, 0)         as puntos,
      coalesce(pp.detalle, '{}'::jsonb) as detalle
    from public.juego_players pl
    left join per_player pp on pp.player_id = pl.id
  )
  insert into public.juego_player_scores (player_id, puntos, detalle, updated_at)
  select player_id, puntos, detalle, now() from final
  on conflict (player_id) do update
    set puntos     = excluded.puntos,
        detalle    = excluded.detalle,
        updated_at = now();

  -- 2) Reconstruir el ranking ordenado → dispara Realtime en el cache.
  update public.juego_leaderboard_cache
  set ranking = coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'posicion',  posicion,
                   'player_id', player_id,
                   'alias',     alias,
                   'puntos',    puntos
                 ) order by posicion, alias)
        from (
          select ps.player_id, pl.alias, ps.puntos,
                 rank() over (order by ps.puntos desc) as posicion
          from public.juego_player_scores ps
          join public.juego_players pl on pl.id = ps.player_id
        ) r
      ), '[]'::jsonb),
      updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.juego_recompute_scores() to authenticated, service_role;

-- ============================================================
-- Guard anti-solapamiento del poller: reclama el lock de forma ATÓMICA.
-- Devuelve true si esta invocación tomó el lock (o si el lock previo venció).
-- Flag en match_state (fiable bajo el pooler de Supabase; los advisory locks
-- por sesión no lo son con pgbouncer). El poller renueva lock_expires_at en
-- cada iteración (heartbeat) y lo libera al terminar.
-- ============================================================
create or replace function public.juego_try_claim_poll(p_owner uuid, p_ttl_min int default 5)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.juego_match_state
  set polling_owner   = p_owner,
      lock_expires_at = now() + make_interval(mins => p_ttl_min),
      updated_at      = now()
  where id = 1
    and (lock_expires_at is null or lock_expires_at < now());
  return found;  -- true si el update afectó la fila → lock tomado
end;
$$;

grant execute on function public.juego_try_claim_poll(uuid, int) to service_role;

-- ============================================================
-- Realtime: los clientes se suscriben a estas dos filas únicas.
-- (idempotente: ignora si la tabla ya está en la publicación)
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.juego_leaderboard_cache;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.juego_match_state;
exception when duplicate_object then null; end $$;

-- ============================================================
-- (Opcional) Prueba sintética del motor — descomentar para validar:
--   inserta un snapshot a mano, recalcula y mira el cache reordenarse.
-- ============================================================
-- insert into public.juego_match_snapshots
--   (source, match_status, home_score, away_score, ht_home_score, ht_away_score,
--    reg_home_score, reg_away_score, corners_total, yellow_cards_total, red_cards_total,
--    both_teams_scored, first_scorer_side, winner_side, went_to_extra_time, went_to_penalties)
-- values
--   -- 4-2 al 90' (marcador fuera del catálogo → gana "Otro resultado"), 8 córners
--   -- (Más de 7.5 ✓ / Menos de 9.5 ✓ / Más de 9.5 ✗), con alargue y penales.
--   ('manual','finished', 4,2, 1,0, 4,2, 8, 4, 1, true, 'home', 'home', true, true);
-- select public.juego_recompute_scores();
-- select ranking from public.juego_leaderboard_cache where id = 1;

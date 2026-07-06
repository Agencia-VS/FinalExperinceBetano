-- ================================================================
-- SEED & FIX: juego_match_state para producción
-- Ejecutar UNA vez en el SQL Editor de Supabase (producción).
-- ================================================================

-- 1) Asegurar que la fila de estado existe y está limpia
--    (limpia locks viejos que pudieron quedar colgados de pruebas).
insert into public.juego_match_state (id) 
values (1) 
on conflict (id) do nothing;

update public.juego_match_state
set 
  match_status       = 'scheduled',
  predictions_locked = false,
  polling_owner      = null,
  lock_expires_at    = null,
  updated_at         = now()
where id = 1
  and polling_owner is not null;  -- solo si hay un lock viejo colgado

-- 1b) Si fixture_id no está seteado, tomar el valor del entorno como fallback inicial.
--     Reemplaza '1565178' por el ID real de la final o del próximo partido.
update public.juego_match_state
set fixture_id = '1565178'
where id = 1
  and fixture_id is null;

update public.juego_match_state
set updated_at = now()
where id = 1;

-- 2) Verificar que el leaderboard cache tiene su fila.
insert into public.juego_leaderboard_cache (id) 
values (1) 
on conflict (id) do nothing;

-- 3) Recalcular puntajes desde cero (por si hay datos de prueba).
select public.juego_recompute_scores();

-- 4) Reportar estado actual para debug.
select 
  '✅ juego_match_state OK' as check_result,
  id,
  match_status,
  predictions_locked,
  fixture_id,
  kickoff_at,
  home_team,
  away_team,
  polling_owner is not null as has_poll_lock,
  updated_at
from public.juego_match_state
where id = 1;

-- 5) Reportar el último snapshot (para ver si el poller está funcionando).
select 
  '📸 Último snapshot' as info,
  fetched_at,
  match_status,
  home_score,
  away_score,
  corners_total,
  yellow_cards_total,
  red_cards_total
from public.juego_match_snapshots
order by fetched_at desc
limit 1;

-- 6) Contar jugadores registrados.
select 
  '👥 Jugadores' as info,
  count(*) as total
from public.juego_players;

-- 7) Contar pronósticos guardados.
select 
  '🎯 Pronósticos' as info,
  count(*) as total
from public.juego_predictions;

-- 8) Verificar que la tabla de Realtime está en la publicación.
select 
  '📡 Realtime tables' as info,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('juego_leaderboard_cache', 'juego_match_state');

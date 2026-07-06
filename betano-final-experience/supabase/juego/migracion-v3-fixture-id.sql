-- ================================================================
-- MIGRACIÓN: Agregar fixture_id a juego_match_state
-- Permite cambiar el partido desde el panel admin sin tocar Vercel.
-- Ejecutar UNA vez en el SQL Editor de Supabase.
-- ================================================================

-- 1) Agregar la columna fixture_id (nullable, sin valor por defecto).
alter table public.juego_match_state
  add column if not exists fixture_id text;

-- 2) Comentario para documentar.
comment on column public.juego_match_state.fixture_id is
  'ID del fixture en API-Football. Si es null, se usa la variable de entorno APIFOOTBALL_FIXTURE_ID.';

-- 3) Verificar.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'juego_match_state'
order by ordinal_position;

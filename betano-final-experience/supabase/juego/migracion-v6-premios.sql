-- ============================================================
-- Migración v6: Fase 2 — sorteo de premios físicos entre los ganadores
-- Ejecutar en el SQL Editor del proyecto Supabase (después de la v5).
--
-- · Se reparte un premio jerárquico a cada ganador de la Fase 1, sin
--   reposición, con semilla registrada → auditable y reproducible con
--   assignPrizes(winners, prizes, seededRng(prize_seed)).
-- · No se toca el enum `status`: la Fase 2 se detecta por raffled_at +
--   prize_assignments no vacío. Las columnas nuevas viajan solas en el
--   payload Realtime (juego_final_result ya está en la publicación).
-- ============================================================

-- 1. Estado vivo de los premios (columnas nuevas en la fila única id=1)
alter table public.juego_final_result
  add column if not exists prizes             jsonb not null default '[]'::jsonb,  -- Prize[]
  add column if not exists prize_assignments  jsonb not null default '[]'::jsonb,  -- PrizeAssignment[]
  add column if not exists prize_seed         text,
  add column if not exists raffled_at         timestamptz;

-- 2. Auditoría append-only de los sorteos de premios (NO va en Realtime)
create table if not exists public.juego_prize_runs (
  id                 uuid primary key default gen_random_uuid(),
  prize_seed         text  not null,
  winners_snapshot   jsonb not null,  -- Winner[] congelado al momento del sorteo
  prizes             jsonb not null,  -- Prize[]
  prize_assignments  jsonb not null,  -- PrizeAssignment[]
  executed_by        uuid,
  executed_at        timestamptz not null default now(),
  undone_at          timestamptz
);

-- 3. RLS
alter table public.juego_prize_runs enable row level security;

-- Gestión completa para admin autenticado (mismo patrón que la v5).
do $$
declare t text;
begin
  foreach t in array array['juego_prize_runs'] loop
    execute format('drop policy if exists %I on public.%I', 'juego_admin_all_'||t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'juego_admin_all_'||t, t);
  end loop;
end $$;

-- Nota: juego_final_result ya tiene lectura pública (anon) y está en la
-- publicación supabase_realtime desde la v5; las columnas nuevas se incluyen
-- automáticamente. juego_prize_runs es auditoría: sin lectura anon, sin Realtime.

-- ============================================================
-- Migración v5: Ranking final + sorteo de desempate (ruleta)
-- Ejecutar en el SQL Editor del proyecto Supabase.
--
-- · juego_final_result: fila única (id=1) con el estado del sorteo
--   final. Los clientes se suscriben por Realtime; la transición
--   idle → executed dispara la animación de la ruleta en todas
--   las pantallas (teléfonos + TV).
-- · juego_final_runs: auditoría append-only. Cada ejecución guarda
--   seed + snapshot del ranking → el resultado es 100% reproducible
--   con calculateWinners(snapshot, max_winners, seededRng(seed)).
--   Sobrevive a undo y a reset del juego.
-- ============================================================

-- 1. Estado vivo del final (fila única, Realtime)
create table if not exists public.juego_final_result (
  id                 int primary key default 1 check (id = 1),
  status             text not null default 'idle'
                       check (status in ('idle','executed','revealed')),
  seed               text,
  max_winners        int,
  winners            jsonb not null default '[]'::jsonb,  -- Winner[] (alias/avatar/puntos, sin PII)
  tie_breaker_events jsonb not null default '[]'::jsonb,  -- TieBreakerEvent[]
  executed_by        uuid,
  executed_at        timestamptz,
  revealed_at        timestamptz,
  updated_at         timestamptz not null default now()
);

insert into public.juego_final_result (id) values (1)
on conflict (id) do nothing;

-- 2. Auditoría append-only (NO va en la publicación Realtime)
create table if not exists public.juego_final_runs (
  id                 uuid primary key default gen_random_uuid(),
  seed               text not null,
  max_winners        int  not null,
  ranking_snapshot   jsonb not null,  -- Row[] congelado al momento del sorteo
  winners            jsonb not null,
  tie_breaker_events jsonb not null,
  executed_by        uuid,
  executed_at        timestamptz not null default now(),
  undone_at          timestamptz
);

-- 3. RLS
alter table public.juego_final_result enable row level security;
alter table public.juego_final_runs   enable row level security;

-- Lectura pública sólo del resultado (necesaria para que Realtime
-- llegue a los teléfonos sin sesión; no expone PII).
drop policy if exists "juego_final_result_read" on public.juego_final_result;
create policy "juego_final_result_read" on public.juego_final_result
  for select to anon, authenticated using (true);

-- Gestión completa para admin autenticado.
do $$
declare t text;
begin
  foreach t in array array['juego_final_result','juego_final_runs'] loop
    execute format('drop policy if exists %I on public.%I', 'juego_admin_all_'||t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'juego_admin_all_'||t, t);
  end loop;
end $$;

grant select on public.juego_final_result to anon, authenticated;

-- 4. Realtime (idempotente: ignora si ya está en la publicación)
do $$ begin
  alter publication supabase_realtime add table public.juego_final_result;
exception when duplicate_object then null; end $$;

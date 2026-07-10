-- ============================================================
-- Migración v7: catálogo de premios preconfigurable
-- Ejecutar en el SQL Editor del proyecto Supabase (después de la v6).
--
-- · Fila única (id=1) con la lista de premios que el admin deja cargada de
--   antemano, ordenada del más valioso al menos valioso. La noche del evento
--   sólo hay que apretar "Sortear premios": no se escribe en vivo.
-- · Si el catálogo tiene más premios que ganadores, el sorteo usa sólo los N
--   más valiosos (los primeros N). Sólo la usa el admin: sin lectura anon, sin
--   Realtime.
-- ============================================================

create table if not exists public.juego_prize_catalog (
  id          int primary key default 1 check (id = 1),
  prizes      jsonb not null default '[]'::jsonb,  -- string[] (nombres), más valioso primero
  updated_at  timestamptz not null default now()
);

insert into public.juego_prize_catalog (id) values (1)
on conflict (id) do nothing;

alter table public.juego_prize_catalog enable row level security;

-- Gestión completa para admin autenticado (mismo patrón que la v5/v6).
do $$
declare t text;
begin
  foreach t in array array['juego_prize_catalog'] loop
    execute format('drop policy if exists %I on public.%I', 'juego_admin_all_'||t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'juego_admin_all_'||t, t);
  end loop;
end $$;

-- ============================================================
-- Final Experience Betano — Esquema Supabase
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- 1. Tabla de participantes
create table if not exists public.participantes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  email         text not null,
  telefono      text not null,
  tipo_doc      text not null default 'RUT'
                  check (tipo_doc in ('RUT', 'DNI_EXTRANJERO', 'PASAPORTE')),
  documento     text not null,
  motivo        text,
  mayor_edad    boolean not null,
  acepta_bases  boolean not null,
  created_at    timestamptz not null default now()
);

-- Un documento sólo puede inscribirse una vez.
create unique index if not exists participantes_documento_unico
  on public.participantes (tipo_doc, documento);

-- Sólo aceptamos mayores de edad y que aceptaron las bases.
alter table public.participantes
  add constraint chk_mayor_edad check (mayor_edad = true),
  add constraint chk_acepta_bases check (acepta_bases = true);

-- 2. Tabla del sorteo (1 fila por ejecución, semilla guardada = auditable)
create table if not exists public.sorteos (
  id            uuid primary key default gen_random_uuid(),
  semilla       text not null,
  ejecutado_por uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- 3. Resultado del sorteo: posición de cada participante
create table if not exists public.sorteo_resultados (
  id              uuid primary key default gen_random_uuid(),
  sorteo_id       uuid not null references public.sorteos (id) on delete cascade,
  participante_id uuid not null references public.participantes (id) on delete cascade,
  posicion        int  not null,            -- 1..N (1-10 = ganadores, 11+ = suplentes)
  es_ganador      boolean not null default false,
  premio_tomado   boolean,                  -- null = sin respuesta, true/false = decisión
  notificado_at   timestamptz,
  unique (sorteo_id, posicion),
  unique (sorteo_id, participante_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.participantes      enable row level security;
alter table public.sorteos            enable row level security;
alter table public.sorteo_resultados  enable row level security;

-- Inserción pública de inscripciones (anon). Sin lectura pública.
drop policy if exists "insert_inscripcion_publica" on public.participantes;
create policy "insert_inscripcion_publica"
  on public.participantes for insert
  to anon, authenticated
  with check (true);

-- Lectura/gestión de tablas: SOLO usuarios autenticados (admin).
-- El service role (panel admin server-side) bypassa RLS de todos modos.
drop policy if exists "select_participantes_auth" on public.participantes;
create policy "select_participantes_auth"
  on public.participantes for select to authenticated using (true);

drop policy if exists "all_sorteos_auth" on public.sorteos;
create policy "all_sorteos_auth"
  on public.sorteos for all to authenticated using (true) with check (true);

drop policy if exists "all_resultados_auth" on public.sorteo_resultados;
create policy "all_resultados_auth"
  on public.sorteo_resultados for all to authenticated using (true) with check (true);

-- ============================================================
-- Función de sorteo reproducible con semilla (Postgres)
-- Baraja todos los participantes usando setseed() => auditable.
-- Devuelve el id del sorteo creado.
-- ============================================================
create or replace function public.ejecutar_sorteo(p_semilla text, p_ejecutor uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_sorteo_id uuid;
  v_seed_num  double precision;
begin
  -- Derivar un float en (-1, 1) desde la semilla de texto (determinista).
  v_seed_num := (('x' || substr(md5(p_semilla), 1, 8))::bit(32)::bigint::double precision
                 / 2147483648.0) - 1.0;
  if v_seed_num >= 1.0 then v_seed_num := 0.999999; end if;

  insert into public.sorteos (semilla, ejecutado_por)
  values (p_semilla, p_ejecutor)
  returning id into v_sorteo_id;

  perform setseed(v_seed_num);

  -- Barajar UNA sola vez (orden materializado), luego asignar posiciones.
  insert into public.sorteo_resultados
    (sorteo_id, participante_id, posicion, es_ganador, premio_tomado)
  with barajado as (
    select p.id, row_number() over (order by random()) as pos
    from public.participantes p
  )
  select v_sorteo_id, b.id, b.pos, (b.pos <= 10), null
  from barajado b;

  return v_sorteo_id;
end;
$$;

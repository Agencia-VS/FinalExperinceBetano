-- ============================================================
-- Migración v8: Trivia con 10 sorteos en vivo (evento 19/07/2026)
-- Ejecutar en el SQL Editor del proyecto Supabase.
--
-- Reemplaza la dinámica de pronósticos por una trivia guiada por el
-- host, SIN tocar ninguna tabla existente del juego de pronósticos
-- (que queda intacto para una futura activación).
--
-- · juego_trivia_questions: las 10 preguntas, cada una con su propia
--   máquina de estados (borrador → abierta → cerrada → sorteada).
--   La ventana de respuesta se cierra por RELOJ DEL SERVIDOR
--   (closes_at), no por un cron: en serverless no hay proceso que
--   "despierte" a los 90s, así que el trigger de guardia valida
--   now() < closes_at en cada insert/update de respuesta.
-- · juego_trivia_draws: UNA FILA POR PREGUNTA (a diferencia del
--   singleton juego_final_result). Cada sorteo tiene su propio
--   status/seed/executed_at → los clientes distinguen por Realtime
--   exactamente qué ruleta acaba de dispararse. Las filas se
--   pre-crean en idle porque los clientes escuchan eventos UPDATE.
-- · juego_trivia_draw_runs: auditoría append-only (mismo patrón que
--   juego_final_runs). Sobrevive a undo.
-- · juego_trivia_config: fila única con kickoff_at — el mismo valor
--   es corte de inscripción Y cierre automático de la pregunta 10.
--
-- SEGURIDAD (anti-trampa): juego_trivia_options NO tiene política de
-- lectura pública. Si la tuviera, cualquiera con la anon key (visible
-- en el bundle JS) podría leer es_correcta vía PostgREST mientras la
-- pregunta está abierta. Los teléfonos reciben las opciones a través
-- de la API del sitio (service role), que omite es_correcta hasta que
-- la pregunta cierra. Realtime solo necesita questions/draws/config.
-- ============================================================

-- 1. Preguntas
create table if not exists public.juego_trivia_questions (
  id                          uuid primary key default gen_random_uuid(),
  orden                       int not null,
  texto                       text not null,
  momento                     text check (momento in ('pre','entretiempo','post')),
  premio_label                text,
  duration_seconds            int not null default 90 check (duration_seconds between 10 and 3600),
  requiere_resolucion_manual  boolean not null default false,  -- Q9/Q10: la correcta se setea en vivo
  cierra_con_kickoff          boolean not null default false,  -- Q10: closes_at sigue al kickoff de config
  status                      text not null default 'borrador'
                                check (status in ('borrador','abierta','cerrada','sorteada')),
  opened_at                   timestamptz,
  closes_at                   timestamptz,   -- abierta + now() >= closes_at ⇒ cerrada de facto
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists juego_trivia_questions_orden_uidx
  on public.juego_trivia_questions (orden);

-- 2. Opciones (es_correcta NUNCA llega al cliente mientras la pregunta está abierta)
create table if not exists public.juego_trivia_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.juego_trivia_questions (id) on delete cascade,
  etiqueta     text not null,
  es_correcta  boolean not null default false,
  orden        int not null default 0
);

create index if not exists juego_trivia_options_question_idx
  on public.juego_trivia_options (question_id, orden);

-- Idempotencia del seed y sanidad: una etiqueta única por pregunta.
create unique index if not exists juego_trivia_options_natural_uidx
  on public.juego_trivia_options (question_id, etiqueta);

-- 3. Respuestas (una por jugador por pregunta; upsert re-elige mientras esté abierta)
create table if not exists public.juego_trivia_answers (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.juego_players (id) on delete cascade,
  question_id  uuid not null references public.juego_trivia_questions (id) on delete cascade,
  option_id    uuid not null references public.juego_trivia_options (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (player_id, question_id)
);

create index if not exists juego_trivia_answers_question_idx
  on public.juego_trivia_answers (question_id, option_id);

-- 4. Sorteos: una fila por pregunta (pre-creada en idle → Realtime por UPDATE)
create table if not exists public.juego_trivia_draws (
  question_id  uuid primary key references public.juego_trivia_questions (id) on delete cascade,
  status       text not null default 'idle'
                 check (status in ('idle','executed','revealed')),
  seed         text,
  pool_snapshot jsonb not null default '[]'::jsonb,  -- TieBreakerPlayer[] congelado (alias/avatar, sin PII)
  winner       jsonb,                                 -- TieBreakerPlayer del ganador
  es_consuelo  boolean not null default false,        -- true si nadie acertó → sorteo entre todos
  executed_by  uuid,
  executed_at  timestamptz,
  revealed_at  timestamptz,
  updated_at   timestamptz not null default now()
);

-- 5. Auditoría append-only (NO va en la publicación Realtime, sin lectura anon)
create table if not exists public.juego_trivia_draw_runs (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null,
  seed          text not null,
  pool_snapshot jsonb not null,
  winner        jsonb not null,
  es_consuelo   boolean not null default false,
  executed_by   uuid,
  executed_at   timestamptz not null default now(),
  undone_at     timestamptz
);

-- 6. Config (fila única): kickoff = corte de inscripción + cierre de la Q10
create table if not exists public.juego_trivia_config (
  id          int primary key default 1 check (id = 1),
  kickoff_at  timestamptz,
  updated_at  timestamptz not null default now()
);

insert into public.juego_trivia_config (id) values (1)
on conflict (id) do nothing;

-- ============================================================
-- Trigger de guardia: la ventana se cierra por reloj del servidor.
-- Vale incluso para service_role (defensa contra bugs de API).
-- closes_at null ⇒ sin límite de tiempo (Q10 antes de configurar kickoff).
-- ============================================================
create or replace function public.juego_guard_trivia_answers()
returns trigger
language plpgsql
as $$
declare
  q record;
begin
  select status, closes_at into q
    from public.juego_trivia_questions where id = new.question_id;
  if q is null then
    raise exception 'Pregunta inexistente' using errcode = 'check_violation';
  end if;
  if q.status <> 'abierta' or (q.closes_at is not null and now() >= q.closes_at) then
    raise exception 'La pregunta está cerrada' using errcode = 'check_violation';
  end if;
  -- La opción debe pertenecer a la pregunta (evita cruzar respuestas).
  if not exists (
    select 1 from public.juego_trivia_options o
    where o.id = new.option_id and o.question_id = new.question_id
  ) then
    raise exception 'Opción inválida para esta pregunta' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists juego_trivia_answers_guard on public.juego_trivia_answers;
create trigger juego_trivia_answers_guard
  before insert or update on public.juego_trivia_answers
  for each row execute function public.juego_guard_trivia_answers();

-- ============================================================
-- RLS
--   · questions/draws/config: lectura pública (Realtime en teléfonos
--     sin sesión; no exponen la respuesta correcta ni PII).
--   · options y answers: SIN lectura pública (ver nota de seguridad
--     arriba). Solo la API del sitio (service role) y el admin.
--   · runs: solo admin.
-- ============================================================
alter table public.juego_trivia_questions enable row level security;
alter table public.juego_trivia_options   enable row level security;
alter table public.juego_trivia_answers   enable row level security;
alter table public.juego_trivia_draws     enable row level security;
alter table public.juego_trivia_draw_runs enable row level security;
alter table public.juego_trivia_config    enable row level security;

drop policy if exists "juego_trivia_questions_read" on public.juego_trivia_questions;
create policy "juego_trivia_questions_read" on public.juego_trivia_questions
  for select to anon, authenticated using (true);

drop policy if exists "juego_trivia_draws_read" on public.juego_trivia_draws;
create policy "juego_trivia_draws_read" on public.juego_trivia_draws
  for select to anon, authenticated using (true);

drop policy if exists "juego_trivia_config_read" on public.juego_trivia_config;
create policy "juego_trivia_config_read" on public.juego_trivia_config
  for select to anon, authenticated using (true);

-- Gestión completa para admin autenticado (panel /juego/admin).
do $$
declare t text;
begin
  foreach t in array array[
    'juego_trivia_questions','juego_trivia_options','juego_trivia_answers',
    'juego_trivia_draws','juego_trivia_draw_runs','juego_trivia_config'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'juego_admin_all_'||t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'juego_admin_all_'||t, t);
  end loop;
end $$;

grant select on
  public.juego_trivia_questions,
  public.juego_trivia_draws,
  public.juego_trivia_config
  to anon, authenticated;

-- ============================================================
-- Realtime (idempotente)
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.juego_trivia_questions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.juego_trivia_draws;
exception when duplicate_object then null; end $$;

-- ============================================================
-- Seed: las 10 preguntas del docx "trivia_mundiales_2026_chile".
-- Idempotente vía on conflict (orden) / (question_id, etiqueta).
-- · Q1–Q9 nacen en borrador (el host las abre una a una en vivo).
-- · Q10 nace ABIERTA con cierra_con_kickoff: respondible desde el
--   registro; su closes_at se fija al guardar el kickoff en config.
-- · Q9/Q10: sin correcta en el seed (se setea en vivo desde el panel).
-- ============================================================
insert into public.juego_trivia_questions
  (orden, texto, momento, requiere_resolucion_manual, cierra_con_kickoff, status)
values
  (1,  '¿En qué año Chile fue anfitrión de una Copa del Mundo?', 'pre', false, false, 'borrador'),
  (2,  'En el Mundial de Francia 1998, ¿contra qué selección anotó Marcelo Salas un recordado doblete, incluido un gol de cabeza, en el debut de Chile?', 'pre', false, false, 'borrador'),
  (3,  '¿Cómo se conoce en Chile el remate de Mauricio Pinilla que pegó en el travesaño ante Brasil en los octavos de final del Mundial 2014?', 'pre', false, false, 'borrador'),
  (4,  '"La Mano de Dios" y el "Gol del Siglo" se marcaron en el mismo partido del Mundial 1986, ¿contra qué selección jugó?', 'pre', false, false, 'borrador'),
  (5,  '¿Quién era el director técnico de la selección chilena durante las Eliminatorias hacia el Mundial 2026?', 'entretiempo', false, false, 'borrador'),
  (6,  '¿En qué estadio se jugó el partido inaugural del Mundial 2026?', 'entretiempo', false, false, 'borrador'),
  (7,  '¿Qué selección venció 2-0 a Francia en la primera semifinal del Mundial 2026 y avanzó a la final?', 'entretiempo', false, false, 'borrador'),
  (8,  '¿Qué selección eliminó a Chile del camino al Mundial 2026, al vencerla 2-0 durante las Eliminatorias Sudamericanas?', 'entretiempo', false, false, 'borrador'),
  (9,  'Durante este Mundial 2026, ¿qué jugador se convirtió en el máximo goleador histórico de todas las Copas del Mundo, superando a Miroslav Klose?', 'post', true, false, 'borrador'),
  (10, '¿Quién creen que será el campeón del Mundial 2026?', 'post', true, true, 'abierta')
on conflict (orden) do nothing;

insert into public.juego_trivia_options (question_id, etiqueta, es_correcta, orden)
select q.id, o.etiqueta, o.es_correcta, o.orden
from (values
  (1,  '1950', false, 1), (1, '1958', false, 2), (1, '1962', true,  3), (1, '1966', false, 4),
  (2,  'Austria', false, 1), (2, 'Camerún', false, 2), (2, 'Italia', true, 3), (2, 'Inglaterra', false, 4),
  (3,  '"El palo de Pinilla"', true, 1), (3, '"El grito de Pinilla"', false, 2), (3, '"La ilusión de Brasil"', false, 3), (3, '"El centímetro de gloria"', false, 4),
  (4,  'Brasil', false, 1), (4, 'Alemania', false, 2), (4, 'Inglaterra', true, 3), (4, 'Bélgica', false, 4),
  (5,  'Reinaldo Rueda', false, 1), (5, 'Ricardo Gareca', true, 2), (5, 'Eduardo Berizzo', false, 3), (5, 'Martín Lasarte', false, 4),
  (6,  'MetLife Stadium, Nueva Jersey', false, 1), (6, 'Estadio Azteca, Ciudad de México', true, 2), (6, 'SoFi Stadium, Los Ángeles', false, 3), (6, 'BC Place, Vancouver', false, 4),
  (7,  'Inglaterra', false, 1), (7, 'Argentina', false, 2), (7, 'España', true, 3), (7, 'Marruecos', false, 4),
  (8,  'Perú', false, 1), (8, 'Bolivia', true, 2), (8, 'Venezuela', false, 3), (8, 'Ecuador', false, 4),
  (9,  'Kylian Mbappé', false, 1), (9, 'Lionel Messi', false, 2), (9, 'Harry Kane', false, 3), (9, 'Erling Haaland', false, 4),
  (10, 'España', false, 1), (10, 'Argentina', false, 2)
) as o(orden_pregunta, etiqueta, es_correcta, orden)
join public.juego_trivia_questions q on q.orden = o.orden_pregunta
on conflict (question_id, etiqueta) do nothing;

-- Pre-crear la fila de sorteo de cada pregunta (los clientes escuchan UPDATE).
insert into public.juego_trivia_draws (question_id)
select id from public.juego_trivia_questions
on conflict (question_id) do nothing;

-- ============================================================
-- MIGRACIÓN v1 → v2 de mercados del JUEGO — Final Mundial 2026
-- Para una DB que YA corrió schema.sql + seed-mercados.sql v1.
-- Ejecutar UNA vez en el SQL Editor de Supabase. Auto-contenido:
-- no hace falta correr nada más (el catálogo de abajo es idéntico
-- al de seed-mercados.sql v2).
--
-- Qué cambia:
--  1. juego_markets.tiempo ('90'/'120'/'ht'/null) — chip de claridad en la UI.
--  2. juego_match_snapshots.went_to_penalties — para los mercados de desenlace.
--  3. juego_recompute_scores() v2 — "Otro resultado", metodo_victoria,
--     habra_penales, y va_alargue 'sí' acierta en vivo.
--  4. Los 6 mercados O/U pasan a líneas .5 balanceadas (3 over + 3 under):
--     se BORRAN sus opciones v1 y se insertan las v2.
--     ⚠️ Los pronósticos existentes sobre esas opciones se borran en cascada
--     (option_id → on delete cascade). Aceptable ANTES del evento (solo hay
--     picks de prueba). NO correr esto con pronósticos reales guardados.
--  5. resultado_exacto: +5 marcadores y "Otro resultado".
--  6. Mercados nuevos: metodo_victoria y habra_penales. Reordenamiento.
--
-- Al final recalcula puntajes y leaderboard.
-- ============================================================

-- ------- 1 y 2: columnas nuevas -------
alter table public.juego_markets
  add column if not exists tiempo text check (tiempo in ('90','120','ht'));

alter table public.juego_match_snapshots
  add column if not exists went_to_penalties boolean not null default false;

-- ------- 3: motor de puntaje v2 -------
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

-- ------- 4: opciones O/U v1 fuera (cascada borra picks de prueba) -------
delete from public.juego_market_options
where market_id in (
  'total_goles_ou','total_corners_ou','total_amarillas_ou',
  'tiros_arco_ou','faltas_ou','offsides_ou'
);

-- ------- 5 y 6: catálogo v2 (idéntico a seed-mercados.sql v2) -------
insert into public.juego_markets (id, titulo, descripcion, resolves_at, tiempo, orden) values
  ('campeon',            '¿Quién será campeón?',       'Ganador de la final (incluye alargue y penales).',            'fulltime', '120', 1),
  ('resultado_exacto',   'Resultado exacto (90'')',     'Marcador exacto al minuto 90 (sin contar alargue).',          'fulltime', '90',  2),
  ('ganador_ht',         '¿Quién gana al descanso?',   'Resultado al entretiempo.',                                   'halftime', 'ht',  3),
  ('primer_gol',         '¿Quién anota primero?',      'Primer gol del partido (incluye alargue si lo hay).',         'live',     '120', 4),
  ('total_goles_ou',     'Total de goles',             'Goles totales del partido, incluye alargue si lo hay.',       'live',     '120', 5),
  ('ambas_anotan',       '¿Ambos equipos anotan?',     'En cualquier momento del partido (incluye alargue).',         'live',     '120', 6),
  ('total_corners_ou',   'Total de córners',           'Córners totales del partido, incluye alargue si lo hay.',     'live',     '120', 7),
  ('total_amarillas_ou', 'Total de amarillas',         'Tarjetas amarillas totales, incluye alargue si lo hay.',      'live',     '120', 8),
  ('habra_roja',         '¿Habrá tarjeta roja?',       'En cualquier momento del partido (incluye alargue).',         'live',     '120', 9),
  ('va_alargue',         '¿Se va a alargue?',          'Si la final se define en tiempo extra.',                      'fulltime', null,  10),
  ('metodo_victoria',    '¿Cómo se define la final?',  'El desenlace: en los 90'', en el alargue o por penales.',     'fulltime', null,  11),
  ('habra_penales',      '¿Habrá tanda de penales?',   'Si la final se decide desde los doce pasos.',                 'fulltime', null,  12),
  ('tiros_arco_ou',      'Tiros al arco',              'Tiros al arco totales, incluye alargue si lo hay.',           'live',     '120', 13),
  ('faltas_ou',          'Faltas',                     'Faltas totales del partido, incluye alargue si lo hay.',      'live',     '120', 14),
  ('offsides_ou',        'Fueras de juego',            'Offsides totales del partido, incluye alargue si lo hay.',    'live',     '120', 15),
  ('posesion',           'Posesión',                   '¿Qué equipo termina con mayor posesión? (partido completo)',  'live',     '120', 16)
on conflict (id) do update
  set titulo      = excluded.titulo,
      descripcion = excluded.descripcion,
      resolves_at = excluded.resolves_at,
      tiempo      = excluded.tiempo,
      orden       = excluded.orden;

insert into public.juego_market_options
  (market_id, etiqueta, valor, umbral, direccion, puntos, orden) values
  -- resultado exacto: marcadores nuevos + "Otro resultado" (los 10 v1 ya existen)
  ('resultado_exacto', '2-2', '2-2', null, null,  80, 9),
  ('resultado_exacto', '3-0', '3-0', null, null,  95, 10),
  ('resultado_exacto', '0-3', '0-3', null, null,  95, 11),
  ('resultado_exacto', '3-2', '3-2', null, null,  95, 14),
  ('resultado_exacto', '2-3', '2-3', null, null,  95, 15),
  ('resultado_exacto', 'Otro resultado', 'otro', null, null, 60, 99),

  -- total de goles (líneas 1.5 / 2.5 / 3.5, balanceado)
  ('total_goles_ou', 'Más de 1.5',   null, 1.5, 'over',  35, 1),
  ('total_goles_ou', 'Más de 2.5',   null, 2.5, 'over',  50, 2),
  ('total_goles_ou', 'Más de 3.5',   null, 3.5, 'over',  70, 3),
  ('total_goles_ou', 'Menos de 1.5', null, 1.5, 'under', 60, 4),
  ('total_goles_ou', 'Menos de 2.5', null, 2.5, 'under', 40, 5),
  ('total_goles_ou', 'Menos de 3.5', null, 3.5, 'under', 30, 6),

  -- total de córners (líneas 7.5 / 9.5 / 11.5, balanceado)
  ('total_corners_ou', 'Más de 7.5',    null, 7.5,  'over',  35, 1),
  ('total_corners_ou', 'Más de 9.5',    null, 9.5,  'over',  50, 2),
  ('total_corners_ou', 'Más de 11.5',   null, 11.5, 'over',  70, 3),
  ('total_corners_ou', 'Menos de 7.5',  null, 7.5,  'under', 65, 4),
  ('total_corners_ou', 'Menos de 9.5',  null, 9.5,  'under', 50, 5),
  ('total_corners_ou', 'Menos de 11.5', null, 11.5, 'under', 35, 6),

  -- total de amarillas (líneas 3.5 / 5.5 / 7.5, balanceado)
  ('total_amarillas_ou', 'Más de 3.5',   null, 3.5, 'over',  35, 1),
  ('total_amarillas_ou', 'Más de 5.5',   null, 5.5, 'over',  50, 2),
  ('total_amarillas_ou', 'Más de 7.5',   null, 7.5, 'over',  75, 3),
  ('total_amarillas_ou', 'Menos de 3.5', null, 3.5, 'under', 65, 4),
  ('total_amarillas_ou', 'Menos de 5.5', null, 5.5, 'under', 50, 5),
  ('total_amarillas_ou', 'Menos de 7.5', null, 7.5, 'under', 35, 6),

  -- cómo se define la final
  ('metodo_victoria', 'En 90 minutos', 'reg', null, null, 35, 1),
  ('metodo_victoria', 'En alargue',    'et',  null, null, 70, 2),
  ('metodo_victoria', 'En penales',    'pen', null, null, 55, 3),

  -- habrá tanda de penales
  ('habra_penales', 'Sí', 'si', null, null, 65, 1),
  ('habra_penales', 'No', 'no', null, null, 30, 2),

  -- tiros al arco (líneas 7.5 / 9.5 / 11.5, balanceado)
  ('tiros_arco_ou', 'Más de 7.5',    null, 7.5,  'over',  40, 1),
  ('tiros_arco_ou', 'Más de 9.5',    null, 9.5,  'over',  55, 2),
  ('tiros_arco_ou', 'Más de 11.5',   null, 11.5, 'over',  70, 3),
  ('tiros_arco_ou', 'Menos de 7.5',  null, 7.5,  'under', 60, 4),
  ('tiros_arco_ou', 'Menos de 9.5',  null, 9.5,  'under', 50, 5),
  ('tiros_arco_ou', 'Menos de 11.5', null, 11.5, 'under', 35, 6),

  -- faltas (líneas 21.5 / 25.5 / 29.5, balanceado)
  ('faltas_ou', 'Más de 21.5',   null, 21.5, 'over',  40, 1),
  ('faltas_ou', 'Más de 25.5',   null, 25.5, 'over',  50, 2),
  ('faltas_ou', 'Más de 29.5',   null, 29.5, 'over',  70, 3),
  ('faltas_ou', 'Menos de 21.5', null, 21.5, 'under', 60, 4),
  ('faltas_ou', 'Menos de 25.5', null, 25.5, 'under', 50, 5),
  ('faltas_ou', 'Menos de 29.5', null, 29.5, 'under', 35, 6),

  -- offsides (líneas 2.5 / 3.5 / 4.5, balanceado)
  ('offsides_ou', 'Más de 2.5',   null, 2.5, 'over',  40, 1),
  ('offsides_ou', 'Más de 3.5',   null, 3.5, 'over',  50, 2),
  ('offsides_ou', 'Más de 4.5',   null, 4.5, 'over',  65, 3),
  ('offsides_ou', 'Menos de 2.5', null, 2.5, 'under', 60, 4),
  ('offsides_ou', 'Menos de 3.5', null, 3.5, 'under', 50, 5),
  ('offsides_ou', 'Menos de 4.5', null, 4.5, 'under', 40, 6)
on conflict (market_id, etiqueta) do nothing;

-- Reordenar los 10 marcadores v1 de resultado_exacto para intercalar los nuevos.
update public.juego_market_options set orden = 12 where market_id = 'resultado_exacto' and etiqueta = '3-1';
update public.juego_market_options set orden = 13 where market_id = 'resultado_exacto' and etiqueta = '1-3';

-- ------- Recalcular puntajes y leaderboard con el catálogo nuevo -------
select public.juego_recompute_scores();

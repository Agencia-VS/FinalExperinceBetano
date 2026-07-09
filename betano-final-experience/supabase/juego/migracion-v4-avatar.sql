-- ============================================================
-- Migración v4: Columna avatar en juego_players
-- Ejecutar en el SQL Editor del proyecto Supabase.
-- Actualiza también juego_recompute_scores() para incluir avatar
-- en el JSON del leaderboard cache.
-- ============================================================

-- 1. Agregar columna avatar a juego_players
alter table public.juego_players
  add column if not exists avatar text;

-- 2. Reemplazar juego_recompute_scores() para incluir avatar en el ranking
create or replace function public.juego_recompute_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Puntaje por jugador contra el último snapshot.
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
            when mo.valor = 'si' then l.went_to_extra_time
            when mo.valor = 'no' then l.match_status = 'finished' and not l.went_to_extra_time
            else false
          end
        when 'metodo_victoria' then
          case
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
          l.match_status = 'finished'
          and l.possession_home is not null and l.possession_away is not null
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
                   'avatar',    avatar,
                   'puntos',    puntos
                 ) order by posicion, alias)
        from (
          select ps.player_id, pl.alias, pl.avatar, ps.puntos,
                 rank() over (order by ps.puntos desc) as posicion
          from public.juego_player_scores ps
          join public.juego_players pl on pl.id = ps.player_id
        ) r
      ), '[]'::jsonb),
      updated_at = now()
  where id = 1;
end;
$$;

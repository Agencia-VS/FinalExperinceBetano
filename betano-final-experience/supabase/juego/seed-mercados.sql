-- ============================================================
-- Seed de mercados del JUEGO — Final Mundial 2026
-- Ejecutar DESPUÉS de schema.sql, en el SQL Editor de Supabase.
--
-- Idempotente: los mercados se upsertean; las opciones usan clave natural
-- (market_id, etiqueta) con `on conflict do nothing`, así re-correr el seed
-- NO pisa los puntos que el admin haya editado en /juego/admin/mercados.
--
-- NOTA: 'Local'/'Visita' son placeholders — editar etiquetas con los nombres
-- reales de los finalistas cuando se conozcan (~13 jul). La resolución usa
-- 'home'/'away', no el nombre, así que cambiar la etiqueta no rompe el puntaje.
-- ============================================================

-- ------- Mercados (14) -------
insert into public.juego_markets (id, titulo, descripcion, resolves_at, orden) values
  ('campeon',            '¿Quién será campeón?',    'Ganador de la final (incluye alargue y penales).', 'fulltime', 1),
  ('resultado_exacto',   'Resultado exacto (90'')',  'Marcador al minuto 90.',                           'fulltime', 2),
  ('ganador_ht',         '¿Quién gana al descanso?','Resultado al entretiempo.',                        'halftime', 3),
  ('primer_gol',         '¿Quién anota primero?',   NULL,                                               'live',     4),
  ('total_goles_ou',     'Total de goles',          'Goles totales del partido.',                       'live',     5),
  ('ambas_anotan',       '¿Ambos equipos anotan?',  NULL,                                               'live',     6),
  ('total_corners_ou',   'Total de córners',        'Córners totales del partido.',                     'live',     7),
  ('total_amarillas_ou', 'Total de amarillas',      'Tarjetas amarillas totales.',                      'live',     8),
  ('habra_roja',         '¿Habrá tarjeta roja?',    NULL,                                               'live',     9),
  ('va_alargue',         '¿Se va a alargue?',       'Si la final se define en tiempo extra.',           'fulltime', 10),
  ('tiros_arco_ou',      'Tiros al arco',           'Tiros al arco totales del partido.',               'live',    11),
  ('faltas_ou',          'Faltas',                  'Faltas totales del partido.',                      'live',    12),
  ('offsides_ou',        'Fueras de juego',         'Offsides totales del partido.',                    'live',    13),
  ('posesion',           'Posesión',                '¿Qué equipo tendrá mayor posesión?',               'live',    14)
on conflict (id) do update
  set titulo      = excluded.titulo,
      descripcion = excluded.descripcion,
      resolves_at = excluded.resolves_at,
      orden       = excluded.orden;

-- ------- Opciones (etiqueta, valor, umbral, direccion, puntos, orden) -------
insert into public.juego_market_options
  (market_id, etiqueta, valor, umbral, direccion, puntos, orden) values
  -- campeón (binario)
  ('campeon', 'Local',  'home', null, null, 60, 1),
  ('campeon', 'Visita', 'away', null, null, 60, 2),

  -- resultado exacto al 90' (difícil → alto)
  ('resultado_exacto', '1-0', '1-0', null, null,  70, 1),
  ('resultado_exacto', '2-0', '2-0', null, null,  85, 2),
  ('resultado_exacto', '2-1', '2-1', null, null,  80, 3),
  ('resultado_exacto', '0-0', '0-0', null, null,  75, 4),
  ('resultado_exacto', '1-1', '1-1', null, null,  70, 5),
  ('resultado_exacto', '0-1', '0-1', null, null,  70, 6),
  ('resultado_exacto', '0-2', '0-2', null, null,  85, 7),
  ('resultado_exacto', '1-2', '1-2', null, null,  80, 8),
  ('resultado_exacto', '3-1', '3-1', null, null, 100, 9),
  ('resultado_exacto', '1-3', '1-3', null, null, 100, 10),

  -- ganador al descanso (home/draw/away)
  ('ganador_ht', 'Gana Local',  'home', null, null, 40, 1),
  ('ganador_ht', 'Empate',      'draw', null, null, 35, 2),
  ('ganador_ht', 'Gana Visita', 'away', null, null, 40, 3),

  -- primer gol
  ('primer_gol', 'Local',  'home', null, null, 45, 1),
  ('primer_gol', 'Visita', 'away', null, null, 45, 2),

  -- total de goles (overs graduados + unders)
  ('total_goles_ou', 'Más de 1.5',  null, 1.5, 'over',  30, 1),
  ('total_goles_ou', 'Más de 2.5',  null, 2.5, 'over',  40, 2),
  ('total_goles_ou', 'Más de 3.5',  null, 3.5, 'over',  55, 3),
  ('total_goles_ou', 'Más de 4.5',  null, 4.5, 'over',  75, 4),
  ('total_goles_ou', 'Menos de 2.5', null, 2.5, 'under', 45, 5),
  ('total_goles_ou', 'Menos de 1.5', null, 1.5, 'under', 70, 6),

  -- ambos anotan
  ('ambas_anotan', 'Sí', 'si', null, null, 40, 1),
  ('ambas_anotan', 'No', 'no', null, null, 40, 2),

  -- total de córners (overs graduados — el mecanismo ">5=50, >6=55" del brief)
  ('total_corners_ou', 'Más de 5',  null, 5,  'over',  50, 1),
  ('total_corners_ou', 'Más de 6',  null, 6,  'over',  55, 2),
  ('total_corners_ou', 'Más de 7',  null, 7,  'over',  60, 3),
  ('total_corners_ou', 'Más de 8',  null, 8,  'over',  70, 4),
  ('total_corners_ou', 'Más de 9',  null, 9,  'over',  85, 5),
  ('total_corners_ou', 'Más de 10', null, 10, 'over', 100, 6),
  ('total_corners_ou', 'Menos de 5', null, 5, 'under', 60, 7),

  -- total de amarillas (overs graduados + under)
  ('total_amarillas_ou', 'Más de 2', null, 2, 'over',  40, 1),
  ('total_amarillas_ou', 'Más de 3', null, 3, 'over',  50, 2),
  ('total_amarillas_ou', 'Más de 4', null, 4, 'over',  60, 3),
  ('total_amarillas_ou', 'Más de 5', null, 5, 'over',  75, 4),
  ('total_amarillas_ou', 'Más de 6', null, 6, 'over',  95, 5),
  ('total_amarillas_ou', 'Menos de 3', null, 3, 'under', 55, 6),

  -- habrá roja
  ('habra_roja', 'Sí', 'si', null, null, 70, 1),
  ('habra_roja', 'No', 'no', null, null, 30, 2),

  -- se va a alargue
  ('va_alargue', 'Sí', 'si', null, null, 60, 1),
  ('va_alargue', 'No', 'no', null, null, 30, 2),

  -- tiros al arco (overs graduados + under)
  ('tiros_arco_ou', 'Más de 5',  null, 5,  'over',  40, 1),
  ('tiros_arco_ou', 'Más de 7',  null, 7,  'over',  50, 2),
  ('tiros_arco_ou', 'Más de 9',  null, 9,  'over',  60, 3),
  ('tiros_arco_ou', 'Más de 11', null, 11, 'over',  80, 4),
  ('tiros_arco_ou', 'Menos de 5', null, 5, 'under', 55, 5),

  -- faltas (overs graduados + under)
  ('faltas_ou', 'Más de 15', null, 15, 'over',  40, 1),
  ('faltas_ou', 'Más de 20', null, 20, 'over',  50, 2),
  ('faltas_ou', 'Más de 25', null, 25, 'over',  65, 3),
  ('faltas_ou', 'Más de 30', null, 30, 'over',  85, 4),
  ('faltas_ou', 'Menos de 15', null, 15, 'under', 55, 5),

  -- offsides (overs graduados + under)
  ('offsides_ou', 'Más de 2',  null, 2,  'over',  40, 1),
  ('offsides_ou', 'Más de 3',  null, 3,  'over',  50, 2),
  ('offsides_ou', 'Más de 4',  null, 4,  'over',  60, 3),
  ('offsides_ou', 'Más de 5',  null, 5,  'over',  80, 4),
  ('offsides_ou', 'Menos de 2', null, 2, 'under', 55, 5),

  -- posesión (home/away/draw)
  ('posesion', 'Local',  'home', null, null, 45, 1),
  ('posesion', 'Visita',  'away', null, null, 45, 2),
  ('posesion', 'Empate (50-50)', 'draw', null, null, 80, 3)
on conflict (market_id, etiqueta) do nothing;

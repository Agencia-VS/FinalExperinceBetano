-- ============================================================
-- Seed de mercados del JUEGO — Final Mundial 2026  (v2)
-- Ejecutar DESPUÉS de schema.sql, en el SQL Editor de Supabase.
--
-- Idempotente: los mercados se upsertean; las opciones usan clave natural
-- (market_id, etiqueta) con `on conflict do nothing`, así re-correr el seed
-- NO pisa los puntos que el admin haya editado en /juego/admin/mercados.
-- ⚠️ Sobre una DB que ya corrió el seed v1, usar migracion-v2.sql (limpia
-- las opciones con etiquetas viejas); este archivo es para instalación fresca.
--
-- Convenciones v2:
--  · O/U con líneas .5 estilo casa de apuestas ("Más de 7.5") — sin ambigüedad
--    en el borde y con el lenguaje que la audiencia de Betano ya conoce.
--  · Balance: cada mercado O/U ofrece las MISMAS 3 líneas en ambas direcciones.
--  · `tiempo`: '90' = solo reglamentarios · '120' = incluye alargue ·
--    'ht' = 1er tiempo · null = no aplica (mercados de desenlace).
--
-- NOTA: 'Local'/'Visita' son placeholders — editar etiquetas con los nombres
-- reales de los finalistas cuando se conozcan (~13 jul). La resolución usa
-- 'home'/'away', no el nombre, así que cambiar la etiqueta no rompe el puntaje.
-- ============================================================

-- ------- Mercados (16) -------
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

-- ------- Opciones (etiqueta, valor, umbral, direccion, puntos, orden) -------
insert into public.juego_market_options
  (market_id, etiqueta, valor, umbral, direccion, puntos, orden) values
  -- campeón (binario)
  ('campeon', 'Local',  'home', null, null, 60, 1),
  ('campeon', 'Visita', 'away', null, null, 60, 2),

  -- resultado exacto al 90' (difícil → alto) + "Otro resultado" a lo ancho
  ('resultado_exacto', '1-0', '1-0', null, null,  70, 1),
  ('resultado_exacto', '2-0', '2-0', null, null,  85, 2),
  ('resultado_exacto', '2-1', '2-1', null, null,  80, 3),
  ('resultado_exacto', '0-0', '0-0', null, null,  75, 4),
  ('resultado_exacto', '1-1', '1-1', null, null,  70, 5),
  ('resultado_exacto', '0-1', '0-1', null, null,  70, 6),
  ('resultado_exacto', '0-2', '0-2', null, null,  85, 7),
  ('resultado_exacto', '1-2', '1-2', null, null,  80, 8),
  ('resultado_exacto', '2-2', '2-2', null, null,  80, 9),
  ('resultado_exacto', '3-0', '3-0', null, null,  95, 10),
  ('resultado_exacto', '0-3', '0-3', null, null,  95, 11),
  ('resultado_exacto', '3-1', '3-1', null, null, 100, 12),
  ('resultado_exacto', '1-3', '1-3', null, null, 100, 13),
  ('resultado_exacto', '3-2', '3-2', null, null,  95, 14),
  ('resultado_exacto', '2-3', '2-3', null, null,  95, 15),
  ('resultado_exacto', 'Otro resultado', 'otro', null, null, 60, 99),

  -- ganador al descanso (home/draw/away)
  ('ganador_ht', 'Gana Local',  'home', null, null, 40, 1),
  ('ganador_ht', 'Empate',      'draw', null, null, 35, 2),
  ('ganador_ht', 'Gana Visita', 'away', null, null, 40, 3),

  -- primer gol
  ('primer_gol', 'Local',  'home', null, null, 45, 1),
  ('primer_gol', 'Visita', 'away', null, null, 45, 2),

  -- total de goles (líneas 1.5 / 2.5 / 3.5, balanceado)
  ('total_goles_ou', 'Más de 1.5',   null, 1.5, 'over',  35, 1),
  ('total_goles_ou', 'Más de 2.5',   null, 2.5, 'over',  50, 2),
  ('total_goles_ou', 'Más de 3.5',   null, 3.5, 'over',  70, 3),
  ('total_goles_ou', 'Menos de 1.5', null, 1.5, 'under', 60, 4),
  ('total_goles_ou', 'Menos de 2.5', null, 2.5, 'under', 40, 5),
  ('total_goles_ou', 'Menos de 3.5', null, 3.5, 'under', 30, 6),

  -- ambos anotan
  ('ambas_anotan', 'Sí', 'si', null, null, 40, 1),
  ('ambas_anotan', 'No', 'no', null, null, 40, 2),

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

  -- habrá roja
  ('habra_roja', 'Sí', 'si', null, null, 70, 1),
  ('habra_roja', 'No', 'no', null, null, 30, 2),

  -- se va a alargue
  ('va_alargue', 'Sí', 'si', null, null, 60, 1),
  ('va_alargue', 'No', 'no', null, null, 30, 2),

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
  ('offsides_ou', 'Menos de 4.5', null, 4.5, 'under', 40, 6),

  -- posesión (home/away/draw)
  ('posesion', 'Local',  'home', null, null, 45, 1),
  ('posesion', 'Visita',  'away', null, null, 45, 2),
  ('posesion', 'Empate (50-50)', 'draw', null, null, 80, 3)
on conflict (market_id, etiqueta) do nothing;

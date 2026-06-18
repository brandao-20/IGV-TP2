const express = require('express');
const { query } = require('../db');
const router = express.Router();

const STUDY_DTMN = process.env.STUDY_DTMN || '1609';
const STUDY_FILTER = `${STUDY_DTMN}%`;
const SRID_DATA = 3763;

function asNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function requireGeoJsonGeometry(body) {
  if (!body) return null;
  if (body.type && body.coordinates) return body;
  if (body.geometry && body.geometry.type && body.geometry.coordinates) return body.geometry;
  if (body.feature && body.feature.geometry) return body.feature.geometry;
  return null;
}

function sendPgError(res, err, fallbackMessage) {
  console.error(fallbackMessage, err.message);
  return res.status(500).json({ error: fallbackMessage, details: err.message });
}

router.get('/health', async (_req, res) => {
  try {
    const db = await query(`
      SELECT
        current_database() AS database,
        postgis_full_version() AS postgis,
        now() AS timestamp
    `);
    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'cont_freguesias', 'cont_municipios', 'alojamento_local', 'bgri2021', 'dem_srtm',
          'geo_vc_municipio', 'geo_vc_freguesias', 'geo_vc_alojamento_local',
          'geo_vc_alojamentos_por_freguesia'
        )
      ORDER BY table_name
    `);
    res.json({ ok: true, database: db.rows[0], objects: tables.rows.map(r => r.table_name) });
  } catch (err) {
    sendPgError(res, err, 'Não foi possível ligar ao PostGIS. Confirma o .env e a base de dados.');
  }
});

router.get('/metadata', async (_req, res) => {
  try {
    const result = await query(`
      WITH counts AS (
        SELECT 'freguesias' AS name, COUNT(*)::int AS count FROM cont_freguesias WHERE dtmnfr LIKE $1
        UNION ALL
        SELECT 'bgri2021', COUNT(*)::int FROM bgri2021 WHERE dtmnfr21 LIKE $1
        UNION ALL
        SELECT 'alojamento_local', COUNT(*)::int FROM alojamento_local WHERE dtmnfr LIKE $1
        UNION ALL
        SELECT 'municipios', COUNT(*)::int FROM cont_municipios WHERE dtmn = $2
      )
      SELECT * FROM counts ORDER BY name
    `, [STUDY_FILTER, STUDY_DTMN]);
    res.json({ studyDtmn: STUDY_DTMN, counts: result.rows });
  } catch (err) {
    sendPgError(res, err, 'Erro ao obter metadados.');
  }
});

router.get('/summary', async (_req, res) => {
  try {
    const totals = await query(`
      WITH al AS (
        SELECT * FROM alojamento_local WHERE dtmnfr LIKE $1
      ), pop AS (
        SELECT COALESCE(SUM(n_individuos), 0)::int AS populacao
        FROM bgri2021 WHERE dtmnfr21 LIKE $1
      ), area AS (
        SELECT COALESCE(SUM(area_ha), 0) / 100.0 AS area_km2
        FROM cont_freguesias WHERE dtmnfr LIKE $1
      )
      SELECT
        (SELECT COUNT(*)::int FROM al) AS total_alojamentos,
        (SELECT COALESCE(SUM(nrutentes), 0)::int FROM al) AS capacidade_total,
        (SELECT COUNT(DISTINCT modalidade)::int FROM al WHERE modalidade IS NOT NULL) AS modalidades,
        (SELECT COUNT(*)::int FROM cont_freguesias WHERE dtmnfr LIKE $1) AS freguesias,
        (SELECT populacao FROM pop) AS populacao_total,
        ROUND((SELECT area_km2 FROM area)::numeric, 2)::float AS area_km2
    `, [STUDY_FILTER]);

    const modalidades = await query(`
      SELECT COALESCE(NULLIF(modalidade, ''), 'Sem modalidade') AS modalidade,
             COUNT(*)::int AS total
      FROM alojamento_local
      WHERE dtmnfr LIKE $1
      GROUP BY COALESCE(NULLIF(modalidade, ''), 'Sem modalidade')
      ORDER BY total DESC, modalidade ASC
    `, [STUDY_FILTER]);

    const topFreguesias = await query(`
      SELECT
        f.dtmnfr,
        f.freguesia,
        COUNT(al.objectid)::int AS total_alojamentos,
        ROUND((f.area_ha / 100.0)::numeric, 2)::float AS area_km2,
        ROUND((COUNT(al.objectid) / NULLIF((f.area_ha / 100.0), 0))::numeric, 2)::float AS alojamentos_km2
      FROM cont_freguesias f
      LEFT JOIN alojamento_local al
        ON al.dtmnfr LIKE $1
       AND ST_Intersects(al.geom, f.geom)
      WHERE f.dtmnfr LIKE $1
      GROUP BY f.dtmnfr, f.freguesia, f.area_ha
      ORDER BY total_alojamentos DESC, f.freguesia ASC
      LIMIT 10
    `, [STUDY_FILTER]);

    res.json({ totals: totals.rows[0], modalidades: modalidades.rows, topFreguesias: topFreguesias.rows });
  } catch (err) {
    sendPgError(res, err, 'Erro ao calcular resumo geral.');
  }
});

router.get('/freguesias', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [STUDY_FILTER];
    let where = 'f.dtmnfr LIKE $1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND unaccent_lower(f.freguesia) LIKE unaccent_lower($${params.length})`;
    }

    const result = await query(`
      SELECT
        f.dtmnfr,
        f.freguesia,
        f.municipio,
        ROUND((f.area_ha / 100.0)::numeric, 2)::float AS area_km2,
        COUNT(al.objectid)::int AS total_alojamentos
      FROM cont_freguesias f
      LEFT JOIN alojamento_local al
        ON al.dtmnfr LIKE $1
       AND ST_Intersects(al.geom, f.geom)
      WHERE ${where}
      GROUP BY f.dtmnfr, f.freguesia, f.municipio, f.area_ha
      ORDER BY f.freguesia ASC
    `, params);
    res.json(result.rows);
  } catch (err) {
    sendPgError(res, err, 'Erro ao obter lista de freguesias.');
  }
});

router.get('/freguesias/:dtmnfr/geojson', async (req, res) => {
  try {
    const { dtmnfr } = req.params;
    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object(
          'dtmnfr', dtmnfr,
          'freguesia', freguesia,
          'municipio', municipio,
          'area_km2', ROUND((area_ha / 100.0)::numeric, 2)
        ),
        'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb
      ) AS feature
      FROM cont_freguesias
      WHERE dtmnfr = $1 AND dtmnfr LIKE $2
      LIMIT 1
    `, [dtmnfr, STUDY_FILTER]);
    if (!result.rowCount) return res.status(404).json({ error: 'Freguesia não encontrada.' });
    res.json(result.rows[0].feature);
  } catch (err) {
    sendPgError(res, err, 'Erro ao obter geometria da freguesia.');
  }
});

router.get('/freguesias/:dtmnfr/estatisticas', async (req, res) => {
  const { dtmnfr } = req.params;
  try {
    const base = await query(`
      WITH f AS (
        SELECT * FROM cont_freguesias WHERE dtmnfr = $1 AND dtmnfr LIKE $2 LIMIT 1
      ), al AS (
        SELECT a.*
        FROM alojamento_local a, f
        WHERE a.dtmnfr LIKE $2 AND ST_Intersects(a.geom, f.geom)
      ), pop AS (
        SELECT
          COALESCE(SUM(b.n_individuos), 0)::int AS populacao,
          COALESCE(SUM(b.n_alojamentos_total), 0)::int AS alojamentos_censos,
          COALESCE(SUM(b.n_edificios_classicos), 0)::int AS edificios,
          COALESCE(SUM(b.n_individuos_0_14), 0)::int AS ind_0_14,
          COALESCE(SUM(b.n_individuos_15_24), 0)::int AS ind_15_24,
          COALESCE(SUM(b.n_individuos_25_64), 0)::int AS ind_25_64,
          COALESCE(SUM(b.n_individuos_65_ou_mais), 0)::int AS ind_65_plus
        FROM bgri2021 b, f
        WHERE b.dtmnfr21 LIKE $2
          AND ST_Contains(f.geom, ST_PointOnSurface(b.geom))
      ), vizinhas AS (
        SELECT COUNT(v.*)::int AS total
        FROM cont_freguesias v, f
        WHERE v.dtmnfr LIKE $2 AND v.dtmnfr <> f.dtmnfr AND ST_Touches(v.geom, f.geom)
      )
      SELECT
        f.dtmnfr,
        f.freguesia,
        f.municipio,
        f.distrito_ilha,
        ROUND((f.area_ha / 100.0)::numeric, 2)::float AS area_km2,
        COUNT(al.objectid)::int AS total_alojamentos,
        COALESCE(SUM(al.nrutentes), 0)::int AS capacidade_total,
        ROUND((COUNT(al.objectid) / NULLIF((f.area_ha / 100.0), 0))::numeric, 2)::float AS alojamentos_km2,
        ROUND((COUNT(al.objectid) * 1000.0 / NULLIF((SELECT populacao FROM pop), 0))::numeric, 2)::float AS alojamentos_1000_hab,
        (SELECT populacao FROM pop) AS populacao,
        (SELECT alojamentos_censos FROM pop) AS alojamentos_censos,
        (SELECT edificios FROM pop) AS edificios,
        (SELECT ind_0_14 FROM pop) AS ind_0_14,
        (SELECT ind_15_24 FROM pop) AS ind_15_24,
        (SELECT ind_25_64 FROM pop) AS ind_25_64,
        (SELECT ind_65_plus FROM pop) AS ind_65_plus,
        (SELECT total FROM vizinhas) AS freguesias_vizinhas,
        ST_AsGeoJSON(ST_Transform(ST_Centroid(f.geom), 4326))::jsonb AS centroid
      FROM f
      LEFT JOIN al ON true
      GROUP BY f.dtmnfr, f.freguesia, f.municipio, f.distrito_ilha, f.area_ha, f.geom
    `, [dtmnfr, STUDY_FILTER]);

    if (!base.rowCount) return res.status(404).json({ error: 'Freguesia não encontrada.' });

    const modalidades = await query(`
      WITH f AS (SELECT geom FROM cont_freguesias WHERE dtmnfr = $1 AND dtmnfr LIKE $2 LIMIT 1)
      SELECT COALESCE(NULLIF(a.modalidade, ''), 'Sem modalidade') AS modalidade,
             COUNT(*)::int AS total,
             COALESCE(SUM(a.nrutentes), 0)::int AS capacidade
      FROM alojamento_local a, f
      WHERE a.dtmnfr LIKE $2 AND ST_Intersects(a.geom, f.geom)
      GROUP BY COALESCE(NULLIF(a.modalidade, ''), 'Sem modalidade')
      ORDER BY total DESC, modalidade ASC
    `, [dtmnfr, STUDY_FILTER]);

    let altitude = null;
    try {
      const alt = await query(`
        WITH f AS (SELECT geom FROM cont_freguesias WHERE dtmnfr = $1 AND dtmnfr LIKE $2 LIMIT 1),
        stats AS (
          SELECT (ST_SummaryStatsAgg(ST_Clip(r.rast, f.geom, true), 1, true)).*
          FROM dem_srtm r, f
          WHERE ST_Intersects(r.rast, f.geom)
        )
        SELECT
          ROUND(MIN(min)::numeric, 2)::float AS min_m,
          ROUND(MAX(max)::numeric, 2)::float AS max_m,
          ROUND(AVG(mean)::numeric, 2)::float AS media_m
        FROM stats
      `, [dtmnfr, STUDY_FILTER]);
      altitude = alt.rows[0] || null;
    } catch (err) {
      altitude = { disponivel: false, motivo: 'Tabela raster dem_srtm não encontrada ou raster não importado no PostGIS.' };
    }

    res.json({ ...base.rows[0], modalidades: modalidades.rows, altitude });
  } catch (err) {
    sendPgError(res, err, 'Erro ao calcular estatísticas da freguesia.');
  }
});

router.get('/ranking/freguesias', async (req, res) => {
  try {
    const limit = Math.min(Math.max(asNumber(req.query.limit, 10), 1), 50);
    const result = await query(`
      SELECT * FROM geo_vc_alojamentos_por_freguesia
      ORDER BY total_alojamentos DESC, freguesia ASC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    sendPgError(res, err, 'Erro ao obter ranking de freguesias.');
  }
});

router.get('/identify', async (req, res) => {
  const lat = asNumber(req.query.lat);
  const lng = asNumber(req.query.lng);
  if (lat === null || lng === null) {
    return res.status(400).json({ error: 'Parâmetros lat e lng são obrigatórios.' });
  }

  try {
    const freguesia = await query(`
      WITH p AS (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${SRID_DATA}) AS geom
      )
      SELECT f.dtmnfr, f.freguesia, f.municipio, ROUND((f.area_ha / 100.0)::numeric, 2)::float AS area_km2
      FROM cont_freguesias f, p
      WHERE f.dtmnfr LIKE $3 AND ST_Contains(f.geom, p.geom)
      LIMIT 1
    `, [lng, lat, STUDY_FILTER]);

    const alojamento = await query(`
      WITH p AS (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${SRID_DATA}) AS geom
      )
      SELECT
        a.objectid,
        a.nrrnal,
        a.denominaca,
        a.modalidade,
        a.nrutentes,
        a.endereco,
        a.freguesia,
        a.concelho,
        ROUND(ST_Distance(a.geom, p.geom)::numeric, 1)::float AS distancia_m,
        ST_AsGeoJSON(ST_Transform(a.geom, 4326))::jsonb AS geometry
      FROM alojamento_local a, p
      WHERE a.dtmnfr LIKE $3 AND ST_DWithin(a.geom, p.geom, 250)
      ORDER BY a.geom <-> p.geom
      LIMIT 1
    `, [lng, lat, STUDY_FILTER]);

    res.json({ freguesia: freguesia.rows[0] || null, alojamento: alojamento.rows[0] || null });
  } catch (err) {
    sendPgError(res, err, 'Erro ao identificar elementos no mapa.');
  }
});


router.get('/alojamentos/geojson', async (_req, res) => {
  try {
    const result = await query(`
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object(
            'objectid', objectid,
            'nrrnal', nrrnal,
            'denominaca', denominaca,
            'modalidade', modalidade,
            'nrutentes', nrutentes,
            'endereco', endereco,
            'freguesia', freguesia,
            'concelho', concelho,
            'dtmnfr', dtmnfr
          ),
          'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb
        ) ORDER BY denominaca), '[]'::jsonb)
      ) AS geojson,
      COUNT(*)::int AS total
      FROM alojamento_local
      WHERE dtmnfr LIKE $1
    `, [STUDY_FILTER]);
    res.json(result.rows[0]);
  } catch (err) {
    sendPgError(res, err, 'Erro ao obter alojamentos locais interativos.');
  }
});

router.get('/alojamentos/near', async (req, res) => {
  const lat = asNumber(req.query.lat);
  const lng = asNumber(req.query.lng);
  const radius = Math.min(Math.max(asNumber(req.query.radius, 500), 50), 10000);
  if (lat === null || lng === null) {
    return res.status(400).json({ error: 'Parâmetros lat e lng são obrigatórios.' });
  }

  try {
    const result = await query(`
      WITH p AS (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${SRID_DATA}) AS geom
      ), al AS (
        SELECT a.*, ST_Distance(a.geom, p.geom) AS distancia_m
        FROM alojamento_local a, p
        WHERE a.dtmnfr LIKE $4 AND ST_DWithin(a.geom, p.geom, $3)
        ORDER BY a.geom <-> p.geom
        LIMIT 500
      )
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object(
            'objectid', objectid,
            'nrrnal', nrrnal,
            'denominaca', denominaca,
            'modalidade', modalidade,
            'nrutentes', nrutentes,
            'freguesia', freguesia,
            'concelho', concelho,
            'distancia_m', ROUND(distancia_m::numeric, 1)
          ),
          'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb
        )), '[]'::jsonb)
      ) AS geojson,
      COUNT(*)::int AS total,
      COALESCE(SUM(nrutentes), 0)::int AS capacidade_total
      FROM al
    `, [lng, lat, radius, STUDY_FILTER]);
    const modalidades = await query(`
      WITH p AS (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${SRID_DATA}) AS geom
      )
      SELECT COALESCE(NULLIF(a.modalidade, ''), 'Sem modalidade') AS modalidade,
             COUNT(*)::int AS total,
             COALESCE(SUM(a.nrutentes), 0)::int AS capacidade
      FROM alojamento_local a, p
      WHERE a.dtmnfr LIKE $4 AND ST_DWithin(a.geom, p.geom, $3)
      GROUP BY COALESCE(NULLIF(a.modalidade, ''), 'Sem modalidade')
      ORDER BY total DESC, modalidade ASC
    `, [lng, lat, radius, STUDY_FILTER]);

    res.json({
      radius,
      total: result.rows[0].total,
      capacidade_total: result.rows[0].capacidade_total,
      geojson: result.rows[0].geojson,
      modalidades: modalidades.rows
    });
  } catch (err) {
    sendPgError(res, err, 'Erro ao calcular alojamentos por proximidade.');
  }
});

router.post('/analise/area', async (req, res) => {
  const geom = requireGeoJsonGeometry(req.body);
  if (!geom) return res.status(400).json({ error: 'Enviar uma geometria GeoJSON válida no body.' });

  try {
    const geomJson = JSON.stringify(geom);

    const stats = await query(`
      WITH raw_area AS (
        SELECT ST_CollectionExtract(
          ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), ${SRID_DATA})),
          3
        ) AS geom
      ), study AS (
        SELECT ST_Union(geom) AS geom
        FROM cont_municipios
        WHERE dtmn = $2
      ), area AS (
        SELECT
          raw_area.geom AS geom_desenhada,
          ST_CollectionExtract(ST_MakeValid(ST_Intersection(raw_area.geom, study.geom)), 3) AS geom_analisada
        FROM raw_area, study
      ), medidas AS (
        SELECT
          ST_Area(geom_desenhada) AS area_desenhada_m2,
          COALESCE(ST_Area(geom_analisada), 0) AS area_analisada_m2,
          GREATEST(ST_Area(geom_desenhada) - COALESCE(ST_Area(geom_analisada), 0), 0) AS area_fora_m2
        FROM area
      ), al AS (
        SELECT a.*
        FROM alojamento_local a, area
        WHERE a.dtmnfr LIKE $3
          AND NOT ST_IsEmpty(area.geom_analisada)
          AND ST_Intersects(a.geom, area.geom_analisada)
      ), freg AS (
        SELECT
          f.*,
          ST_Area(ST_CollectionExtract(ST_MakeValid(ST_Intersection(f.geom, area.geom_analisada)), 3)) AS area_intersecao_m2
        FROM cont_freguesias f, area
        WHERE f.dtmnfr LIKE $3
          AND NOT ST_IsEmpty(area.geom_analisada)
          AND ST_Intersects(f.geom, area.geom_analisada)
      ), bgri_pesada AS (
        SELECT
          LEAST(1, GREATEST(0, ST_Area(ST_Intersection(b.geom, area.geom_analisada)) / NULLIF(ST_Area(b.geom), 0))) AS peso,
          b.n_individuos,
          b.n_alojamentos_total,
          b.n_edificios_classicos,
          b.n_individuos_0_14,
          b.n_individuos_15_24,
          b.n_individuos_25_64,
          b.n_individuos_65_ou_mais
        FROM bgri2021 b, area
        WHERE b.dtmnfr21 LIKE $3
          AND NOT ST_IsEmpty(area.geom_analisada)
          AND ST_Intersects(b.geom, area.geom_analisada)
      ), pop AS (
        SELECT
          COALESCE(ROUND(SUM(n_individuos * peso)), 0)::int AS populacao_total,
          COALESCE(ROUND(SUM(n_alojamentos_total * peso)), 0)::int AS alojamentos_censos,
          COALESCE(ROUND(SUM(n_edificios_classicos * peso)), 0)::int AS edificios,
          COALESCE(ROUND(SUM(n_individuos_0_14 * peso)), 0)::int AS ind_0_14,
          COALESCE(ROUND(SUM(n_individuos_15_24 * peso)), 0)::int AS ind_15_24,
          COALESCE(ROUND(SUM(n_individuos_25_64 * peso)), 0)::int AS ind_25_64,
          COALESCE(ROUND(SUM(n_individuos_65_ou_mais * peso)), 0)::int AS ind_65_plus
        FROM bgri_pesada
      )
      SELECT
        ROUND((SELECT area_desenhada_m2 FROM medidas)::numeric / 1000000.0, 4)::float AS area_desenhada_km2,
        ROUND((SELECT area_analisada_m2 FROM medidas)::numeric / 1000000.0, 4)::float AS area_analisada_km2,
        ROUND((SELECT area_fora_m2 FROM medidas)::numeric / 1000000.0, 4)::float AS area_fora_municipio_km2,
        ROUND((SELECT area_analisada_m2 FROM medidas)::numeric, 1)::float AS area_analisada_m2,
        ROUND((SELECT area_analisada_m2 / NULLIF(area_desenhada_m2, 0) * 100.0 FROM medidas)::numeric, 2)::float AS percentagem_area_valida,
        (SELECT COUNT(*)::int FROM al) AS total_alojamentos,
        (SELECT COALESCE(SUM(nrutentes), 0)::int FROM al) AS capacidade_total,
        (SELECT COUNT(*)::int FROM freg WHERE area_intersecao_m2 > 0) AS freguesias_intersetadas,
        (SELECT populacao_total FROM pop) AS populacao_total,
        (SELECT alojamentos_censos FROM pop) AS alojamentos_censos,
        (SELECT edificios FROM pop) AS edificios,
        (SELECT ind_0_14 FROM pop) AS ind_0_14,
        (SELECT ind_15_24 FROM pop) AS ind_15_24,
        (SELECT ind_25_64 FROM pop) AS ind_25_64,
        (SELECT ind_65_plus FROM pop) AS ind_65_plus,
        ROUND(((SELECT COUNT(*) FROM al) / NULLIF((SELECT area_analisada_m2 FROM medidas) / 1000000.0, 0))::numeric, 2)::float AS alojamentos_km2,
        ROUND(((SELECT COUNT(*) FROM al) * 1000.0 / NULLIF((SELECT populacao_total FROM pop), 0))::numeric, 2)::float AS alojamentos_1000_hab,
        jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object(
            'tipo', 'area_analisada',
            'area_km2', ROUND((SELECT area_analisada_m2 FROM medidas)::numeric / 1000000.0, 4)
          ),
          'geometry', ST_AsGeoJSON(ST_Transform((SELECT geom_analisada FROM area), 4326))::jsonb
        ) AS area_analisada_geojson
    `, [geomJson, STUDY_DTMN, STUDY_FILTER]);

    const modalidades = await query(`
      WITH raw_area AS (
        SELECT ST_CollectionExtract(
          ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), ${SRID_DATA})),
          3
        ) AS geom
      ), study AS (
        SELECT ST_Union(geom) AS geom FROM cont_municipios WHERE dtmn = $2
      ), area AS (
        SELECT ST_CollectionExtract(ST_MakeValid(ST_Intersection(raw_area.geom, study.geom)), 3) AS geom
        FROM raw_area, study
      )
      SELECT COALESCE(NULLIF(a.modalidade, ''), 'Sem modalidade') AS modalidade,
             COUNT(*)::int AS total,
             COALESCE(SUM(a.nrutentes), 0)::int AS capacidade
      FROM alojamento_local a, area
      WHERE a.dtmnfr LIKE $3
        AND NOT ST_IsEmpty(area.geom)
        AND ST_Intersects(a.geom, area.geom)
      GROUP BY COALESCE(NULLIF(a.modalidade, ''), 'Sem modalidade')
      ORDER BY total DESC, modalidade ASC
    `, [geomJson, STUDY_DTMN, STUDY_FILTER]);

    const freguesias = await query(`
      WITH raw_area AS (
        SELECT ST_CollectionExtract(
          ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), ${SRID_DATA})),
          3
        ) AS geom
      ), study AS (
        SELECT ST_Union(geom) AS geom FROM cont_municipios WHERE dtmn = $2
      ), area AS (
        SELECT ST_CollectionExtract(ST_MakeValid(ST_Intersection(raw_area.geom, study.geom)), 3) AS geom
        FROM raw_area, study
      ), medidas AS (
        SELECT ST_Area(geom) AS area_analisada_m2 FROM area
      ), inter AS (
        SELECT
          f.dtmnfr,
          f.freguesia,
          f.municipio,
          f.area_ha,
          ST_Area(ST_CollectionExtract(ST_MakeValid(ST_Intersection(f.geom, area.geom)), 3)) AS area_intersetada_m2
        FROM cont_freguesias f, area
        WHERE f.dtmnfr LIKE $3
          AND NOT ST_IsEmpty(area.geom)
          AND ST_Intersects(f.geom, area.geom)
      )
      SELECT
        dtmnfr,
        freguesia,
        municipio,
        ROUND((area_intersetada_m2 / 1000000.0)::numeric, 4)::float AS area_intersetada_km2,
        ROUND((area_intersetada_m2 / NULLIF((SELECT area_analisada_m2 FROM medidas), 0) * 100.0)::numeric, 2)::float AS percentagem_area_analisada,
        ROUND((area_intersetada_m2 / NULLIF((area_ha * 10000.0), 0) * 100.0)::numeric, 2)::float AS percentagem_freguesia
      FROM inter
      WHERE area_intersetada_m2 > 0
      ORDER BY area_intersetada_m2 DESC, freguesia ASC
    `, [geomJson, STUDY_DTMN, STUDY_FILTER]);

    let altitude = null;
    try {
      const alt = await query(`
        WITH raw_area AS (
          SELECT ST_CollectionExtract(
            ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), ${SRID_DATA})),
            3
          ) AS geom
        ), study AS (
          SELECT ST_Union(geom) AS geom FROM cont_municipios WHERE dtmn = $2
        ), area AS (
          SELECT ST_CollectionExtract(ST_MakeValid(ST_Intersection(raw_area.geom, study.geom)), 3) AS geom
          FROM raw_area, study
        ), stats AS (
          SELECT (ST_SummaryStatsAgg(ST_Clip(r.rast, area.geom, true), 1, true)).*
          FROM dem_srtm r, area
          WHERE NOT ST_IsEmpty(area.geom)
            AND ST_Intersects(r.rast, area.geom)
        )
        SELECT
          ROUND(MIN(min)::numeric, 2)::float AS min_m,
          ROUND(MAX(max)::numeric, 2)::float AS max_m,
          ROUND(AVG(mean)::numeric, 2)::float AS media_m
        FROM stats
      `, [geomJson, STUDY_DTMN]);
      altitude = alt.rows[0] || null;
    } catch (err) {
      altitude = { disponivel: false, motivo: 'Tabela raster dem_srtm não encontrada ou raster não importado no PostGIS.' };
    }

    const row = stats.rows[0] || {};
    res.json({
      ...row,
      area_km2: row.area_analisada_km2,
      modalidades: modalidades.rows,
      freguesias: freguesias.rows,
      altitude,
      metodologia: {
        area: 'A análise usa a interseção entre a área desenhada e o município em estudo.',
        bgri: 'A população e os alojamentos censitários são estimados por ponderação proporcional da área intersetada de cada subsecção BGRI.',
        densidade: 'AL/km² usa a área efetivamente analisada dentro do município.'
      }
    });
  } catch (err) {
    sendPgError(res, err, 'Erro ao executar análise espacial da área delimitada.');
  }
});

router.post('/analise/buffer', async (req, res) => {
  const lat = asNumber(req.body.lat);
  const lng = asNumber(req.body.lng);
  const radius = Math.min(Math.max(asNumber(req.body.radius, 500), 50), 10000);
  if (lat === null || lng === null) return res.status(400).json({ error: 'lat e lng são obrigatórios.' });

  try {
    const result = await query(`
      WITH p AS (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${SRID_DATA}) AS geom
      ), buffer AS (
        SELECT ST_Buffer(geom, $3) AS geom FROM p
      ), al AS (
        SELECT a.* FROM alojamento_local a, buffer b
        WHERE a.dtmnfr LIKE $4 AND ST_Intersects(a.geom, b.geom)
      )
      SELECT
        jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object('raio_m', $3),
          'geometry', ST_AsGeoJSON(ST_Transform((SELECT geom FROM buffer), 4326))::jsonb
        ) AS buffer_geojson,
        COUNT(al.*)::int AS total_alojamentos,
        COALESCE(SUM(al.nrutentes), 0)::int AS capacidade_total
      FROM al
    `, [lng, lat, radius, STUDY_FILTER]);
    res.json(result.rows[0]);
  } catch (err) {
    sendPgError(res, err, 'Erro ao criar buffer.');
  }
});

module.exports = router;

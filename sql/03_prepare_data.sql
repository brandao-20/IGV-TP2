-- Preparação final da base de dados para o TP2 — Opção 2.
-- Deve ser executado depois da importação dos dados brutos.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION unaccent_lower(text)
RETURNS text AS $$
  SELECT lower(unaccent('public.unaccent', COALESCE($1, '')));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Garantir SRID e geometrias válidas.
UPDATE cont_municipios
SET geom = ST_Multi(ST_MakeValid(geom))::geometry(MultiPolygon, 3763)
WHERE geom IS NOT NULL AND (ST_SRID(geom) <> 3763 OR NOT ST_IsValid(geom) OR GeometryType(geom) <> 'MULTIPOLYGON');

UPDATE cont_freguesias
SET geom = ST_Multi(ST_MakeValid(geom))::geometry(MultiPolygon, 3763)
WHERE geom IS NOT NULL AND (ST_SRID(geom) <> 3763 OR NOT ST_IsValid(geom) OR GeometryType(geom) <> 'MULTIPOLYGON');

UPDATE bgri2021
SET geom = ST_Multi(ST_MakeValid(geom))::geometry(MultiPolygon, 3763)
WHERE geom IS NOT NULL AND (ST_SRID(geom) <> 3763 OR NOT ST_IsValid(geom) OR GeometryType(geom) <> 'MULTIPOLYGON');

UPDATE alojamento_local
SET geom = ST_SetSRID(geom, 3763)::geometry(Point, 3763)
WHERE geom IS NOT NULL AND ST_SRID(geom) <> 3763;

-- Índices principais.
CREATE INDEX IF NOT EXISTS idx_cont_municipios_geom ON cont_municipios USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_cont_freguesias_geom ON cont_freguesias USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_bgri2021_geom ON bgri2021 USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_alojamento_local_geom ON alojamento_local USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_cont_municipios_dtmn ON cont_municipios (dtmn);
CREATE INDEX IF NOT EXISTS idx_cont_freguesias_dtmnfr ON cont_freguesias (dtmnfr);
CREATE INDEX IF NOT EXISTS idx_bgri2021_dtmnfr21 ON bgri2021 (dtmnfr21);
CREATE INDEX IF NOT EXISTS idx_alojamento_local_dtmnfr ON alojamento_local (dtmnfr);
CREATE INDEX IF NOT EXISTS idx_alojamento_local_modalidade ON alojamento_local (modalidade);

-- Tabelas derivadas publicáveis no GeoServer, já focadas no município 1609.
DROP TABLE IF EXISTS geo_vc_alojamentos_por_freguesia;
DROP TABLE IF EXISTS geo_vc_alojamento_local;
DROP TABLE IF EXISTS geo_vc_freguesias;
DROP TABLE IF EXISTS geo_vc_municipio;

CREATE TABLE geo_vc_municipio AS
SELECT
  dtmn AS id,
  dtmn,
  municipio,
  distrito_ilha,
  nuts3,
  nuts2,
  area_ha,
  perimetro_km,
  geom::geometry(MultiPolygon, 3763) AS geom
FROM cont_municipios
WHERE dtmn = '1609';

ALTER TABLE geo_vc_municipio ADD CONSTRAINT geo_vc_municipio_pk PRIMARY KEY (id);
CREATE INDEX geo_vc_municipio_geom_idx ON geo_vc_municipio USING GIST (geom);

CREATE TABLE geo_vc_freguesias AS
SELECT
  dtmnfr AS id,
  dtmnfr,
  freguesia,
  municipio,
  distrito_ilha,
  nuts3,
  nuts2,
  area_ha,
  perimetro_km,
  designacao_simplificada,
  geom::geometry(MultiPolygon, 3763) AS geom
FROM cont_freguesias
WHERE dtmnfr LIKE '1609%';

ALTER TABLE geo_vc_freguesias ADD CONSTRAINT geo_vc_freguesias_pk PRIMARY KEY (id);
CREATE INDEX geo_vc_freguesias_geom_idx ON geo_vc_freguesias USING GIST (geom);

CREATE TABLE geo_vc_alojamento_local AS
SELECT
  objectid AS id,
  objectid,
  nrrnal,
  denominaca,
  dataregist,
  dataabertu,
  modalidade,
  nrutentes,
  endereco,
  codigopost,
  localidade,
  fiabilidad,
  dtmnfr,
  freguesia,
  concelho,
  distrito,
  nutsiii,
  nutsii,
  ert,
  selocleans,
  geom::geometry(Point, 3763) AS geom
FROM alojamento_local
WHERE dtmnfr LIKE '1609%';

ALTER TABLE geo_vc_alojamento_local ADD CONSTRAINT geo_vc_alojamento_local_pk PRIMARY KEY (id);
CREATE INDEX geo_vc_alojamento_local_geom_idx ON geo_vc_alojamento_local USING GIST (geom);
CREATE INDEX geo_vc_alojamento_local_dtmnfr_idx ON geo_vc_alojamento_local (dtmnfr);

CREATE TABLE geo_vc_alojamentos_por_freguesia AS
WITH freg AS (
  SELECT dtmnfr, freguesia, municipio, area_ha, geom
  FROM cont_freguesias
  WHERE dtmnfr LIKE '1609%'
), al_stats AS (
  SELECT
    f.dtmnfr,
    COUNT(al.objectid)::integer AS total_alojamentos,
    COALESCE(SUM(al.nrutentes), 0)::integer AS capacidade_total
  FROM freg f
  LEFT JOIN alojamento_local al
    ON al.dtmnfr LIKE '1609%'
   AND ST_Intersects(al.geom, f.geom)
  GROUP BY f.dtmnfr
), pop_stats AS (
  SELECT
    f.dtmnfr,
    COALESCE(SUM(b.n_individuos), 0)::integer AS populacao
  FROM freg f
  LEFT JOIN bgri2021 b
    ON b.dtmnfr21 LIKE '1609%'
   AND ST_Contains(f.geom, ST_PointOnSurface(b.geom))
  GROUP BY f.dtmnfr
)
SELECT
  f.dtmnfr AS id,
  f.dtmnfr,
  f.freguesia,
  f.municipio,
  f.area_ha,
  COALESCE(a.total_alojamentos, 0)::integer AS total_alojamentos,
  COALESCE(a.capacidade_total, 0)::integer AS capacidade_total,
  ROUND((COALESCE(a.total_alojamentos, 0) / NULLIF((f.area_ha / 100.0), 0))::numeric, 2)::double precision AS alojamentos_km2,
  COALESCE(p.populacao, 0)::integer AS populacao,
  ROUND((COALESCE(a.total_alojamentos, 0) * 1000.0 / NULLIF(COALESCE(p.populacao, 0), 0))::numeric, 2)::double precision AS alojamentos_1000_hab,
  f.geom::geometry(MultiPolygon, 3763) AS geom
FROM freg f
LEFT JOIN al_stats a ON a.dtmnfr = f.dtmnfr
LEFT JOIN pop_stats p ON p.dtmnfr = f.dtmnfr;

ALTER TABLE geo_vc_alojamentos_por_freguesia ADD CONSTRAINT geo_vc_alojamentos_por_freguesia_pk PRIMARY KEY (id);
CREATE INDEX geo_vc_alojamentos_por_freguesia_geom_idx ON geo_vc_alojamentos_por_freguesia USING GIST (geom);
CREATE INDEX geo_vc_alojamentos_por_freguesia_total_idx ON geo_vc_alojamentos_por_freguesia (total_alojamentos);

-- Views complementares para consulta, se for necessário defender no código/SQL.
CREATE OR REPLACE VIEW vw_top_modalidades_vc AS
SELECT modalidade, COUNT(*)::integer AS total, COALESCE(SUM(nrutentes), 0)::integer AS capacidade_total
FROM alojamento_local
WHERE dtmnfr LIKE '1609%'
GROUP BY modalidade
ORDER BY total DESC;

CREATE OR REPLACE VIEW vw_top_freguesias_vc AS
SELECT dtmnfr, freguesia, total_alojamentos, capacidade_total, alojamentos_km2, populacao, alojamentos_1000_hab
FROM geo_vc_alojamentos_por_freguesia
ORDER BY total_alojamentos DESC;

COMMENT ON TABLE geo_vc_municipio IS 'Município de Viana do Castelo, preparado para publicação no GeoServer.';
COMMENT ON TABLE geo_vc_freguesias IS 'Freguesias de Viana do Castelo, preparadas para publicação no GeoServer.';
COMMENT ON TABLE geo_vc_alojamento_local IS 'Alojamentos locais filtrados ao município 1609, preparados para publicação no GeoServer.';
COMMENT ON TABLE geo_vc_alojamentos_por_freguesia IS 'Freguesias com indicadores de Alojamento Local e população BGRI.';

ANALYZE cont_municipios;
ANALYZE cont_freguesias;
ANALYZE bgri2021;
ANALYZE alojamento_local;
ANALYZE geo_vc_municipio;
ANALYZE geo_vc_freguesias;
ANALYZE geo_vc_alojamento_local;
ANALYZE geo_vc_alojamentos_por_freguesia;

-- Consultas rápidas para validar a instalação.

SELECT COUNT(*) AS municipios FROM cont_municipios;
SELECT COUNT(*) AS freguesias_vc FROM cont_freguesias WHERE dtmnfr LIKE '1609%';
SELECT COUNT(*) AS bgri_vc FROM bgri2021 WHERE dtmnfr21 LIKE '1609%';
SELECT COUNT(*) AS alojamentos_vc FROM alojamento_local WHERE dtmnfr LIKE '1609%';

SELECT * FROM geo_vc_alojamentos_por_freguesia ORDER BY total_alojamentos DESC LIMIT 10;

-- Teste de interseção espacial.
SELECT f.freguesia, COUNT(a.*) AS total_al
FROM cont_freguesias f
LEFT JOIN alojamento_local a ON a.dtmnfr LIKE '1609%' AND ST_Intersects(a.geom, f.geom)
WHERE f.dtmnfr LIKE '1609%'
GROUP BY f.freguesia
ORDER BY total_al DESC;

-- Teste opcional do raster DEM, se importado.
SELECT rid, ST_Width(rast) AS largura_tile, ST_Height(rast) AS altura_tile, ST_SRID(rast) AS srid
FROM dem_srtm
LIMIT 5;

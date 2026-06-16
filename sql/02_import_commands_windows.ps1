# Executar a partir da raiz do projeto, no PowerShell.
# Este script recria a base igv_tp2 e importa os dados fornecidos pelo docente.
# Requisitos: Docker Desktop ativo e ficheiros já extraídos na pasta ./data.

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dataDir = Join-Path $projectRoot "data"
$dataMount = ($dataDir -replace "\\", "/")

$network = "igv_2526_postgres_network"
$gdalImage = "ghcr.io/osgeo/gdal:ubuntu-small-latest"
$pg = "PG:host=dbgis_igv port=5432 dbname=igv_tp2 user=postgres password=postgres"

function Require-File($path) {
  if (!(Test-Path $path)) {
    throw "Ficheiro obrigatório não encontrado: $path"
  }
}

function Run-Gdal($argsLine) {
  docker run --rm --network $network -v "${dataMount}:/data" $gdalImage bash -lc $argsLine
}

Write-Host "\n== Verificação dos ficheiros ==" -ForegroundColor Cyan
Require-File (Join-Path $dataDir "Continente_CAOP2025_parcial.gpkg")
Require-File (Join-Path $dataDir "BGRI2021_1609/BGRI2021_1609.gpkg")
Require-File (Join-Path $dataDir "Estabelecimentos_de_Alojamento_Local/Estabelecimentos_de_Alojamento_Local.shp")
Require-File (Join-Path $dataDir "dem_srtm_pt_25m.tif")
Write-Host "✓ Ficheiros encontrados."

Write-Host "\n== A aguardar PostGIS ==" -ForegroundColor Cyan
for ($i = 1; $i -le 40; $i++) {
  docker exec postgis_igv pg_isready -U postgres | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}
if ($LASTEXITCODE -ne 0) { throw "PostGIS não ficou pronto. Confirma docker compose up -d." }
Write-Host "✓ PostGIS pronto."

Write-Host "\n== Garantir password do utilizador postgres ==" -ForegroundColor Cyan
docker exec -i postgis_igv psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"

Write-Host "\n== Recriar base igv_tp2 ==" -ForegroundColor Cyan
docker exec -i postgis_igv psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS igv_tp2 WITH (FORCE);"
docker exec -i postgis_igv psql -U postgres -d postgres -c "CREATE DATABASE igv_tp2;"
docker exec -i postgis_igv psql -U postgres -d igv_tp2 -f /home/sql_files/01_extensions.sql

Write-Host "\n== Preparar imagem GDAL ==" -ForegroundColor Cyan
docker pull $gdalImage

Write-Host "\n== Importar CAOP: municípios ==" -ForegroundColor Cyan
Run-Gdal "ogr2ogr -f PostgreSQL '$pg' /data/Continente_CAOP2025_parcial.gpkg cont_municipios -nln cont_municipios -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt MULTIPOLYGON -t_srs EPSG:3763 -overwrite"

Write-Host "\n== Importar CAOP: freguesias ==" -ForegroundColor Cyan
Run-Gdal "ogr2ogr -f PostgreSQL '$pg' /data/Continente_CAOP2025_parcial.gpkg cont_freguesias -nln cont_freguesias -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt MULTIPOLYGON -t_srs EPSG:3763 -overwrite"

Write-Host "\n== Importar BGRI 2021 ==" -ForegroundColor Cyan
Run-Gdal "ogr2ogr -f PostgreSQL '$pg' /data/BGRI2021_1609/BGRI2021_1609.gpkg BGRI2021_1609 -nln bgri2021 -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt MULTIPOLYGON -t_srs EPSG:3763 -overwrite"

Write-Host "\n== Importar Alojamento Local ==" -ForegroundColor Cyan
Run-Gdal "ogr2ogr -f PostgreSQL '$pg' /data/Estabelecimentos_de_Alojamento_Local/Estabelecimentos_de_Alojamento_Local.shp -nln alojamento_local -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt POINT -t_srs EPSG:3763 -overwrite"

Write-Host "\n== Tentar instalar ferramenta raster2pgsql ==" -ForegroundColor Cyan
try {
  docker exec -u root postgis_igv bash -lc "command -v raster2pgsql >/dev/null 2>&1 || (apt-get update && apt-get install -y postgis)"
} catch {
  Write-Warning "Não foi possível instalar raster2pgsql automaticamente. A aplicação continua a funcionar; as estatísticas raster ficam indisponíveis no backend."
}

Write-Host "\n== Importar DEM raster para PostGIS, se raster2pgsql estiver disponível ==" -ForegroundColor Cyan
docker exec -i postgis_igv bash -lc "if command -v raster2pgsql >/dev/null 2>&1; then raster2pgsql -s 3763 -I -C -M -t 256x256 /data/dem_srtm_pt_25m.tif public.dem_srtm | psql -U postgres -d igv_tp2; else echo 'AVISO: raster2pgsql indisponível; DEM será apenas publicado no GeoServer como GeoTIFF.'; fi"

Write-Host "\n== Criar tabelas derivadas, índices e views ==" -ForegroundColor Cyan
docker exec -i postgis_igv psql -U postgres -d igv_tp2 -f /home/sql_files/03_prepare_data.sql

Write-Host "\n== Validar importação ==" -ForegroundColor Cyan
docker exec -i postgis_igv psql -U postgres -d igv_tp2 -f /home/sql_files/04_validation_queries.sql

Write-Host "\n✓ Importação concluída." -ForegroundColor Green
Write-Host "Agora executa: npm run publish:geoserver e depois npm start" -ForegroundColor Green

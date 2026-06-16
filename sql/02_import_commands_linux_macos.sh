#!/usr/bin/env bash
set -euo pipefail

# Executar a partir da raiz do projeto.
# Descompactar primeiro os ficheiros ZIP fornecidos pelo docente para ./data.

NETWORK="igv_2526_postgres_network"
PG='PG:host=dbgis_igv port=5432 dbname=igv_tp2 user=postgres password=postgres'

# Criar base e extensões. Se a base já existir, o primeiro comando pode dar erro; nesse caso, prosseguir manualmente.
docker exec -i postgis_igv psql -U postgres -d postgres -f /home/sql_files/00_create_database.sql || true
docker exec -i postgis_igv psql -U postgres -d igv_tp2 -f /home/sql_files/01_extensions.sql

# Importar CAOP.
docker run --rm --network "$NETWORK" -v "$(pwd)/data:/data" osgeo/gdal:ubuntu-full-latest \
  ogr2ogr -f PostgreSQL "$PG" /data/Continente_CAOP2025_parcial.gpkg cont_municipios \
  -nln cont_municipios -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt MULTIPOLYGON -t_srs EPSG:3763 -overwrite

docker run --rm --network "$NETWORK" -v "$(pwd)/data:/data" osgeo/gdal:ubuntu-full-latest \
  ogr2ogr -f PostgreSQL "$PG" /data/Continente_CAOP2025_parcial.gpkg cont_freguesias \
  -nln cont_freguesias -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt MULTIPOLYGON -t_srs EPSG:3763 -overwrite

# Importar BGRI 2021.
docker run --rm --network "$NETWORK" -v "$(pwd)/data:/data" osgeo/gdal:ubuntu-full-latest \
  ogr2ogr -f PostgreSQL "$PG" /data/BGRI2021_1609/BGRI2021_1609.gpkg BGRI2021_1609 \
  -nln bgri2021 -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt MULTIPOLYGON -t_srs EPSG:3763 -overwrite

# Importar Alojamento Local.
docker run --rm --network "$NETWORK" -v "$(pwd)/data:/data" osgeo/gdal:ubuntu-full-latest \
  ogr2ogr -f PostgreSQL "$PG" /data/Estabelecimentos_de_Alojamento_Local/Estabelecimentos_de_Alojamento_Local.shp \
  -nln alojamento_local -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nlt POINT -t_srs EPSG:3763 -overwrite

# Importar DEM para PostGIS.
docker exec -i postgis_igv bash -lc "raster2pgsql -s 3763 -I -C -M -t 256x256 /data/dem_srtm_pt_25m.tif public.dem_srtm | psql -U postgres -d igv_tp2"

# Preparar índices e views.
docker exec -i postgis_igv psql -U postgres -d igv_tp2 -f /home/sql_files/03_prepare_data.sql

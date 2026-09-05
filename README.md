# Local Accommodation Geoportal

A WebGIS platform for exploring and analysing the spatial distribution of local accommodation in Viana do Castelo, Portugal.

The application combines interactive mapping, spatial databases and geospatial services to provide territorial, demographic and tourism-related analysis through a browser-based interface.

## Features

### Interactive WebGIS

- Interactive map built with Leaflet
- Multiple base maps
- Administrative boundaries
- Local accommodation locations
- Local accommodation density by parish
- BGRI 2021 statistical areas
- SRTM digital elevation model
- Layer visibility and opacity controls
- Dynamic map legend
- Marker clustering for accommodation locations

### Spatial Analysis

The application provides three analysis workflows.

#### Parish Analysis

Select a parish from the interface or directly from the map to calculate:

- number of local accommodation establishments
- total accommodation capacity
- accommodation density per km²
- accommodation per 1,000 inhabitants
- population
- census accommodation units
- buildings
- population by age group
- neighbouring parishes
- accommodation distribution by category
- elevation statistics when DEM data is available

#### Custom Area Analysis

Draw a polygon or rectangle directly on the map and analyse its intersection with the available spatial datasets.

The analysis includes:

- drawn area
- effective area within the municipality
- local accommodation count
- total accommodation capacity
- intersected parishes
- estimated BGRI population
- accommodation density
- accommodation per 1,000 inhabitants

Results can be exported as:

- CSV
- GeoJSON
- text summary

#### Radius Analysis

Select a point on the map and define a search radius to identify nearby local accommodation establishments.

### Map Identification

Click anywhere on the map to identify:

- the corresponding parish
- the nearest local accommodation establishment

### Territorial Overview

The dashboard also provides:

- total number of local accommodation establishments
- total accommodation capacity
- population
- municipality area
- accommodation categories
- top parishes by number of establishments

## Tech Stack

### Frontend

- HTML5
- CSS3
- JavaScript
- Leaflet
- Leaflet Draw
- Leaflet MarkerCluster

### Backend

- Node.js
- Express
- PostgreSQL
- PostGIS
- `pg`
- Helmet
- CORS
- Morgan

### Geospatial Infrastructure

- GeoServer
- WMS
- SLD
- PostGIS Raster
- GDAL / OGR
- Docker
- Docker Compose

## Architecture

```text
                        ┌──────────────────────┐
                        │       Browser        │
                        │   Leaflet WebGIS UI  │
                        └──────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          ┌───────────────────┐         ┌───────────────────┐
          │   Node.js API     │         │     GeoServer     │
          │     Express       │         │      WMS/SLD      │
          └─────────┬─────────┘         └─────────┬─────────┘
                    │                             │
                    └──────────────┬──────────────┘
                                   ▼
                        ┌──────────────────────┐
                        │ PostgreSQL / PostGIS │
                        │ Vector + Raster Data │
                        └──────────────────────┘
```

The Node.js backend performs spatial queries and statistical analysis directly in PostGIS, while GeoServer publishes spatial layers for map visualisation.

## Spatial Data

The project is designed around several geospatial datasets:

- CAOP administrative boundaries
- BGRI 2021 census data
- Local Accommodation establishments
- SRTM Digital Elevation Model

Spatial data is processed and stored in PostGIS using EPSG:3763.

The repository does not include the original large datasets. They must be placed locally inside the `data/` directory before running the import scripts.

## Project Structure

```text
local-accommodation-geoportal/
├── backend/
│   ├── server.js
│   └── src/
│       ├── db.js
│       └── routes/
│           └── api.js
├── geoserver/
│   └── sld/
├── public/
│   ├── css/
│   ├── js/
│   │   ├── api.js
│   │   ├── app.js
│   │   ├── map.js
│   │   └── ui.js
│   └── index.html
├── scripts/
│   └── geoserver-publish.js
├── sql/
│   ├── 00_create_database.sql
│   ├── 01_extensions.sql
│   ├── 02_import_commands_linux_macos.sh
│   ├── 02_import_commands_windows.ps1
│   ├── 03_prepare_data.sql
│   └── 04_validation_queries.sql
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## Getting Started

### Requirements

- Node.js 18+
- npm
- Docker
- Docker Compose

The data import workflow also uses GDAL/OGR through Docker.

### 1. Clone the Repository

```bash
git clone https://github.com/brandao-20/local-accommodation-geoportal.git
cd local-accommodation-geoportal
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Configure the Environment

Create a local `.env` file from the provided example.

macOS / Linux:

```bash
cp .env.example .env
```

Windows:

```powershell
Copy-Item .env.example .env
```

The default development configuration uses:

```text
Application    http://localhost:3004
PostGIS        localhost:5433
pgAdmin        http://localhost:5050
GeoServer      http://localhost:8080/geoserver
```

### 4. Start the Geospatial Infrastructure

```bash
docker compose up -d
```

This starts:

- PostgreSQL with PostGIS
- pgAdmin
- GeoServer

### 5. Prepare the Spatial Data

The original datasets are intentionally not included in the repository.

Place the required files inside:

```text
data/
```

The import scripts expect the project datasets for:

- CAOP administrative boundaries
- BGRI 2021
- Local Accommodation
- SRTM DEM

### 6. Import Data into PostGIS

macOS / Linux:

```bash
bash sql/02_import_commands_linux_macos.sh
```

Windows PowerShell:

```powershell
.\sql\02_import_commands_windows.ps1
```

The import workflow:

1. creates the project database
2. enables the required PostgreSQL/PostGIS extensions
3. imports vector datasets with GDAL/OGR
4. imports the DEM into PostGIS Raster
5. creates indexes and prepared spatial views

### 7. Publish the GeoServer Layers

After the database is prepared and GeoServer is running:

```bash
npm run publish:geoserver
```

This configures the GeoServer workspace, PostGIS datastore and project layers.

### 8. Start the Application

```bash
npm start
```

Open:

```text
http://localhost:3004
```

For development with automatic Node.js restarts:

```bash
npm run dev
```

## Main API Capabilities

The backend exposes endpoints for:

- system and PostGIS health checks
- dataset metadata
- municipality-wide summaries
- parish listing and search
- parish GeoJSON
- parish statistics
- parish rankings
- map feature identification
- local accommodation GeoJSON
- custom-area spatial analysis
- radius-based analysis

The API performs spatial operations directly in PostGIS using functions such as intersections, containment, proximity searches and geometry transformations.

## GeoServer Layers

The application uses GeoServer to expose map layers including:

```text
Municipality
Parishes
Local Accommodation
Local Accommodation by Parish
BGRI 2021
SRTM DEM
```

Custom SLD styles are stored in:

```text
geoserver/sld/
```

## Spatial Analysis

The project makes extensive use of PostGIS spatial operations, including:

- `ST_Intersects`
- `ST_Contains`
- `ST_Touches`
- `ST_DWithin`
- `ST_Distance`
- `ST_Transform`
- `ST_Centroid`
- `ST_AsGeoJSON`
- raster clipping and summary statistics

These operations are used to combine administrative, demographic, tourism and elevation data into interactive territorial analyses.

## Data Exports

Custom-area analysis results can be exported directly from the interface as:

```text
CSV
GeoJSON
```

A formatted analysis summary can also be copied to the clipboard.

## Configuration

The study area can be configured through environment variables:

```env
STUDY_DTMN=1609
STUDY_NAME=Viana do Castelo
```

GeoServer configuration is also environment-based:

```env
GEOSERVER_URL=http://localhost:8080/geoserver
GEOSERVER_WORKSPACE=igv
GEOSERVER_STORE=postgis_igv
```

Database credentials and local ports are defined in `.env` and should never be committed to the repository.

## Data Attribution

The application works with public and academic geospatial datasets related to:

- Portuguese administrative boundaries
- Portuguese Census / BGRI
- Local Accommodation establishments
- digital elevation data

The original datasets are not redistributed through this repository.

## Purpose

This project was developed as a geospatial engineering project focused on the integration of:

- spatial databases
- GIS web services
- interactive web mapping
- raster and vector data
- spatial SQL
- territorial analysis

The repository has been organised as a public portfolio version of the application.

/*
 * Publicação automática das camadas no GeoServer através da REST API.
 * Executar depois de importar a base PostGIS e arrancar o GeoServer:
 * npm run publish:geoserver
 */

require('dotenv').config({ override: true });
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GEOSERVER_URL = (process.env.GEOSERVER_URL || 'http://localhost:8080/geoserver').replace(/\/$/, '');
const WORKSPACE = process.env.GEOSERVER_WORKSPACE || 'igv';
const STORE = process.env.GEOSERVER_STORE || 'postgis_igv';
const USER = process.env.GEOSERVER_USER || 'admin';
const PASSWORD = process.env.GEOSERVER_PASSWORD || 'geoserver';
const PGHOST_FOR_GEOSERVER = process.env.PGHOST_FOR_GEOSERVER || 'dbgis_igv';

const auth = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

const vectorLayers = [
  { name: 'geo_vc_municipio', title: 'Município de Viana do Castelo', style: 'municipio_outline' },
  { name: 'geo_vc_freguesias', title: 'Freguesias de Viana do Castelo', style: 'freguesias_outline' },
  { name: 'geo_vc_alojamento_local', title: 'Alojamento Local em Viana do Castelo', style: 'alojamento_local' },
  { name: 'geo_vc_alojamentos_por_freguesia', title: 'Alojamento Local por freguesia', style: 'al_density' },
  { name: 'bgri2021', title: 'BGRI 2021 — Viana do Castelo', style: 'bgri_population' }
];

const styles = [
  'municipio_outline',
  'freguesias_outline',
  'alojamento_local',
  'al_density',
  'bgri_population',
  'dem_srtm'
];

async function request(method, restPath, body, contentType = 'application/json') {
  const headers = { Authorization: auth };
  if (contentType) headers['Content-Type'] = contentType;

  const response = await fetch(`${GEOSERVER_URL}${restPath}`, { method, headers, body });
  const text = await response.text();

  if (!response.ok && response.status !== 409) {
    throw new Error(`${method} ${restPath} -> HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, text };
}

async function safe(label, fn) {
  try {
    const result = await fn();
    if (result && result.status === 409) console.log(`= ${label} já existia`);
    else console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}`);
    throw err;
  }
}

async function waitForGeoServer() {
  for (let i = 1; i <= 30; i++) {
    try {
      const response = await fetch(`${GEOSERVER_URL}/rest/about/version.json`, { headers: { Authorization: auth } });
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('GeoServer não respondeu. Confirma http://localhost:8080/geoserver e as credenciais.');
}

async function createWorkspace() {
  await request('POST', '/rest/workspaces', JSON.stringify({ workspace: { name: WORKSPACE } }));
}

async function createDatastore() {
  const payload = {
    dataStore: {
      name: STORE,
      enabled: true,
      connectionParameters: {
        host: PGHOST_FOR_GEOSERVER,
        port: process.env.PGPORT_FOR_GEOSERVER || '5432',
        database: process.env.PGDATABASE || 'igv_tp2',
        user: process.env.PGUSER || 'postgres',
        passwd: process.env.PGPASSWORD || 'postgres',
        dbtype: 'postgis',
        schema: 'public',
        namespace: WORKSPACE,
        'Expose primary keys': 'true',
        looseBBox: 'true',
        preparedStatements: 'true'
      }
    }
  };
  await request('POST', `/rest/workspaces/${WORKSPACE}/datastores`, JSON.stringify(payload));
}

async function uploadStyle(styleName) {
  const sldPath = path.join(ROOT, 'geoserver', 'sld', `${styleName}.sld`);
  const sld = await fs.readFile(sldPath, 'utf8');

  await request('POST', `/rest/workspaces/${WORKSPACE}/styles`, JSON.stringify({ style: { name: styleName, filename: `${styleName}.sld` } }));
  await request('PUT', `/rest/workspaces/${WORKSPACE}/styles/${styleName}`, sld, 'application/vnd.ogc.sld+xml');
}

async function publishFeatureType(layer) {
  const payload = {
    featureType: {
      name: layer.name,
      nativeName: layer.name,
      title: layer.title,
      srs: 'EPSG:3763',
      enabled: true
    }
  };
  await request('POST', `/rest/workspaces/${WORKSPACE}/datastores/${STORE}/featuretypes`, JSON.stringify(payload));
}

async function assignStyle(layerName, styleName) {
  const payload = {
    layer: {
      defaultStyle: {
        name: styleName,
        workspace: WORKSPACE
      },
      enabled: true
    }
  };
  await request('PUT', `/rest/layers/${WORKSPACE}:${layerName}`, JSON.stringify(payload));
}

async function publishDemGeoTiff() {
  const demPath = path.join(ROOT, 'data', 'dem_srtm_pt_25m.tif');
  try {
    await fs.access(demPath);
  } catch (_) {
    console.log('= DEM GeoTIFF não encontrado em ./data/dem_srtm_pt_25m.tif; publicação raster ignorada.');
    return;
  }

  const buffer = await fs.readFile(demPath);
  await request(
    'PUT',
    `/rest/workspaces/${WORKSPACE}/coveragestores/dem_srtm_25m/file.geotiff?configure=first&coverageName=dem_srtm_25m`,
    buffer,
    'image/tiff'
  );
  await assignStyle('dem_srtm_25m', 'dem_srtm');
}

async function main() {
  console.log(`GeoServer: ${GEOSERVER_URL}`);
  console.log(`Workspace: ${WORKSPACE}`);
  await waitForGeoServer();

  await safe(`workspace ${WORKSPACE}`, createWorkspace);
  await safe(`datastore PostGIS ${STORE}`, createDatastore);

  for (const style of styles) {
    await safe(`style ${style}`, () => uploadStyle(style));
  }

  for (const layer of vectorLayers) {
    await safe(`layer ${layer.name}`, () => publishFeatureType(layer));
    await safe(`style default ${layer.name}`, () => assignStyle(layer.name, layer.style));
  }

  await safe('raster DEM SRTM 25m', publishDemGeoTiff);

  console.log('\nPublicação concluída. Testa em:');
  console.log(`${GEOSERVER_URL}/${WORKSPACE}/wms?service=WMS&version=1.1.0&request=GetCapabilities`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

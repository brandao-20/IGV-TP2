require('dotenv').config({ override: true });
  
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { pool, closePool } = require('./src/db');
const apiRouter = require('./src/routes/api');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/api/config', (_req, res) => {
  res.json({
    appName: 'SIG-AL | Análise Espacial do Alojamento Local',
    studyName: process.env.STUDY_NAME || 'Viana do Castelo',
    studyDtmn: process.env.STUDY_DTMN || '1609',
    geoserverUrl: process.env.GEOSERVER_URL || 'http://localhost:8080/geoserver',
    geoserverWorkspace: process.env.GEOSERVER_WORKSPACE || 'igv',
    layers: {
      municipio: 'geo_vc_municipio',
      freguesias: 'geo_vc_freguesias',
      alojamentoLocal: 'geo_vc_alojamento_local',
      alojamentosPorFreguesia: 'geo_vc_alojamentos_por_freguesia',
      bgri: 'bgri2021',
      dem: 'dem_srtm_25m'
    }
  });
});

app.use('/api', apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado', path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error('[ERRO]', err);
  res.status(err.status || 500).json({
    error: err.publicMessage || 'Erro interno do servidor',
    details: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

const server = app.listen(port, () => {
  console.log(`SIG-AL disponível em http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} recebido. A encerrar servidor...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, pool };

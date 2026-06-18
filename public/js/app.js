(async function bootstrap() {
  UI.setupTabs();
  let lastAreaAnalysis = null;

  async function runFreguesiaAnalysis(dtmnfr) {
    if (!dtmnfr) return;
    const resultEl = UI.byId('freguesiaResult');
    resultEl.className = 'result-card muted';
    resultEl.textContent = 'A calcular estatísticas…';
    try {
      await MapModule.highlightFreguesia(dtmnfr);
      const stats = await API.freguesiaStats(dtmnfr);
      resultEl.className = 'result-card';
      resultEl.innerHTML = UI.renderFreguesiaStats(stats);
    } catch (err) {
      resultEl.className = 'result-card muted';
      resultEl.textContent = 'Não foi possível calcular estatísticas.';
      UI.error(`Erro na análise da freguesia: ${err.message}`);
    }
  }

  try {
    UI.setStatus('warning', 'A ligar…');
    const config = await API.getConfig();
    UI.byId('studyAreaLabel').textContent = config.studyName;

    MapModule.initMap(config);
    UI.renderDynamicLegend(config);

    const health = await API.health();
    UI.setStatus('success', 'PostGIS ligado');
    console.log('Healthcheck:', health);

    const [summary, freguesias, ranking] = await Promise.all([
      API.summary(),
      API.freguesias(),
      API.ranking(10)
    ]);

    UI.renderGlobalStats(summary);
    UI.populateFreguesias(freguesias);
    UI.renderRanking(ranking);

    UI.byId('btnResetMap').addEventListener('click', () => MapModule.resetView());

    UI.byId('btnAnaliseFreguesia').addEventListener('click', async () => {
      await runFreguesiaAnalysis(UI.byId('freguesiaSelect').value);
    });

    window.addEventListener('sigal:freguesia-map-select', async (event) => {
      const dtmnfr = event.detail?.dtmnfr;
      if (!dtmnfr) return;
      const select = UI.byId('freguesiaSelect');
      select.value = dtmnfr;
      UI.toast(`Freguesia selecionada no mapa: ${event.detail.freguesia}`);
      await runFreguesiaAnalysis(dtmnfr);
    });

    UI.byId('btnDrawPolygon').addEventListener('click', () => MapModule.startPolygonDrawing());
    UI.byId('btnDrawRectangle').addEventListener('click', () => MapModule.startRectangleDrawing());

    UI.byId('btnAreaAnalysis').addEventListener('click', async () => {
      const geometry = MapModule.getDrawnGeometry();
      const resultEl = UI.byId('areaResult');
      if (!geometry) {
        UI.toast('Desenha primeiro uma área no mapa. Usa os botões de polígono ou retângulo.');
        return;
      }
      resultEl.className = 'result-card muted';
      resultEl.textContent = 'A executar análise espacial…';
      UI.byId('areaExportTools')?.classList.add('hidden');
      try {
        const stats = await API.areaAnalysis(geometry);
        lastAreaAnalysis = { ...stats, desenho_geojson: geometry };
        resultEl.className = 'result-card';
        resultEl.innerHTML = UI.renderAreaStats(stats);
        MapModule.showEffectiveArea(stats.area_analisada_geojson);
        UI.byId('areaExportTools')?.classList.remove('hidden');
      } catch (err) {
        resultEl.className = 'result-card muted';
        resultEl.textContent = 'Não foi possível executar a análise.';
        UI.error(`Erro na análise da área: ${err.message}`);
      }
    });

    UI.byId('btnClearDrawings').addEventListener('click', () => {
      lastAreaAnalysis = null;
      MapModule.clearDrawings();
    });

    UI.byId('btnExportAreaCsv').addEventListener('click', () => {
      if (!lastAreaAnalysis) return UI.toast('Executa primeiro uma análise da área.');
      UI.downloadCsv('sigal_analise_area.csv', UI.areaToCsvRows(lastAreaAnalysis));
    });

    UI.byId('btnExportAreaGeojson').addEventListener('click', () => {
      if (!lastAreaAnalysis) return UI.toast('Executa primeiro uma análise da área.');
      const geojson = lastAreaAnalysis.area_analisada_geojson || {
        type: 'Feature',
        properties: {},
        geometry: lastAreaAnalysis.desenho_geojson
      };
      geojson.properties = {
        ...(geojson.properties || {}),
        area_analisada_km2: lastAreaAnalysis.area_analisada_km2,
        alojamentos_locais: lastAreaAnalysis.total_alojamentos,
        populacao_bgri: lastAreaAnalysis.populacao_total,
        alojamentos_km2: lastAreaAnalysis.alojamentos_km2
      };
      UI.downloadJson('sigal_area_analisada.geojson', geojson);
    });

    UI.byId('btnCopyAreaSummary').addEventListener('click', async () => {
      if (!lastAreaAnalysis) return UI.toast('Executa primeiro uma análise da área.');
      const s = lastAreaAnalysis;
      const text = [
        'SIG-AL — Resumo da análise por área',
        `Área desenhada: ${UI.format(s.area_desenhada_km2, 4)} km²`,
        `Área analisada: ${UI.format(s.area_analisada_km2, 4)} km²`,
        `Alojamentos locais: ${UI.format(s.total_alojamentos)}`,
        `Capacidade total: ${UI.format(s.capacidade_total)}`,
        `Freguesias intersetadas: ${UI.format(s.freguesias_intersetadas)}`,
        `População BGRI estimada: ${UI.format(s.populacao_total)}`,
        `AL/km²: ${UI.format(s.alojamentos_km2, 2)}`,
        `AL/1000 hab.: ${UI.format(s.alojamentos_1000_hab, 2)}`
      ].join('\n');
      await UI.copyText(text);
      UI.toast('Resumo copiado para a área de transferência.');
    });

    UI.byId('btnRadiusAnalysis').addEventListener('click', async () => {
      const center = MapModule.getRadiusCenter();
      const resultEl = UI.byId('radiusResult');
      const radius = Number(UI.byId('radiusInput').value || 500);
      if (!center) {
        UI.toast('Clica primeiro no mapa para definir o centro do raio.');
        return;
      }
      resultEl.className = 'result-card muted';
      resultEl.textContent = 'A pesquisar alojamentos no raio…';
      try {
        const stats = await MapModule.showRadiusResults(center.lat, center.lng, radius);
        resultEl.className = 'result-card';
        resultEl.innerHTML = UI.renderRadiusStats(stats);
      } catch (err) {
        resultEl.className = 'result-card muted';
        resultEl.textContent = 'Não foi possível executar a análise por raio.';
        UI.error(`Erro na análise por raio: ${err.message}`);
      }
    });

    UI.toast('Geoportal carregado com sucesso.');
  } catch (err) {
    UI.setStatus('danger', 'Erro');
    UI.error(`Arranque falhou: ${err.message}`);
    UI.byId('identifyResult').innerHTML = `
      <strong>Não foi possível iniciar corretamente.</strong><br>
      Confirma se o PostGIS está ativo, se os dados foram importados e se o ficheiro .env está correto.<br><br>
      <code>${err.message}</code>
    `;
  }
})();

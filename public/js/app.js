(async function bootstrap() {
  UI.setupTabs();

  try {
    UI.setStatus('warning', 'A ligar…');
    const config = await API.getConfig();
    UI.byId('studyAreaLabel').textContent = config.studyName;

    MapModule.initMap(config);

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

    UI.byId('btnAnaliseFreguesia').addEventListener('click', async () => {
      const dtmnfr = UI.byId('freguesiaSelect').value;
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
    });

    UI.byId('btnAreaAnalysis').addEventListener('click', async () => {
      const geometry = MapModule.getDrawnGeometry();
      const resultEl = UI.byId('areaResult');
      if (!geometry) {
        UI.toast('Desenha primeiro uma área no mapa.');
        return;
      }
      resultEl.className = 'result-card muted';
      resultEl.textContent = 'A executar análise espacial…';
      try {
        const stats = await API.areaAnalysis(geometry);
        resultEl.className = 'result-card';
        resultEl.innerHTML = UI.renderAreaStats(stats);
      } catch (err) {
        resultEl.className = 'result-card muted';
        resultEl.textContent = 'Não foi possível executar a análise.';
        UI.error(`Erro na análise da área: ${err.message}`);
      }
    });

    UI.byId('btnClearDrawings').addEventListener('click', () => MapModule.clearDrawings());

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

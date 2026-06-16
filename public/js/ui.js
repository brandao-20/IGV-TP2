window.UI = (() => {
  const fmt = new Intl.NumberFormat('pt-PT');
  const fmt1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });

  function byId(id) { return document.getElementById(id); }

  function format(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return digits === 0 ? fmt.format(Number(value)) : new Intl.NumberFormat('pt-PT', { maximumFractionDigits: digits }).format(Number(value));
  }

  function setStatus(kind, text) {
    const el = byId('statusBadge');
    el.className = `badge badge-${kind}`;
    el.textContent = text;
  }

  let toastTimer = null;
  function toast(message, timeout = 3200) {
    const el = byId('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), timeout);
  }

  function error(message) {
    toast(message, 5200);
    console.error(message);
  }

  function renderMetricsCard(title, rows, extraHtml = '') {
    const items = rows.map(([label, value, suffix = '']) => `<dt>${label}</dt><dd>${value}${suffix}</dd>`).join('');
    return `<h3>${title}</h3><dl>${items}</dl>${extraHtml}`;
  }

  function renderModalidades(rows) {
    if (!rows || !rows.length) return '';
    const max = Math.max(...rows.map(r => Number(r.total) || 0), 1);
    const items = rows.slice(0, 6).map(r => {
      const w = Math.max(4, ((Number(r.total) || 0) / max) * 100);
      return `<div class="bar-item"><span class="bar-label" title="${escapeHtml(r.modalidade)}">${escapeHtml(r.modalidade)}</span><span class="bar-track"><span class="bar-fill" style="width:${w}%"></span></span><span class="bar-value">${format(r.total)}</span></div>`;
    }).join('');
    return `<div class="subheading">Modalidades</div><div class="bar-chart">${items}</div>`;
  }

  function renderFreguesiaStats(data) {
    const rows = [
      ['Freguesia', escapeHtml(data.freguesia)],
      ['Alojamentos locais', format(data.total_alojamentos)],
      ['Capacidade total', format(data.capacidade_total)],
      ['Área', format(data.area_km2, 2), ' km²'],
      ['AL/km²', format(data.alojamentos_km2, 2)],
      ['AL/1000 hab.', format(data.alojamentos_1000_hab, 2)],
      ['População BGRI', format(data.populacao)],
      ['Alojamentos censitários', format(data.alojamentos_censos)],
      ['Edifícios', format(data.edificios)],
      ['Freguesias vizinhas', format(data.freguesias_vizinhas)]
    ];

    let extra = renderModalidades(data.modalidades);
    if (data.altitude && data.altitude.media_m !== null && data.altitude.media_m !== undefined) {
      extra += `<div class="subheading">Altitude DEM</div><dl><dt>Mínima</dt><dd>${format(data.altitude.min_m, 1)} m</dd><dt>Média</dt><dd>${format(data.altitude.media_m, 1)} m</dd><dt>Máxima</dt><dd>${format(data.altitude.max_m, 1)} m</dd></dl>`;
    } else if (data.altitude && data.altitude.disponivel === false) {
      extra += `<p class="help-text">Altitude indisponível: importa o raster no PostGIS para ativar esta estatística.</p>`;
    }

    return renderMetricsCard('Estatísticas da freguesia', rows, extra);
  }

  function renderAreaStats(data) {
    const rows = [
      ['Área desenhada', format(data.area_km2, 4), ' km²'],
      ['Alojamentos locais', format(data.total_alojamentos)],
      ['Capacidade total', format(data.capacidade_total)],
      ['Freguesias intersetadas', format(data.freguesias_intersetadas)],
      ['População BGRI', format(data.populacao_total)],
      ['Alojamentos censitários', format(data.alojamentos_censos)],
      ['AL/km²', format(data.alojamentos_km2, 2)],
      ['AL/1000 hab.', format(data.alojamentos_1000_hab, 2)]
    ];
    let extra = renderModalidades(data.modalidades);
    if (data.freguesias && data.freguesias.length) {
      const freguesias = data.freguesias.slice(0, 6).map(f => `<li>${escapeHtml(f.freguesia)} <strong>${format(f.area_intersetada_km2, 3)} km²</strong></li>`).join('');
      extra += `<div class="subheading">Freguesias intersetadas</div><ul class="help-text">${freguesias}</ul>`;
    }
    if (data.altitude && data.altitude.media_m !== null && data.altitude.media_m !== undefined) {
      extra += `<div class="subheading">Altitude DEM</div><dl><dt>Mínima</dt><dd>${format(data.altitude.min_m, 1)} m</dd><dt>Média</dt><dd>${format(data.altitude.media_m, 1)} m</dd><dt>Máxima</dt><dd>${format(data.altitude.max_m, 1)} m</dd></dl>`;
    }
    return renderMetricsCard('Resultado da análise', rows, extra);
  }

  function renderRadiusStats(data) {
    return renderMetricsCard('Alojamentos no raio', [
      ['Raio', format(data.radius), ' m'],
      ['Alojamentos encontrados', format(data.total)],
      ['Capacidade total', format(data.capacidade_total)]
    ]);
  }

  function renderIdentify(data) {
    if (!data.freguesia && !data.alojamento) return '<span class="muted">Não foi encontrado nenhum elemento nesta localização.</span>';
    let html = '';
    if (data.freguesia) {
      html += renderMetricsCard('Freguesia', [
        ['Nome', escapeHtml(data.freguesia.freguesia)],
        ['Município', escapeHtml(data.freguesia.municipio)],
        ['Área', format(data.freguesia.area_km2, 2), ' km²']
      ]);
    }
    if (data.alojamento) {
      html += `<div class="subheading">Alojamento mais próximo</div>`;
      html += `<dl><dt>Nome</dt><dd>${escapeHtml(data.alojamento.denominaca || '—')}</dd><dt>RNAL</dt><dd>${escapeHtml(data.alojamento.nrrnal || '—')}</dd><dt>Modalidade</dt><dd>${escapeHtml(data.alojamento.modalidade || '—')}</dd><dt>Distância</dt><dd>${format(data.alojamento.distancia_m, 1)} m</dd></dl>`;
    }
    return html;
  }

  function renderGlobalStats(summary) {
    const el = byId('globalStats');
    const t = summary.totals || {};
    el.innerHTML = `
      <h2>Resumo</h2>
      <div class="metric"><span>Alojamentos</span><strong>${format(t.total_alojamentos)}</strong></div>
      <div class="metric"><span>Capacidade</span><strong>${format(t.capacidade_total)}</strong></div>
      <div class="metric"><span>População</span><strong>${format(t.populacao_total)}</strong></div>
      <div class="metric"><span>Área</span><strong>${format(t.area_km2, 1)} km²</strong></div>
    `;
  }

  function renderRanking(rows) {
    const el = byId('rankingChart');
    if (!rows || !rows.length) {
      el.innerHTML = '<p class="help-text">Sem dados.</p>';
      return;
    }
    const max = Math.max(...rows.map(r => Number(r.total_alojamentos) || 0), 1);
    el.innerHTML = rows.map(r => {
      const w = Math.max(3, ((Number(r.total_alojamentos) || 0) / max) * 100);
      return `<div class="bar-item"><span class="bar-label" title="${escapeHtml(r.freguesia)}">${escapeHtml(r.freguesia)}</span><span class="bar-track"><span class="bar-fill" style="width:${w}%"></span></span><span class="bar-value">${format(r.total_alojamentos)}</span></div>`;
    }).join('');
  }

  function populateFreguesias(rows) {
    const select = byId('freguesiaSelect');
    select.innerHTML = rows.map(r => `<option value="${escapeHtml(r.dtmnfr)}">${escapeHtml(r.freguesia)} (${format(r.total_alojamentos)} AL)</option>`).join('');
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        button.classList.add('active');
        byId(button.dataset.tab).classList.add('active');
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function popupFromProperties(title, rows) {
    return `<div class="popup-title">${escapeHtml(title)}</div><div class="popup-grid">${rows.map(([k, v]) => `<span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span>`).join('')}</div>`;
  }

  return {
    byId,
    format,
    fmt1,
    fmt2,
    setStatus,
    toast,
    error,
    renderFreguesiaStats,
    renderAreaStats,
    renderRadiusStats,
    renderIdentify,
    renderGlobalStats,
    renderRanking,
    populateFreguesias,
    setupTabs,
    popupFromProperties
  };
})();

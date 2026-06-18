window.UI = (() => {
  const fmt = new Intl.NumberFormat('pt-PT');

  function byId(id) { return document.getElementById(id); }

  function format(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('pt-PT', {
      minimumFractionDigits: digits > 0 ? 0 : 0,
      maximumFractionDigits: digits
    }).format(Number(value));
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

  function shortenModalidade(value) {
    const v = String(value || 'Sem modalidade').trim();
    const normalized = v.toLowerCase();
    if (normalized.includes('estabelecimento') && normalized.includes('hosped')) return 'Estab. hospedagem';
    if (normalized.includes('apartamento')) return 'Apartamento';
    if (normalized.includes('moradia')) return 'Moradia';
    if (normalized.includes('quarto')) return 'Quartos';
    if (v.length > 24) return `${v.slice(0, 21)}…`;
    return v;
  }

  function renderModalidades(rows) {
    if (!rows || !rows.length) return '';
    const max = Math.max(...rows.map(r => Number(r.total) || 0), 1);
    const items = rows.map(r => {
      const w = Math.max(4, ((Number(r.total) || 0) / max) * 100);
      const label = shortenModalidade(r.modalidade);
      return `<div class="bar-item"><span class="bar-label" title="${escapeHtml(r.modalidade)}">${escapeHtml(label)}</span><span class="bar-track"><span class="bar-fill" style="width:${w}%"></span></span><span class="bar-value">${format(r.total)}</span></div>`;
    }).join('');
    return `<div class="subheading">Modalidades</div><div class="bar-chart">${items}</div>`;
  }

  function renderDemografia(data) {
    const total = Number(data.populacao || data.populacao_total || 0);
    const rows = [
      ['0–14 anos', data.ind_0_14],
      ['15–24 anos', data.ind_15_24],
      ['25–64 anos', data.ind_25_64],
      ['65+ anos', data.ind_65_plus]
    ].filter(([, value]) => value !== null && value !== undefined);

    if (!rows.length || total <= 0) return '';
    const items = rows.map(([label, value]) => {
      const percentage = Math.max(0, Math.min(100, Number(value || 0) * 100 / total));
      return `<div class="bar-item"><span class="bar-label">${label}</span><span class="bar-track"><span class="bar-fill" style="width:${percentage}%"></span></span><span class="bar-value">${format(percentage, 1)}%</span></div>`;
    }).join('');
    return `<div class="subheading">Estrutura etária BGRI</div><div class="bar-chart">${items}</div>`;
  }

  function renderAltitude(altitude) {
    if (altitude && altitude.media_m !== null && altitude.media_m !== undefined) {
      return `<div class="subheading">Altitude DEM</div><dl><dt>Mínima</dt><dd>${format(altitude.min_m, 1)} m</dd><dt>Média</dt><dd>${format(altitude.media_m, 1)} m</dd><dt>Máxima</dt><dd>${format(altitude.max_m, 1)} m</dd></dl>`;
    }
    if (altitude && altitude.disponivel === false) {
      return `<p class="help-text">Altitude indisponível: importa o raster no PostGIS para ativar esta estatística.</p>`;
    }
    return '';
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

    const extra = renderModalidades(data.modalidades) + renderDemografia(data) + renderAltitude(data.altitude);
    return renderMetricsCard('Estatísticas da freguesia', rows, extra);
  }

  function renderAreaStats(data) {
    const rows = [
      ['Área desenhada', format(data.area_desenhada_km2 ?? data.area_km2, 4), ' km²'],
      ['Área analisada', format(data.area_analisada_km2 ?? data.area_km2, 4), ' km²'],
      ['Fora do município', format(data.area_fora_municipio_km2, 4), ' km²'],
      ['Área válida', format(data.percentagem_area_valida, 2), '%'],
      ['Alojamentos locais', format(data.total_alojamentos)],
      ['Capacidade total', format(data.capacidade_total)],
      ['Freguesias intersetadas', format(data.freguesias_intersetadas)],
      ['População BGRI estimada', format(data.populacao_total)],
      ['Alojamentos censitários', format(data.alojamentos_censos)],
      ['Edifícios', format(data.edificios)],
      ['AL/km²', format(data.alojamentos_km2, 2)],
      ['AL/1000 hab.', format(data.alojamentos_1000_hab, 2)]
    ];

    let extra = '';
    if ((Number(data.area_fora_municipio_km2) || 0) > 0) {
      extra += `<div class="result-note">A densidade e a BGRI usam apenas a área efetivamente analisada dentro do município de Viana do Castelo.</div>`;
    }
    extra += renderModalidades(data.modalidades);
    extra += renderDemografia(data);

    if (data.freguesias && data.freguesias.length) {
      const rowsHtml = data.freguesias.map(f => `
        <tr>
          <td title="${escapeHtml(f.freguesia)}">${escapeHtml(f.freguesia)}</td>
          <td>${format(f.area_intersetada_km2, 3)}</td>
          <td>${format(f.percentagem_area_analisada, 1)}%</td>
          <td>${format(f.percentagem_freguesia, 1)}%</td>
        </tr>`).join('');
      extra += `
        <div class="subheading">Freguesias intersetadas</div>
        <div class="table-scroll">
          <table class="mini-table">
            <thead><tr><th>Freguesia</th><th>km²</th><th>% área</th><th>% freg.</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    }

    extra += renderAltitude(data.altitude);

    if (data.metodologia) {
      extra += `<div class="result-note"><strong>Metodologia:</strong> ${escapeHtml(data.metodologia.area)} ${escapeHtml(data.metodologia.bgri)}</div>`;
    }

    return renderMetricsCard('Resultado da análise', rows, extra);
  }

  function renderRadiusStats(data) {
    let extra = '';
    if (data.modalidades && data.modalidades.length) extra += renderModalidades(data.modalidades);
    return renderMetricsCard('Alojamentos no raio', [
      ['Raio', format(data.radius), ' m'],
      ['Alojamentos encontrados', format(data.total)],
      ['Capacidade total', format(data.capacidade_total)]
    ], extra);
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
      html += `<dl><dt>Nome</dt><dd>${escapeHtml(data.alojamento.denominaca || '—')}</dd><dt>RNAL</dt><dd>${escapeHtml(data.alojamento.nrrnal || '—')}</dd><dt>Modalidade</dt><dd>${escapeHtml(shortenModalidade(data.alojamento.modalidade || '—'))}</dd><dt>Distância</dt><dd>${format(data.alojamento.distancia_m, 1)} m</dd></dl>`;
    }
    return html;
  }


  function renderAlojamentoLocalCard(data) {
    if (!data) return '<span class="muted">Alojamento local sem informação disponível.</span>';
    return renderMetricsCard('Alojamento Local', [
      ['Nome', escapeHtml(data.denominaca || '—')],
      ['RNAL', escapeHtml(data.nrrnal || '—')],
      ['Modalidade', escapeHtml(shortenModalidade(data.modalidade || '—'))],
      ['Capacidade', format(data.nrutentes)],
      ['Freguesia', escapeHtml(data.freguesia || '—')],
      ['Concelho', escapeHtml(data.concelho || '—')],
      ['Endereço', escapeHtml(data.endereco || '—')]
    ], '<p class="help-text">Ponto carregado como GeoJSON interativo a partir do PostGIS.</p>');
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

  function getActiveTab() {
    return document.querySelector('.tab.active')?.dataset.tab || 'tab-freguesia';
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

  function renderDrawMeasure(info) {
    const el = byId('drawMeasure');
    if (!info) {
      el.className = 'measure-card muted';
      el.textContent = 'Ainda não existe área desenhada.';
      return;
    }
    el.className = 'measure-card';
    el.innerHTML = `<dl><dt>Área desenhada</dt><dd>${format(info.areaKm2, 4)} km²</dd><dt>Área</dt><dd>${format(info.areaM2, 0)} m²</dd><dt>Perímetro</dt><dd>${format(info.perimeterKm, 3)} km</dd></dl>`;
  }

  function renderDynamicLegend(config) {
    const el = byId('dynamicLegend');
    if (!el || !config) return;
    const url = `${config.geoserverUrl}/${config.geoserverWorkspace}/wms?service=WMS&version=1.1.0&request=GetLegendGraphic&format=image/png&width=22&height=18&layer=${config.geoserverWorkspace}:${config.layers.alojamentosPorFreguesia}`;
    el.innerHTML = `<p>Legenda WMS/SLD</p><img src="${url}" alt="Legenda dinâmica da camada de densidade" />`;
  }

  function areaToCsvRows(data) {
    const rows = [
      ['Indicador', 'Valor'],
      ['Área desenhada (km2)', data.area_desenhada_km2 ?? ''],
      ['Área analisada (km2)', data.area_analisada_km2 ?? data.area_km2 ?? ''],
      ['Área fora do município (km2)', data.area_fora_municipio_km2 ?? ''],
      ['Alojamentos locais', data.total_alojamentos ?? ''],
      ['Capacidade total', data.capacidade_total ?? ''],
      ['Freguesias intersetadas', data.freguesias_intersetadas ?? ''],
      ['População BGRI estimada', data.populacao_total ?? ''],
      ['Alojamentos censitários estimados', data.alojamentos_censos ?? ''],
      ['AL/km2', data.alojamentos_km2 ?? ''],
      ['AL/1000 habitantes', data.alojamentos_1000_hab ?? '']
    ];
    rows.push([]);
    rows.push(['Freguesia', 'Área intersetada km2', '% área analisada', '% freguesia']);
    (data.freguesias || []).forEach(f => rows.push([f.freguesia, f.area_intersetada_km2, f.percentagem_area_analisada, f.percentagem_freguesia]));
    rows.push([]);
    rows.push(['Modalidade', 'Total', 'Capacidade']);
    (data.modalidades || []).forEach(m => rows.push([m.modalidade, m.total, m.capacidade ?? '']));
    return rows;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map(row => row.map(cell => {
      const value = String(cell ?? '').replaceAll('"', '""');
      return /[";\n]/.test(value) ? `"${value}"` : value;
    }).join(';')).join('\n');
    downloadBlob(filename, csv, 'text/csv;charset=utf-8');
  }

  function downloadJson(filename, obj) {
    downloadBlob(filename, JSON.stringify(obj, null, 2), 'application/json;charset=utf-8');
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function copyText(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
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
    setStatus,
    toast,
    error,
    renderFreguesiaStats,
    renderAreaStats,
    renderRadiusStats,
    renderIdentify,
    renderAlojamentoLocalCard,
    renderGlobalStats,
    renderRanking,
    populateFreguesias,
    setupTabs,
    getActiveTab,
    renderDrawMeasure,
    renderDynamicLegend,
    areaToCsvRows,
    downloadCsv,
    downloadJson,
    copyText,
    popupFromProperties,
    shortenModalidade
  };
})();

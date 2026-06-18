window.MapModule = (() => {
  let map;
  let config;
  let baseLayers = {};
  let currentBaseLayer = null;
  let wmsLayers = {};
  let drawnItems;
  let selectedFreguesiaLayer = null;
  let radiusCenter = null;
  let radiusMarker = null;
  let radiusBufferLayer = null;
  let nearMarkers = null;
  let alojamentoMarkers = null;
  let alojamentoGeojsonLoaded = false;
  let effectiveAreaLayer = null;
  let polygonDrawer = null;
  let rectangleDrawer = null;

  const initialCenter = [41.694, -8.846];
  const initialZoom = 11;
  const polygonOptions = { color: '#2563eb', weight: 3, fillOpacity: 0.16 };
  const rectangleOptions = { color: '#2563eb', weight: 3, fillOpacity: 0.16 };

  function initMap(appConfig) {
    config = appConfig;
    map = L.map('map', {
      zoomControl: false,
      preferCanvas: true
    }).setView(initialCenter, initialZoom);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    baseLayers = {
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }),
      carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
      })
    };
    currentBaseLayer = baseLayers.osm.addTo(map);

    const wmsBase = `${config.geoserverUrl}/${config.geoserverWorkspace}/wms`;
    wmsLayers = {
      municipio: makeWms(wmsBase, config.layers.municipio, { opacity: 0.45, zIndex: 330 }),
      freguesias: makeWms(wmsBase, config.layers.freguesias, { opacity: 0.75, zIndex: 340 }),
      alojamentosPorFreguesia: makeWms(wmsBase, config.layers.alojamentosPorFreguesia, { opacity: 0.65, zIndex: 335 }),
      alojamentoLocal: makeWms(wmsBase, config.layers.alojamentoLocal, { opacity: 0.85, zIndex: 360 }),
      bgri: makeWms(wmsBase, config.layers.bgri, { opacity: 0.35, zIndex: 320 }),
      dem: makeWms(wmsBase, config.layers.dem, { opacity: 0.55, zIndex: 300 })
    };

    wmsLayers.municipio.addTo(map);
    wmsLayers.freguesias.addTo(map);
    wmsLayers.alojamentosPorFreguesia.addTo(map);

    drawnItems = new L.FeatureGroup().addTo(map);
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: polygonOptions
        },
        rectangle: {
          shapeOptions: rectangleOptions
        }
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);

    polygonDrawer = new L.Draw.Polygon(map, {
      allowIntersection: false,
      showArea: true,
      shapeOptions: polygonOptions
    });
    rectangleDrawer = new L.Draw.Rectangle(map, {
      shapeOptions: rectangleOptions
    });

    map.on(L.Draw.Event.CREATED, (event) => {
      drawnItems.clearLayers();
      if (effectiveAreaLayer) {
        map.removeLayer(effectiveAreaLayer);
        effectiveAreaLayer = null;
      }
      drawnItems.addLayer(event.layer);
      UI.renderDrawMeasure(calculateDrawMeasure(event.layer));
      UI.byId('areaResult').className = 'result-card muted';
      UI.byId('areaResult').textContent = 'Área desenhada. Executa a análise para cruzar os temas.';
      UI.byId('areaExportTools')?.classList.add('hidden');
      UI.toast('Área desenhada. Podes executar a análise espacial.');
    });

    map.on(L.Draw.Event.EDITED, () => {
      const layer = getFirstDrawnLayer();
      UI.renderDrawMeasure(layer ? calculateDrawMeasure(layer) : null);
      if (effectiveAreaLayer) {
        map.removeLayer(effectiveAreaLayer);
        effectiveAreaLayer = null;
      }
    });

    map.on(L.Draw.Event.DELETED, () => clearDrawings());
    map.on('click', onMapClick);

    nearMarkers = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 42
    }).addTo(map);

    alojamentoMarkers = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 36,
      disableClusteringAtZoom: 16
    });

    bindLayerControls();
    bindBasemapControls();
    bindOpacityControls();

    return map;
  }

  function makeWms(url, layerName, options = {}) {
    return L.tileLayer.wms(url, {
      layers: `${config.geoserverWorkspace}:${layerName}`,
      format: 'image/png',
      transparent: true,
      tiled: true,
      version: '1.1.0',
      attribution: 'GeoServer/PostGIS',
      ...options
    });
  }

  function bindLayerControls() {
    document.querySelectorAll('input[data-layer]').forEach(input => {
      input.addEventListener('change', () => {
        const layer = wmsLayers[input.dataset.layer];
        if (!layer) return;
        if (input.checked) {
          layer.addTo(map);
          if (input.dataset.layer === 'alojamentoLocal') showAlojamentoMarkers();
        } else {
          map.removeLayer(layer);
          if (input.dataset.layer === 'alojamentoLocal') hideAlojamentoMarkers();
        }
      });
    });
  }

  function bindBasemapControls() {
    document.querySelectorAll('input[name="basemap"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        if (currentBaseLayer) map.removeLayer(currentBaseLayer);
        currentBaseLayer = baseLayers[input.value].addTo(map);
        currentBaseLayer.bringToBack();
      });
    });
  }

  function bindOpacityControls() {
    document.querySelectorAll('input[data-opacity-layer]').forEach(input => {
      input.addEventListener('input', () => setLayerOpacity(input.dataset.opacityLayer, Number(input.value) / 100));
    });
  }

  function setLayerOpacity(layerKey, opacity) {
    const layer = wmsLayers[layerKey];
    if (layer) layer.setOpacity(Math.max(0, Math.min(1, opacity)));
  }

  async function onMapClick(event) {
    const activeTab = UI.getActiveTab();
    if (activeTab === 'tab-area') return;

    const { lat, lng } = event.latlng;

    if (activeTab === 'tab-raio') {
      radiusCenter = event.latlng;
      if (radiusMarker) radiusMarker.setLatLng(event.latlng);
      else radiusMarker = L.marker(event.latlng, { title: 'Centro do raio' }).addTo(map);
      UI.byId('radiusResult').className = 'result-card muted';
      UI.byId('radiusResult').textContent = 'Centro definido. Indica o raio e executa a pesquisa.';
    }

    try {
      const data = await API.identify(lat, lng);
      UI.byId('identifyResult').classList.remove('muted');
      UI.byId('identifyResult').innerHTML = UI.renderIdentify(data);

      if (activeTab === 'tab-freguesia' && data.freguesia?.dtmnfr) {
        window.dispatchEvent(new CustomEvent('sigal:freguesia-map-select', { detail: data.freguesia }));
      }
    } catch (err) {
      UI.error(`Identificação falhou: ${err.message}`);
    }
  }

  async function highlightFreguesia(dtmnfr) {
    const feature = await API.freguesiaGeoJSON(dtmnfr);
    if (selectedFreguesiaLayer) map.removeLayer(selectedFreguesiaLayer);
    selectedFreguesiaLayer = L.geoJSON(feature, {
      style: {
        color: '#f97316',
        weight: 4,
        fillColor: '#f97316',
        fillOpacity: 0.12
      }
    }).addTo(map);
    map.fitBounds(selectedFreguesiaLayer.getBounds(), { padding: [24, 24] });
  }

  function getDrawnGeometry() {
    const layer = getFirstDrawnLayer();
    return layer?.toGeoJSON ? layer.toGeoJSON().geometry : null;
  }

  function getFirstDrawnLayer() {
    let found = null;
    drawnItems.eachLayer(layer => {
      if (!found) found = layer;
    });
    return found;
  }

  function clearDrawings() {
    drawnItems.clearLayers();
    if (effectiveAreaLayer) {
      map.removeLayer(effectiveAreaLayer);
      effectiveAreaLayer = null;
    }
    UI.renderDrawMeasure(null);
    UI.byId('areaResult').className = 'result-card muted';
    UI.byId('areaResult').textContent = 'Desenha uma área para iniciar a análise.';
    UI.byId('areaExportTools')?.classList.add('hidden');
  }

  function calculateDrawMeasure(layer) {
    if (!layer) return null;
    const latlngs = extractLatLngs(layer);
    if (!latlngs.length) return null;
    const areaM2 = Math.abs(L.GeometryUtil.geodesicArea(latlngs));
    let perimeterM = 0;
    for (let i = 0; i < latlngs.length; i++) {
      const current = latlngs[i];
      const next = latlngs[(i + 1) % latlngs.length];
      perimeterM += current.distanceTo(next);
    }
    return {
      areaM2,
      areaKm2: areaM2 / 1000000,
      perimeterKm: perimeterM / 1000
    };
  }

  function extractLatLngs(layer) {
    const latlngs = layer.getLatLngs?.();
    if (!latlngs) return [];
    if (Array.isArray(latlngs[0]) && Array.isArray(latlngs[0][0])) return latlngs[0][0];
    if (Array.isArray(latlngs[0])) return latlngs[0];
    return latlngs;
  }


  async function showAlojamentoMarkers() {
    if (!alojamentoMarkers) return;
    if (!map.hasLayer(alojamentoMarkers)) alojamentoMarkers.addTo(map);
    if (alojamentoGeojsonLoaded) return;

    try {
      const data = await API.alojamentosGeoJSON();
      const geojson = data.geojson || data;
      L.geoJSON(geojson, {
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
          radius: 5,
          color: '#b91c1c',
          weight: 1.5,
          fillColor: '#ef4444',
          fillOpacity: 0.88,
          pane: 'markerPane'
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          layer.bindPopup(alojamentoPopupHtml(props), { maxWidth: 320 });
          layer.on('click', (event) => {
            if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            UI.byId('identifyResult').classList.remove('muted');
            UI.byId('identifyResult').innerHTML = UI.renderAlojamentoLocalCard(props);
          });
        }
      }).eachLayer(layer => alojamentoMarkers.addLayer(layer));
      alojamentoGeojsonLoaded = true;
      UI.toast(`${UI.format(data.total || alojamentoMarkers.getLayers().length)} alojamentos locais interativos carregados.`);
    } catch (err) {
      UI.error(`Não foi possível carregar pontos interativos de Alojamento Local: ${err.message}`);
    }
  }

  function hideAlojamentoMarkers() {
    if (alojamentoMarkers && map.hasLayer(alojamentoMarkers)) map.removeLayer(alojamentoMarkers);
  }

  function alojamentoPopupHtml(p) {
    return UI.popupFromProperties(p.denominaca || 'Alojamento Local', [
      ['RNAL', p.nrrnal || '—'],
      ['Modalidade', UI.shortenModalidade(p.modalidade || '—')],
      ['Capacidade', p.nrutentes || '—'],
      ['Freguesia', p.freguesia || '—'],
      ['Concelho', p.concelho || '—'],
      ['Endereço', p.endereco || '—']
    ]);
  }

  async function showRadiusResults(lat, lng, radius) {
    const [near, buffer] = await Promise.all([
      API.near(lat, lng, radius),
      API.buffer(lat, lng, radius)
    ]);

    nearMarkers.clearLayers();
    if (near.geojson && near.geojson.features) {
      L.geoJSON(near.geojson, {
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
          radius: 6,
          color: '#991b1b',
          weight: 1,
          fillColor: '#ef4444',
          fillOpacity: 0.85
        }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(UI.popupFromProperties(p.denominaca || 'Alojamento Local', [
            ['RNAL', p.nrrnal || '—'],
            ['Modalidade', p.modalidade || '—'],
            ['Utentes', p.nrutentes || '—'],
            ['Freguesia', p.freguesia || '—'],
            ['Distância', `${UI.format(p.distancia_m, 1)} m`]
          ]));
        }
      }).eachLayer(layer => nearMarkers.addLayer(layer));
    }

    if (radiusBufferLayer) map.removeLayer(radiusBufferLayer);
    if (buffer.buffer_geojson) {
      radiusBufferLayer = L.geoJSON(buffer.buffer_geojson, {
        style: { color: '#16a34a', weight: 2, fillColor: '#22c55e', fillOpacity: 0.12 }
      }).addTo(map);
      map.fitBounds(radiusBufferLayer.getBounds(), { padding: [30, 30] });
    }

    return near;
  }

  function showEffectiveArea(feature) {
    if (effectiveAreaLayer) {
      map.removeLayer(effectiveAreaLayer);
      effectiveAreaLayer = null;
    }
    if (!feature || !feature.geometry) return;
    effectiveAreaLayer = L.geoJSON(feature, {
      style: {
        color: '#059669',
        weight: 3,
        dashArray: '8 5',
        fillColor: '#10b981',
        fillOpacity: 0.10
      }
    }).addTo(map);
  }

  function startPolygonDrawing() {
    if (!polygonDrawer) return;
    rectangleDrawer?.disable();
    polygonDrawer.enable();
    UI.toast('Desenha o polígono no mapa. Clica no primeiro ponto para terminar.');
  }

  function startRectangleDrawing() {
    if (!rectangleDrawer) return;
    polygonDrawer?.disable();
    rectangleDrawer.enable();
    UI.toast('Arrasta no mapa para criar um retângulo de análise.');
  }

  function resetView() {
    map.setView(initialCenter, initialZoom);
  }

  function getRadiusCenter() {
    return radiusCenter;
  }

  return {
    initMap,
    highlightFreguesia,
    getDrawnGeometry,
    clearDrawings,
    showRadiusResults,
    showEffectiveArea,
    startPolygonDrawing,
    startRectangleDrawing,
    resetView,
    setLayerOpacity,
    showAlojamentoMarkers,
    hideAlojamentoMarkers,
    getRadiusCenter
  };
})();

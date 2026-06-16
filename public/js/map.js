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

  const initialCenter = [41.694, -8.846];
  const initialZoom = 11;

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
          shapeOptions: { color: '#2563eb', weight: 3, fillOpacity: 0.16 }
        },
        rectangle: {
          shapeOptions: { color: '#2563eb', weight: 3, fillOpacity: 0.16 }
        }
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (event) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      UI.toast('Área desenhada. Podes executar a análise espacial.');
    });

    map.on('click', onMapClick);

    nearMarkers = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 42
    }).addTo(map);

    bindLayerControls();
    bindBasemapControls();

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
        if (input.checked) layer.addTo(map);
        else map.removeLayer(layer);
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

  async function onMapClick(event) {
    const { lat, lng } = event.latlng;
    radiusCenter = event.latlng;

    if (radiusMarker) radiusMarker.setLatLng(event.latlng);
    else radiusMarker = L.marker(event.latlng, { title: 'Centro do raio' }).addTo(map);

    try {
      const data = await API.identify(lat, lng);
      UI.byId('identifyResult').classList.remove('muted');
      UI.byId('identifyResult').innerHTML = UI.renderIdentify(data);
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
    let geometry = null;
    drawnItems.eachLayer(layer => {
      if (!geometry && layer.toGeoJSON) geometry = layer.toGeoJSON().geometry;
    });
    return geometry;
  }

  function clearDrawings() {
    drawnItems.clearLayers();
    UI.byId('areaResult').className = 'result-card muted';
    UI.byId('areaResult').textContent = 'Ainda não existe área desenhada.';
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

  function getRadiusCenter() {
    return radiusCenter;
  }

  return {
    initMap,
    highlightFreguesia,
    getDrawnGeometry,
    clearDrawings,
    showRadiusResults,
    getRadiusCenter
  };
})();

window.API = (() => {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'object' ? (payload.error || payload.details || response.statusText) : payload;
      throw new Error(message);
    }
    return payload;
  }

  return {
    getConfig: () => request('/api/config'),
    health: () => request('/api/health'),
    metadata: () => request('/api/metadata'),
    summary: () => request('/api/summary'),
    freguesias: () => request('/api/freguesias'),
    freguesiaGeoJSON: (dtmnfr) => request(`/api/freguesias/${encodeURIComponent(dtmnfr)}/geojson`),
    freguesiaStats: (dtmnfr) => request(`/api/freguesias/${encodeURIComponent(dtmnfr)}/estatisticas`),
    identify: (lat, lng) => request(`/api/identify?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),
    near: (lat, lng, radius) => request(`/api/alojamentos/near?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`),
    alojamentosGeoJSON: () => request('/api/alojamentos/geojson'),
    areaAnalysis: (geometry) => request('/api/analise/area', { method: 'POST', body: JSON.stringify({ geometry }) }),
    buffer: (lat, lng, radius) => request('/api/analise/buffer', { method: 'POST', body: JSON.stringify({ lat, lng, radius }) }),
    ranking: (limit = 10) => request(`/api/ranking/freguesias?limit=${limit}`)
  };
})();

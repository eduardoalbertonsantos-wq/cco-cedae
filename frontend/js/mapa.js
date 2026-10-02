let map;
let markersLayer;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) return;
    
    initMap();
    await loadMapData();
});

function initMap() {
    const mapEl = document.getElementById('mapa') || document.getElementById('map');
    if (!mapEl) return;
    
    // Center around RJ
    map = L.map(mapEl.id).setView([-22.9068, -43.1729], 10);
    
    const layerOsm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap &bull; CEDAE CCO Fiscalização'
    });

    const layerSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri Satélite &bull; CEDAE CCO'
    });

    layerOsm.addTo(map);

    L.control.layers({
        "🗺️ Ruas Detalhadas": layerOsm,
        "🛰️ Satélite Real": layerSatelite
    }, null, { position: 'topright' }).addTo(map);

    setTimeout(() => { if (map) map.invalidateSize(); }, 300);
    
    markersLayer = L.layerGroup().addTo(map);
}

async function loadMapData() {
    try {
        const postos = await apiGet('/mapa/postos');
        const filterSetor = document.getElementById('filterSetor')?.value;
        
        markersLayer.clearLayers();
        let hasCoords = false;
        
        postos.forEach(posto => {
            if (filterSetor && posto.setor_id.toString() !== filterSetor) return;
            
            if (posto.lat && posto.lng) {
                hasCoords = true;
                const audit = classificarAuditoria(posto.horas_sem_fiscalizacao);
                
                const markerOptions = {
                    radius: 8,
                    fillColor: audit.cor,
                    color: '#fff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                };
                
                if (audit.classe === 'critico' || audit.classe === 'nunca') {
                    markerOptions.className = 'pulse-marker';
                }
                
                const marker = L.circleMarker([posto.lat, posto.lng], markerOptions);
                
                marker.bindPopup(`
                    <strong>${posto.nome}</strong><br>
                    Setor: ${posto.setor_nome}<br>
                    Situação: <span style="color:${audit.cor}">${audit.label}</span><br>
                    Última Visita: ${formatDateTime(posto.ultima_fiscalizacao) || 'NUNCA'}<br>
                    Tempo: ${posto.horas_sem_fiscalizacao === Infinity ? '-' : Math.round(posto.horas_sem_fiscalizacao) + 'h'}
                `);
                
                markersLayer.addLayer(marker);
            }
        });
        
        const msgEl = document.getElementById('mapMessage');
        if (!hasCoords && msgEl) {
            msgEl.style.display = 'block';
            msgEl.textContent = 'Nenhum posto com coordenadas cadastradas. Cadastre latitude e longitude nos postos para visualizá-los no mapa.';
        } else if (msgEl) {
            msgEl.style.display = 'none';
        }
        
    } catch (e) {
        showToast('Erro ao carregar mapa', 'error');
    }
}

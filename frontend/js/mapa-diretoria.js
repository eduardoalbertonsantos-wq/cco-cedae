/**
 * MAPA OPERACIONAL DA DIRETORIA — VIATURAS E FISCAIS EM TEMPO REAL
 * CEDAE CCO
 */

let map = null;
let viaturasData = [];
let basesData = [];
let viaturaMarkers = {};
let baseMarkers = {};
let selectedViaturaId = null;
let currentSectorFilter = 'TODOS';
let refreshTimer = null;
let isFullscreen = false;
let initialFitDone = false;

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initMap();
    initEvents();
    carregarDadosMapa();

    // Auto-atualização periódica a cada 10 segundos
    refreshTimer = setInterval(() => {
        carregarDadosMapa(true);
    }, 10000);
});

// Relógio do cabeçalho
function initClock() {
    const el = document.getElementById('mapaClock');
    if (!el) return;
    const update = () => {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    };
    update();
    setInterval(update, 1000);
}

// Inicializar Mapa Leaflet com Camadas do Google Maps
function initMap() {
    if (typeof L === 'undefined') {
        console.warn('Leaflet ainda não carregado, tentando novamente em 150ms...');
        setTimeout(initMap, 150);
        return;
    }

    const container = document.getElementById('mapaPrincipal');
    if (!container) return;

    if (map) {
        try { map.remove(); } catch (e) {}
        map = null;
    }

    // Centro operacional abrangendo Tinguá, Guandu, Laranjal e Rio Centro
    map = L.map('mapaPrincipal', {
        zoomControl: true,
        attributionControl: true
    }).setView([-22.82, -43.35], 10);

    // Camada Google Maps — Ruas (Padrão Google Maps Oficial)
    const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps &bull; CEDAE CCO'
    });

    // Camada Google Maps — Satélite Híbrido (Imagens aéreas com ruas e bairros)
    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps &bull; Imagens Satélite &bull; CEDAE CCO'
    });

    // Camada Google Maps — Relevo e Topografia
    const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps Relevo &bull; CEDAE CCO'
    });

    // Camada Satélite Esri (Alta Resolução e Alta Disponibilidade)
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri Satélite &bull; CEDAE CCO'
    });

    // Camada Alternativa — OpenStreetMap
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap &bull; CEDAE CCO'
    });

    // Iniciar com Google Maps Ruas ativo
    googleStreets.addTo(map);

    // Seletor de Camadas Estilo Google Maps no canto superior direito
    const baseLayers = {
        '🗺️ Google Maps (Ruas)': googleStreets,
        '🛰️ Google Satélite (Híbrido)': googleHybrid,
        '🛰️ Satélite Esri': esriSatellite,
        '🏔️ Google Relevo': googleTerrain,
        '🌐 OpenStreetMap': osmLayer
    };

    L.control.layers(baseLayers, null, {
        position: 'topright',
        collapsed: false
    }).addTo(map);

    // Forçar recálculo de tamanho do Leaflet em cascata para evitar mapa cinza/branco
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    setTimeout(() => { if (map) map.invalidateSize(); }, 350);
    setTimeout(() => { if (map) map.invalidateSize(); }, 1000);

    // Ajustar mapa ao redimensionar a janela
    window.addEventListener('resize', () => {
        if (map) map.invalidateSize();
    });
}

// Configurar Eventos e Controles
function initEvents() {
    // Botão Voltar
    document.getElementById('btnVoltarDiretoria')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'painel-diretoria.html';
    });

    // Botão Atualizar Manual
    document.getElementById('btnRefreshMapa')?.addEventListener('click', () => {
        carregarDadosMapa(false);
    });

    // Botão Modo Tela Cheia / Ampliar Mapa
    const btnFullscreen = document.getElementById('btnAmpliarMapa');
    const btnExitFullscreen = document.getElementById('btnExitFullscreen');

    btnFullscreen?.addEventListener('click', toggleFullscreen);
    btnExitFullscreen?.addEventListener('click', toggleFullscreen);

    // Escutar saída de tela cheia nativa pelo teclado (ESC)
    document.addEventListener('fullscreenchange', handleNativeFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleNativeFullscreenChange);

    // Filtros por Setor
    document.querySelectorAll('.btn-filtro-setor').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.btn-filtro-setor').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSectorFilter = this.getAttribute('data-setor');
            aplicarFiltroSetor();
        });
    });
}

// Alternar Modo Tela Cheia
function toggleFullscreen() {
    const docEl = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        }
        document.body.classList.add('fullscreen-mode');
        isFullscreen = true;
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        document.body.classList.remove('fullscreen-mode');
        isFullscreen = false;
    }

    // Invalidar tamanho do Leaflet imediatamente e após transição
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    setTimeout(() => { if (map) map.invalidateSize(); }, 400);
}

function handleNativeFullscreenChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.body.classList.remove('fullscreen-mode');
        isFullscreen = false;
    } else {
        document.body.classList.add('fullscreen-mode');
        isFullscreen = true;
    }
    setTimeout(() => { if (map) map.invalidateSize(); }, 200);
}

// Carregar Dados da API
async function carregarDadosMapa(silencioso = false) {
    const statusText = document.getElementById('syncStatusText');
    if (!silencioso && statusText) statusText.textContent = 'Carregando posições...';

    try {
        const token = localStorage.getItem('cco_token') || sessionStorage.getItem('cco_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/v1/mapa/viaturas-fiscais', { headers });
        if (!res.ok) {
            if (res.status === 401) {
                window.location.href = 'login.html?sessao_expirada=1';
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Erro ao carregar dados');

        viaturasData = data.viaturas || [];
        basesData = data.bases_setores || [];

        if (!map) {
            initMap();
        }

        renderizarMarcadoresBases();
        renderizarMarcadoresViaturas();
        renderizarCardsSidebar();
        atualizarContadoresResumo();

        if (map) {
            setTimeout(() => { if (map) map.invalidateSize(); }, 150);
            setTimeout(() => { if (map) map.invalidateSize(); }, 500);
        }

        if (statusText) {
            const now = new Date();
            statusText.textContent = `Atualizado às ${now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
        }

    } catch (err) {
        console.warn('Erro ao atualizar mapa operacional:', err.message);
        if (statusText) statusText.textContent = '⚠️ Modo Offline / Tentando reconectar...';
    }
}

// Renderizar Bases Operacionais no Mapa
function renderizarMarcadoresBases() {
    basesData.forEach(b => {
        const baseKey = `base_${b.setor_id}`;
        if (!baseMarkers[baseKey] && b.base && b.base.lat && b.base.lng) {
            const baseIcon = L.divIcon({
                className: 'custom-base-marker',
                html: `
                    <div style="background:${b.cor}; color:#fff; font-size:10px; font-weight:900; padding:3px 7px; border-radius:4px; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.3); display:inline-flex; align-items:center; gap:3px; white-space:nowrap;">
                        🏢 BASE ${b.nome}
                    </div>
                `,
                iconSize: [110, 24],
                iconAnchor: [55, 12]
            });

            const marker = L.marker([b.base.lat, b.base.lng], { icon: baseIcon, zIndexOffset: 100 })
                .addTo(map)
                .bindPopup(`
                    <div style="padding:6px; font-family:sans-serif; min-width:210px;">
                        <h4 style="margin:0 0 4px 0; color:${b.cor}; font-size:14px; font-weight:800;">🏢 ${b.base.label}</h4>
                        <div style="font-size:12px; color:#475569; margin-bottom:4px;">Setor Operacional: <strong>${b.nome}</strong></div>
                        <div style="font-size:11px; color:#64748b; font-family:monospace; margin-bottom:8px;">📍 ${b.base.lat.toFixed(5)}, ${b.base.lng.toFixed(5)}</div>
                        <a href="https://www.google.com/maps/search/?api=1&query=${b.base.lat},${b.base.lng}" target="_blank" rel="noopener noreferrer" class="btn-popup-gmaps">
                            🗺️ Ver no Google Maps ↗
                        </a>
                    </div>
                `);

            baseMarkers[baseKey] = marker;
        }
    });
}

// Renderizar Marcadores de Viaturas
function renderizarMarcadoresViaturas() {
    viaturasData.forEach(v => {
        if (!v.latitude || !v.longitude) return;

        const vtrKey = `vtr_${v.viatura_id}`;
        const cor = v.setor_cor || '#2563eb';
        const isOnline = v.is_online === 1;

        // Ícone visual customizado da viatura
        const vtrIcon = L.divIcon({
            className: 'custom-vtr-marker',
            html: `
                <div class="vtr-marker-bubble ${isOnline ? 'online-pulse' : ''}" style="background:${cor}; border-color:${isOnline ? '#22c55e' : '#ffffff'};">
                    <span style="font-size:13px;">🚗</span>
                    <span>${v.prefixo}</span>
                    <span style="background:rgba(0,0,0,0.3); padding:1px 4px; border-radius:3px; font-size:9px;">${v.placa}</span>
                </div>
                <div class="vtr-marker-pin" style="border-top-color:${cor};"></div>
            `,
            iconSize: [140, 36],
            iconAnchor: [70, 36],
            popupAnchor: [0, -36]
        });

        const popupContent = `
            <div style="min-width:230px; font-family:sans-serif; padding:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ${cor}; padding-bottom:6px; margin-bottom:8px;">
                    <div>
                        <div style="font-size:14px; font-weight:900; color:#002B49;">${v.prefixo}</div>
                        <div style="font-size:11px; color:#64748b;">${v.tipo_modelo} &bull; <strong style="color:#0f172a;">${v.placa}</strong></div>
                    </div>
                    <span style="background:${v.setor_cor}22; color:${v.setor_cor}; font-size:10px; font-weight:900; padding:2px 6px; border-radius:4px; border:1px solid ${v.setor_cor}44;">
                        ${v.setor_nome}
                    </span>
                </div>
                <div style="font-size:12px; margin-bottom:5px;">
                    👮 <strong>Fiscal:</strong> <span style="color:#0369a1; font-weight:700;">${v.fiscal_responsavel}</span>
                </div>
                <div style="font-size:11px; margin-bottom:5px; color:#334155;">
                    📍 <strong>Localização:</strong> ${v.ultimo_posto}
                </div>
                <div style="font-size:10px; color:#64748b; margin-bottom:5px; font-family:monospace;">
                    🌐 <strong>GPS:</strong> ${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}
                </div>
                <div style="font-size:10px; color:#64748b; margin-bottom:8px;">
                    ⏰ <strong>Última Posição:</strong> ${v.hora_formatada || '-'}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:800; margin-bottom:10px;">
                    <span style="color:${isOnline ? '#16a34a' : '#dc2626'};">
                        ${v.status_badge}
                    </span>
                    <span style="color:#64748b; font-size:9px;">
                        ${v.tem_gps_real ? '🛰️ GPS Real' : '🏢 Base Operacional'}
                    </span>
                </div>
                <div style="border-top:1px dashed #cbd5e1; padding-top:8px; text-align:center;">
                    <a href="https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="btn-popup-gmaps">
                        🗺️ Abrir Rota no Google Maps ↗
                    </a>
                </div>
            </div>
        `;

        if (viaturaMarkers[vtrKey]) {
            // Atualizar posição existente suavemente
            viaturaMarkers[vtrKey].setLatLng([v.latitude, v.longitude]);
            viaturaMarkers[vtrKey].setIcon(vtrIcon);
            viaturaMarkers[vtrKey].setPopupContent(popupContent);
        } else {
            // Criar novo marcador
            const marker = L.marker([v.latitude, v.longitude], {
                icon: vtrIcon,
                zIndexOffset: 500
            }).addTo(map).bindPopup(popupContent);

            marker.on('click', () => {
                selecionarViatura(v.viatura_id, false);
            });

            viaturaMarkers[vtrKey] = marker;
        }
    });

    // Ajustar enquadramento inicial para incluir todas as viaturas apenas na primeira carga
    if (!initialFitDone && viaturasData.length > 0 && map) {
        const coords = viaturasData
            .filter(v => typeof v.latitude === 'number' && typeof v.longitude === 'number')
            .map(v => [v.latitude, v.longitude]);
        if (coords.length > 0) {
            try {
                map.fitBounds(coords, { padding: [40, 40], maxZoom: 12 });
                initialFitDone = true;
            } catch (e) {}
        }
    }

    aplicarFiltroSetor();
}

// Renderizar Cards na Barra Lateral
function renderizarCardsSidebar() {
    const container = document.getElementById('sidebarViaturasContainer');
    if (!container) return;

    let lista = viaturasData;
    if (currentSectorFilter !== 'TODOS') {
        const sId = parseInt(currentSectorFilter, 10);
        lista = lista.filter(v => v.setor_id === sId);
    }

    if (lista.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:1.5rem; color:#64748b; font-size:0.85rem;">
                ⚪ Nenhuma viatura encontrada para este filtro.
            </div>
        `;
        return;
    }

    container.innerHTML = lista.map(v => {
        const isSelected = String(selectedViaturaId) === String(v.viatura_id);
        const isOnline = v.is_online === 1;

        return `
            <div class="viatura-card ${isSelected ? 'selected' : ''}" 
                 id="card_vtr_${v.viatura_id}"
                 data-vtr-id="${v.viatura_id}">
                <div class="viatura-card-header">
                    <div>
                        <div class="viatura-prefixo">
                            <span>🚗</span> ${v.prefixo}
                        </div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:1px;">
                            ${v.tipo_modelo}
                        </div>
                    </div>
                    <span class="viatura-placa">${v.placa}</span>
                </div>

                <div class="viatura-fiscal">
                    <span>👮</span> ${v.fiscal_responsavel}
                </div>

                <div>
                    <span class="viatura-setor-badge" style="background:${v.setor_cor}18; color:${v.setor_cor}; border:1px solid ${v.setor_cor}33;">
                        ${v.setor_emoji} ${v.setor_nome}
                    </span>
                </div>

                <div class="viatura-local">
                    <span>📍</span> <span>${v.ultimo_posto}</span>
                </div>

                <div class="viatura-footer">
                    <div>
                        <span style="font-weight:800; color:${isOnline ? '#16a34a' : '#dc2626'};">
                            ${isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
                        </span>
                        <span style="color:#94a3b8; margin-left:4px;">${v.hora_formatada ? `(${v.hora_formatada})` : ''}</span>
                    </div>
                    <button type="button" class="btn-localizar" data-vtr-id="${v.viatura_id}">
                        Localizar ➔
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Adicionar eventos com addEventListener para 100% de confiabilidade em qualquer navegador
    container.querySelectorAll('.viatura-card').forEach(card => {
        const vId = card.getAttribute('data-vtr-id');
        card.addEventListener('click', () => selecionarViatura(vId, true));
    });

    container.querySelectorAll('.btn-localizar').forEach(btn => {
        const vId = btn.getAttribute('data-vtr-id');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selecionarViatura(vId, true);
        });
    });
}

// Selecionar e Focar na Viatura
function selecionarViatura(vtrId, focarNoMapa = true) {
    if (!vtrId) return;
    selectedViaturaId = vtrId;

    // 1. Atualizar destaque visual dos cards na barra lateral
    document.querySelectorAll('.viatura-card').forEach(c => c.classList.remove('selected'));
    const activeCard = document.getElementById(`card_vtr_${vtrId}`);
    if (activeCard) {
        activeCard.classList.add('selected');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 2. Localizar o objeto da viatura com conversão flexível de ID
    const vtr = viaturasData.find(v => String(v.viatura_id) === String(vtrId));
    if (!vtr) {
        console.warn('Viatura não encontrada nos dados:', vtrId);
        return;
    }

    const lat = parseFloat(vtr.latitude);
    const lng = parseFloat(vtr.longitude);

    if (isNaN(lat) || isNaN(lng)) {
        console.warn('Coordenadas indisponíveis para focar a viatura:', vtr);
        return;
    }

    // 3. Focar no mapa com transição suave (flyTo) e abrir o popup
    if (map && focarNoMapa) {
        const markerKey = `vtr_${vtr.viatura_id}`;
        const marker = viaturaMarkers[markerKey];

        // Se o marcador estiver oculto por filtro de setor, recolocá-lo no mapa
        if (marker && !map.hasLayer(marker)) {
            map.addLayer(marker);
        }

        // flyTo suave estilo Google Maps
        map.flyTo([lat, lng], 16, {
            animate: true,
            duration: 1.0
        });

        // Abrir popup informativo com os dados da viatura
        setTimeout(() => {
            if (marker) {
                marker.openPopup();
            }
        }, 500);
    }
}

// Expor globalmente para suporte a chamadas diretas
window.selecionarViatura = selecionarViatura;

// Aplicar Filtro de Setor
function aplicarFiltroSetor() {
    renderizarCardsSidebar();

    viaturasData.forEach(v => {
        const marker = viaturaMarkers[`vtr_${v.viatura_id}`];
        if (!marker) return;

        if (currentSectorFilter === 'TODOS') {
            if (!map.hasLayer(marker)) map.addLayer(marker);
        } else {
            const sId = parseInt(currentSectorFilter, 10);
            if (v.setor_id === sId) {
                if (!map.hasLayer(marker)) map.addLayer(marker);
            } else {
                if (map.hasLayer(marker)) map.removeLayer(marker);
            }
        }
    });

    // Se filtrou um setor específico, centralizar na base dele
    if (currentSectorFilter !== 'TODOS') {
        const sId = parseInt(currentSectorFilter, 10);
        const base = basesData.find(b => b.setor_id === sId);
        if (base && base.base && base.base.lat && base.base.lng && map) {
            map.setView([base.base.lat, base.base.lng], 11, { animate: true });
        }
    }
}

// Atualizar Contadores do Topo
function atualizarContadoresResumo() {
    const totalEl = document.getElementById('countTotalViaturas');
    const onlineEl = document.getElementById('countViaturasOnline');
    
    if (totalEl) totalEl.textContent = `${viaturasData.length} Viaturas`;
    if (onlineEl) {
        const onlineCount = viaturasData.filter(v => v.is_online === 1).length;
        onlineEl.textContent = `${onlineCount} Online`;
    }
}

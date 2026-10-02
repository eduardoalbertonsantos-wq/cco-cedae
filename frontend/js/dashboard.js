let chartSituacao = null;
let chartSetores = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }
    
    await carregarFiltrosDashboard();
    await atualizarDashboard();
    setupDashboardListeners();
    await initMapaOperacional();
    
    // Atualização em tempo real do painel a cada 30 segundos
    setInterval(atualizarDashboard, 30 * 1000);
    // Atualização em tempo real do mapa a cada 15 segundos
    setInterval(carregarPosicoesMapa, 15 * 1000);
});

async function carregarFiltrosDashboard() {
    try {
        const setores = await apiGet('/setores?apenas_ativos=true');
        const selectSetor = document.getElementById('filterSetor');
        if (selectSetor && setores) {
            selectSetor.innerHTML = '<option value="">Todos os Setores (Geral)</option>';
            setores.forEach(s => {
                selectSetor.innerHTML += `<option value="${s.id}">${s.nome}</option>`;
            });
            selectSetor.innerHTML += '<option value="sem_setor">⚠️ SEM SETOR (Aguardando Classificação)</option>';
        }
    } catch (e) {
        console.error('Erro ao carregar filtros:', e);
    }
}

let listaPostosSemanal = [];
let filtroSemanalAtivo = 'sem_vistoria';

function setupDashboardListeners() {
    const filters = ['filterPeriodo', 'filterSetor', 'filterTurno'];
    filters.forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            if (id === 'filterPeriodo') {
                const customDiv = document.getElementById('customDateGroup');
                if (customDiv) {
                    customDiv.style.display = e.target.value === 'personalizado' ? 'flex' : 'none';
                    if (e.target.value === 'personalizado') return;
                }
            }
            atualizarDashboard();
        });
    });

    document.getElementById('applyDatesBtn')?.addEventListener('click', atualizarDashboard);
    document.getElementById('btnRefreshDashboard')?.addEventListener('click', async () => {
        showToast('Atualizando dados...', 'info');
        await atualizarDashboard();
        showToast('✓ Dados atualizados com sucesso.', 'success');
    });

    // Listeners dos botões de filtro semanal
    document.querySelectorAll('#filtroBotoesSemanal .btn-filter-semanal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#filtroBotoesSemanal .btn-filter-semanal').forEach(b => {
                b.classList.remove('active');
                b.style.background = b.dataset.filter === 'critico' ? '#fef2f2' : (b.dataset.filter === 'atencao' ? '#fffbeb' : (b.dataset.filter === 'em_dia' ? '#f0fdf4' : '#f1f5f9'));
                b.style.color = b.dataset.filter === 'critico' ? '#dc2626' : (b.dataset.filter === 'atencao' ? '#d97706' : (b.dataset.filter === 'em_dia' ? '#16a34a' : '#2563eb'));
            });
            btn.classList.add('active');
            btn.style.background = '#2563eb';
            btn.style.color = '#ffffff';
            filtroSemanalAtivo = btn.dataset.filter;
            renderizarAcompanhamentoSemanal(listaPostosSemanal, filtroSemanalAtivo);
        });
    });
}

function montarQueryFiltros() {
    const params = new URLSearchParams();
    const periodo = document.getElementById('filterPeriodo')?.value || 'hoje';
    
    if (periodo === 'personalizado') {
        const inicio = document.getElementById('dateStart')?.value;
        const fim = document.getElementById('dateEnd')?.value;
        if (inicio) params.append('data_inicio', inicio);
        if (fim) params.append('data_fim', fim);
        params.append('periodo', 'personalizado');
    } else {
        params.append('periodo', periodo);
    }

    const setorId = document.getElementById('filterSetor')?.value;
    if (setorId) params.append('setor_id', setorId);

    const turno = document.getElementById('filterTurno')?.value;
    if (turno) params.append('turno', turno);

    return params.toString();
}

async function atualizarDashboard() {
    const query = montarQueryFiltros();
    try {
        const stats = await apiGet(`/dashboard/stats?${query}`);
        
        // 1. Atualizar os Cards Oficiais
        atualizarCard('statPostosCadastrados', stats.postos_cadastrados);
        atualizarCard('statPostosSupervisionados', stats.postos_supervisionados);
        atualizarCard('statPostosNaoSupervisionados', stats.postos_nao_supervisionados);
        atualizarCard('statPostosPendentes', stats.postos_pendentes);
        atualizarCard('statPercentualSupervisao', `${stats.percentual_supervisao}%`);
        atualizarCard('statSupervisoresAtivos', stats.supervisores_ativos);
        atualizarCard('statViaturasAtivas', stats.viaturas_ativas);
        atualizarCard('statComOcorrencia', stats.postos_com_ocorrencia ?? 0);
        atualizarCard('statSemOcorrencia', stats.postos_sem_ocorrencia ?? 0);
        atualizarCard('statOcorrencias', stats.total_ocorrencias);
        atualizarCard('statSemVistoriaSemana', stats.postos_sem_vistoria_semana ?? 0);

        // Atualizar Badges de Acompanhamento Semanal
        const bTodos = document.getElementById('badgeSemanalTodos');
        const bCriticos = document.getElementById('badgeSemanalCriticos');
        const bAtencao = document.getElementById('badgeSemanalAtencao');
        const bEmDia = document.getElementById('badgeSemanalEmDia');
        if (bTodos) bTodos.textContent = stats.postos_sem_vistoria_semana ?? 0;
        if (bCriticos) bCriticos.textContent = stats.postos_criticos_semana ?? 0;
        if (bAtencao) bAtencao.textContent = stats.postos_atencao_semana ?? 0;
        if (bEmDia) bEmDia.textContent = stats.postos_em_dia_semana ?? 0;

        // Armazenar lista semanal e renderizar tabela
        listaPostosSemanal = stats.postos_acompanhamento_semanal || [];
        renderizarAcompanhamentoSemanal(listaPostosSemanal, filtroSemanalAtivo);

        // Atualizar Último Relatório Enviado
        const ult = stats.ultimo_relatorio;
        const ultTexto = document.getElementById('ultimoRelatorioTexto');
        const ultData = document.getElementById('ultimoRelatorioData');
        if (ult && ultTexto) {
            const sup = ult.supervisor_nome || ult.responsavel_nome || 'N/A';
            const vtr = ult.viatura_modelo || ult.viatura_outros_texto || 'VTR';
            ultTexto.textContent = `${ult.setor_nome} — Turno ${ult.turno} | Fiscal: ${sup} | Vtr: ${vtr} (${ult.viatura_placa || 'N/A'})`;
            if (ultData) ultData.textContent = `📅 ${formatDate(ult.data_servico)} (#${ult.id})`;
        } else if (ultTexto) {
            ultTexto.textContent = 'Nenhum relatório recente encontrado';
            if (ultData) ultData.textContent = '-';
        }

        // 2. Renderizar Painel Específico por Setor
        renderizarPainelPorSetor(stats.status_setores);

        // 3. Renderizar Gráficos
        renderizarGraficos(stats);

    } catch (e) {
        console.error('Erro ao atualizar dashboard CEDAE:', e);
        if (e.message && (e.message.includes('401') || e.message.includes('Acesso negado') || e.message.includes('Token'))) {
            clearAuth();
            window.location.href = '/login.html?sessao_expirada=1';
        }
    }
}

function renderizarAcompanhamentoSemanal(lista, filtro) {
    const tbody = document.getElementById('tbodyAcompanhamentoSemanal');
    if (!tbody) return;

    let filtrados = lista || [];
    if (filtro === 'critico') {
        filtrados = filtrados.filter(p => p.status_vistoria === 'CRITICO');
    } else if (filtro === 'atencao') {
        filtrados = filtrados.filter(p => p.status_vistoria === 'ATENCAO');
    } else if (filtro === 'em_dia') {
        filtrados = filtrados.filter(p => p.status_vistoria === 'EM_DIA');
    } else if (filtro === 'sem_vistoria') {
        filtrados = filtrados.filter(p => p.status_vistoria === 'CRITICO' || p.status_vistoria === 'ATENCAO');
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#16a34a; font-weight:700;">✅ Nenhum posto pendente para este filtro! Todos os postos estão em conformidade.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(p => {
        let badgeStatus = '';
        let corDias = '#16a34a';
        let textoDias = `${p.dias_sem_vistoria} dias`;

        if (p.status_vistoria === 'CRITICO') {
            badgeStatus = '<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700; border:1px solid #fca5a5;">🔴 CRÍTICO</span>';
            corDias = '#dc2626';
            if (p.dias_sem_vistoria === null) {
                textoDias = '<span style="color:#dc2626; font-weight:800;">🚨 NUNCA VISTORIADO</span>';
            }
        } else if (p.status_vistoria === 'ATENCAO') {
            badgeStatus = '<span class="badge" style="background:#fef3c7; color:#b45309; font-weight:700; border:1px solid #fcd34d;">🟠 ATENÇÃO</span>';
            corDias = '#d97706';
        } else {
            badgeStatus = '<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700; border:1px solid #86efac;">🟢 EM DIA</span>';
            corDias = '#16a34a';
        }

        const dataVistoriaTexto = p.ultima_data_vistoria 
            ? `${formatDate(p.ultima_data_vistoria)} ${p.ultimo_horario ? `<br><small style="color:#64748b;">às ${p.ultimo_horario}</small>` : ''}`
            : '<span style="color:#94a3b8; font-style:italic;">Sem histórico</span>';

        return `
            <tr style="border-bottom:1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding:0.75rem; font-weight:700; color:var(--cco-navy);">
                    ${p.nome}
                    <div style="font-size:0.75rem; color:#64748b; font-weight:normal;">${p.tipo_posto || 'Posto Operacional'} &bull; ${p.empresa || 'CEDAE'}</div>
                </td>
                <td style="padding:0.75rem;">
                    <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${p.setor_nome}</span>
                </td>
                <td style="padding:0.75rem; text-align:center; font-weight:800; color:${corDias};">
                    ${textoDias}
                </td>
                <td style="padding:0.75rem; text-align:center; font-size:0.85rem; font-weight:600;">
                    ${dataVistoriaTexto}
                </td>
                <td style="padding:0.75rem; font-size:0.85rem; color:#334155;">
                    👮 ${p.ultimo_supervisor}
                </td>
                <td style="padding:0.75rem; text-align:center;">
                    ${badgeStatus}
                </td>
            </tr>
        `;
    }).join('');
}


function atualizarCard(id, valor, idFallback) {
    const el = document.getElementById(id) || document.getElementById(idFallback);
    if (el) el.textContent = valor !== undefined ? valor : 0;
}

// Renderiza os blocos dos setores: CCO TINGUÁ, CCO GUANDU, CCO LARANJAL, PLANTÃO
function renderizarPainelPorSetor(setores) {
    const container = document.getElementById('setorGridContainer');
    if (!container || !setores) return;

    container.innerHTML = '';
    setores.forEach(s => {
        let statusBadge = '<span class="badge badge-green">NORMAL</span>';
        let borderColor = '#22c55e';
        
        if (s.status_operacional === 'PENDENCIA') {
            statusBadge = '<span class="badge badge-yellow">PENDÊNCIA</span>';
            borderColor = '#eab308';
        } else if (s.status_operacional === 'SEM_REGISTRO') {
            statusBadge = '<span class="badge" style="background:#cbd5e1; color:#334155;">SEM PLANTÃO HOJE</span>';
            borderColor = '#cbd5e1';
        }

        const box = document.createElement('div');
        box.className = 'setor-box';
        box.style.borderTop = `4px solid ${borderColor}`;
        box.innerHTML = `
            <div class="setor-box-header">
                <span class="setor-box-title">${s.nome}</span>
                ${statusBadge}
            </div>
            
            <div class="setor-box-meta">
                <strong>👮 Fiscal de Serviço:</strong> ${s.supervisor_atual || 'Não designado'}
            </div>
            <div class="setor-box-meta">
                <strong>🚗 Viatura Utilizada:</strong> ${s.viatura_atual || 'Nenhuma'}
            </div>
            <div class="setor-box-meta">
                <strong>📅 Último Expediente:</strong> ${s.ultimo_relatorio_data ? formatDate(s.ultimo_relatorio_data) : 'Nenhum'} ${s.ultimo_relatorio_turno ? `(${s.ultimo_relatorio_turno})` : ''}
            </div>
            
            <div class="setor-box-badges">
                ${s.id === 4 || (s.nome && s.nome.includes('PLANT')) ? `
                    <span class="badge badge-primary" style="background:#fef3c7; color:#d97706; border:1px solid #fde68a;">📍 Postos Próprios: ${s.postos_cadastrados || 30}</span>
                    <span class="badge" style="background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd;">🌐 Fiscalização Operacional: 61 Postos</span>
                ` : `
                    <span class="badge badge-primary">📍 Quantidade de Postos: ${s.postos_cadastrados}</span>
                `}
                <span class="badge badge-green">🟢 ${s.postos_supervisionados} Fiscalizados</span>
                ${s.postos_nao_supervisionados > 0 ? `<span class="badge badge-red">🔴 ${s.postos_nao_supervisionados} Não Atendidos</span>` : ''}
                ${s.ocorrencias > 0 ? `<span class="badge badge-red">🚨 ${s.ocorrencias} Ocorrências</span>` : ''}
                ${s.pendencias > 0 ? `<span class="badge badge-yellow">⚠️ ${s.pendencias} Pendências</span>` : ''}
            </div>

            <div style="margin-top: 1rem; border-top: 1px solid #f1f5f9; padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap:0.5rem;">
                <a href="organizacao-postos.html" style="font-size:0.8rem; font-weight:700; color:var(--cco-blue); text-decoration:none;">🗂️ Ver Lista dos Postos &rarr;</a>
                <a href="plantoes.html?setor=${s.id}" style="font-size:0.8rem; font-weight:600; color:#64748b; text-decoration:none;">Histórico de Plantões</a>
            </div>
        `;
        container.appendChild(box);
    });
}

function renderizarGraficos(stats) {
    if (typeof Chart === 'undefined') return;
    // 1. Gráfico de Situação dos Postos (Doughnut)
    const ctxSit = document.getElementById('chart-situacao-postos')?.getContext('2d');
    if (ctxSit) {
        if (chartSituacao) chartSituacao.destroy();
        
        const labels = (stats.grafico_situacao || []).map(g => g.status_supervisao);
        const data = (stats.grafico_situacao || []).map(g => g.total);
        
        chartSituacao = new Chart(ctxSit, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Sem dados'],
                datasets: [{
                    data: data.length ? data : [1],
                    backgroundColor: ['#22c55e', '#64748b', '#eab308', '#ef4444', '#cbd5e1']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // 2. Gráfico de Postos por Setor (Bar)
    const ctxSet = document.getElementById('chart-postos-setores')?.getContext('2d');
    if (ctxSet) {
        if (chartSetores) chartSetores.destroy();
        
        const labels = (stats.grafico_setores || []).map(g => g.setor);
        const data = (stats.grafico_setores || []).map(g => g.fiscalizados);
        
        chartSetores = new Chart(ctxSet, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Postos Fiscalizados',
                    data: data,
                    backgroundColor: '#2563eb',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

// ==================== MAPA OPERACIONAL (LEAFLET + GPS DOS FISCAIS) ====================
let mapaCCO = null;
let layerFiscais = null;
let layerBases = null;
let layerPostos = null;

async function initMapaOperacional() {
    const mapContainer = document.getElementById('mapaOperacionalCCO');
    if (!mapContainer || typeof L === 'undefined') return;

    try {
        if (!mapaCCO) {
            // Centro na Região Metropolitana do Rio de Janeiro
            mapaCCO = L.map('mapaOperacionalCCO', {
                center: [-22.85, -43.35],
                zoom: 10,
                zoomControl: true
            });

            // Mapa Real Google Maps (Ruas, Vias e Avenidas sem bloqueio)
            const layerGoogleRuas = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                attribution: '&copy; Google Maps &bull; CEDAE CCO Fiscalização'
            });

            const layerGoogleSatelite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                attribution: '&copy; Google Satélite &bull; CEDAE CCO Fiscalização'
            });

            const layerEsriRuas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: '&copy; Esri World Street Map &bull; CEDAE CCO Fiscalização'
            });

            // Ativar Google Ruas como padrão oficial
            layerGoogleRuas.addTo(mapaCCO);

            // Controle de alternância de visualização para o usuário (Ruas / Satélite)
            L.control.layers({
                "🗺️ Google Ruas": layerGoogleRuas,
                "🛰️ Google Satélite": layerGoogleSatelite,
                "🏛️ Esri Vias": layerEsriRuas
            }, null, { position: 'topright' }).addTo(mapaCCO);

            layerBases = L.layerGroup().addTo(mapaCCO);
            layerPostos = L.layerGroup().addTo(mapaCCO);
            layerFiscais = L.layerGroup().addTo(mapaCCO);

            document.getElementById('btnRecarregarMapa')?.addEventListener('click', async () => {
                const btn = document.getElementById('btnRecarregarMapa');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = '🔄 Atualizando...';
                }
                await carregarPosicoesMapa();
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🔄 Atualizar Mapa';
                }
            });
        }

        await carregarPosicoesMapa();
    } catch (err) {
        console.error('Erro ao inicializar Mapa Operacional:', err);
    }
}

async function carregarPosicoesMapa() {
    if (!mapaCCO || !layerFiscais) return;

    const statusElem = document.getElementById('mapaStatusAtualizacao');
    if (statusElem) statusElem.textContent = '🔄 Atualizando...';

    try {
        const res = await apiGet('/mapa/posicoes');
        if (!res || !res.success) throw new Error('Dados inválidos retornados pela API');

        // Atualizar contadores
        const resumo = res.resumo_status || {};
        if (document.getElementById('badgeTotalOnline')) document.getElementById('badgeTotalOnline').textContent = resumo.online || 0;
        if (document.getElementById('badgeTotalAntiga')) document.getElementById('badgeTotalAntiga').textContent = resumo.antiga || 0;
        if (document.getElementById('badgeTotalOffline')) document.getElementById('badgeTotalOffline').textContent = resumo.offline || 0;
        if (document.getElementById('badgeTotalGpsNegado')) document.getElementById('badgeTotalGpsNegado').textContent = resumo.gps_nao_autorizado || 0;

        // Limpar camadas
        layerBases.clearLayers();
        layerPostos.clearLayers();
        layerFiscais.clearLayers();

        // 1. Plotar Bases dos 4 Setores (🏢 Setor)
        (res.bases_setores || []).forEach(b => {
            if (b.base && b.base.lat && b.base.lng) {
                const baseIcon = L.divIcon({
                    className: 'custom-base-icon',
                    html: `<div style="background:#0a1628; border:2px solid ${b.cor}; color:#fff; border-radius:6px; padding:3px 6px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:4px; box-shadow:0 3px 6px rgba(0,0,0,0.3); white-space:nowrap;">
                            <span>🏢</span> ${b.nome}
                           </div>`,
                    iconSize: [120, 26],
                    iconAnchor: [60, 13]
                });

                const marker = L.marker([b.base.lat, b.base.lng], { icon: baseIcon });
                marker.bindPopup(`
                    <div style="font-family:system-ui,sans-serif; min-width:180px;">
                        <strong style="color:${b.cor}; font-size:1rem; display:block; margin-bottom:4px;">🏢 ${b.base.label}</strong>
                        <div style="font-size:0.85rem; color:#475569;">Setor Operacional: <strong>${b.nome}</strong></div>
                    </div>
                `);
                layerBases.addLayer(marker);
            }
        });

        // 2. Plotar Postos que possuam coordenadas cadastradas (📍 Posto)
        (res.postos || []).forEach(p => {
            if (p.latitude && p.longitude) {
                const postoIcon = L.divIcon({
                    className: 'custom-posto-icon',
                    html: `<div style="background:#ffffff; border:1px solid #0284c7; color:#0284c7; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.2);">📍</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });

                const marker = L.marker([p.latitude, p.longitude], { icon: postoIcon });
                marker.bindPopup(`
                    <div style="font-family:system-ui,sans-serif; min-width:180px;">
                        <strong style="font-size:0.95rem; color:#0f172a; display:block; margin-bottom:4px;">📍 ${p.nome}</strong>
                        <div style="font-size:0.85rem; color:#64748b;">Setor: ${p.setor_nome || 'Geral'}</div>
                        ${p.endereco ? `<div style="font-size:0.8rem; color:#475569; margin-top:4px;">${p.endereco}</div>` : ''}
                    </div>
                `);
                layerPostos.addLayer(marker);
            }
        });

        // 3. Plotar Fiscais (👤 Fiscal)
        const listaCardsHtml = [];
        (res.fiscais || []).forEach(f => {
            const hasCoords = f.latitude && f.longitude && f.status !== 'gps_nao_autorizado';

            if (hasCoords) {
                const pulseColor = f.status_cor;
                const fiscalIcon = L.divIcon({
                    className: 'custom-fiscal-icon',
                    html: `
                        <div style="position:relative; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
                            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:${pulseColor}; opacity:0.35; transform:scale(1.2);"></div>
                            <div style="width:28px; height:28px; border-radius:50%; background:#ffffff; border:3px solid ${pulseColor}; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); font-size:14px; position:relative; z-index:2;">
                                👤
                            </div>
                            <div style="position:absolute; bottom:-3px; right:-3px; width:12px; height:12px; border-radius:50%; background:${f.setor_cor}; border:2px solid #ffffff; z-index:3;"></div>
                        </div>
                    `,
                    iconSize: [34, 34],
                    iconAnchor: [17, 17]
                });

                const marker = L.marker([f.latitude, f.longitude], { icon: fiscalIcon });
                marker.bindPopup(`
                    <div style="font-family:system-ui,sans-serif; min-width:210px; padding:2px;">
                        <div style="font-weight:800; font-size:0.95rem; color:#0f172a; margin-bottom:6px; border-bottom:2px solid ${f.setor_cor}; padding-bottom:3px; display:flex; align-items:center; gap:5px;">
                            <span>👤</span> ${f.nome}
                        </div>
                        <div style="font-size:0.85rem; margin-bottom:3px; color:#334155;">
                            <strong>Setor:</strong> <span style="font-weight:700; color:${f.setor_cor};">${f.setor}</span>
                        </div>
                        <div style="font-size:0.85rem; margin-bottom:3px; color:#334155;">
                            <strong>Status:</strong> <span style="font-weight:700; color:${f.status_cor};">${f.status_badge}</span>
                        </div>
                        <div style="font-size:0.85rem; margin-bottom:3px; color:#334155;">
                            <strong>Última atualização:</strong> ${f.hora_formatada} (${f.minutos_atras} min atrás)
                        </div>
                        <div style="font-size:0.85rem; color:#334155;">
                            <strong>Precisão:</strong> ${f.tem_gps_real ? (f.accuracy ? f.accuracy + ' metros (GPS Real)' : 'GPS em Tempo Real') : '📡 Conectando satélites (Base do Setor)'}
                        </div>
                    </div>
                `);
                layerFiscais.addLayer(marker);
            }

            // Gerar card para a lista de acompanhamento logo abaixo do mapa
            listaCardsHtml.push(`
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid ${f.setor_cor}; border-radius:0.5rem; padding:0.6rem 0.85rem; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="color:#0f172a; font-size:0.88rem;">👤 ${f.nome}</strong>
                        <span style="font-size:0.75rem; font-weight:700; color:${f.status_cor};">${f.status_badge}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:#64748b;">
                        <span><strong style="color:${f.setor_cor};">${f.setor}</strong></span>
                        <span>🕒 ${f.hora_formatada} (${f.minutos_atras} min)</span>
                    </div>
                    <div style="font-size:0.75rem; color:#475569; margin-top:2px; display:flex; justify-content:space-between;">
                        <span>📡 Precisão: ${f.accuracy ? f.accuracy + 'm' : (hasCoords ? 'Padrão' : 'Sem GPS')}</span>
                        ${hasCoords ? `<button type="button" onclick="focarFiscalNoMapa(${f.latitude}, ${f.longitude})" style="background:none; border:none; color:#2563eb; font-weight:700; cursor:pointer; padding:0; font-size:0.75rem;">Ver no Mapa 📍</button>` : ''}
                    </div>
                </div>
            `);
        });

        const listContainer = document.getElementById('containerListaFiscaisMapa');
        if (listContainer) {
            if (listaCardsHtml.length > 0) {
                listContainer.innerHTML = listaCardsHtml.join('');
            } else {
                listContainer.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:0.75rem; color:#94a3b8; font-size:0.85rem;">Nenhum fiscal com sessão ativa no momento.</div>';
            }
        }

        if (statusElem) {
            const agora = new Date().toLocaleTimeString('pt-BR');
            statusElem.textContent = `✓ Atualizado às ${agora}`;
        }
    } catch (error) {
        console.error('Erro ao carregar posições do mapa:', error);
        if (statusElem) statusElem.textContent = '⚠️ Erro ao atualizar posições';
    }
}

window.focarFiscalNoMapa = function(lat, lng) {
    if (mapaCCO && lat && lng) {
        mapaCCO.setView([lat, lng], 14, { animate: true });
    }
};


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
    
    // Atualização em tempo real a cada 30 segundos
    setInterval(atualizarDashboard, 30 * 1000);
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
            ultTexto.textContent = `${ult.setor_nome} — Turno ${ult.turno} | Sup: ${sup} | Vtr: ${vtr} (${ult.viatura_placa || 'N/A'})`;
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
                <strong>👮 Supervisor de Serviço:</strong> ${s.supervisor_atual || 'Não designado'}
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
                    <span class="badge" style="background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd;">🌐 Supervisão Operacional: 59 Postos</span>
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
                    label: 'Postos Supervisionados',
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

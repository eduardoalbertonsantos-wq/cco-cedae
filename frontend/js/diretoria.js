/* =========================================================================
   CCO — PAINEL EXECUTIVO DA DIRETORIA
   Controlador Frontend • Somente Leitura • Tempo Real
   ========================================================================= */

let evolucaoChart = null;
let autoRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificação de Autenticação
    const token = localStorage.getItem('cco_token') || sessionStorage.getItem('cco_token');
    if (!token) {
        window.location.href = 'login.html?sessao_expirada=1';
        return;
    }

    // Exibir nome do usuário no topo se disponível
    try {
        const userStr = localStorage.getItem('cco_user') || sessionStorage.getItem('cco_user');
        if (userStr) {
            const userObj = JSON.parse(userStr);
            const userEl = document.getElementById('execUserName');
            if (userEl && userObj.nome) userEl.textContent = userObj.nome;
        }
    } catch(e) {}

    // 2. Inicializar seletor de data com a data atual oficial de Brasília
    const inputData = document.getElementById('inputDataFiscalizacao');
    const hojeIso = getBrasiliaIsoDate();
    if (inputData) {
        inputData.value = hojeIso;
        inputData.addEventListener('change', () => {
            carregarDadosDiretoria(inputData.value);
        });
    }

    // 3. Botão de Atualizar Manual
    const btnRefresh = document.getElementById('btnRefreshExec');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            const dt = inputData ? inputData.value : getBrasiliaIsoDate();
            carregarDadosDiretoria(dt);
        });
    }

    // 4. Carregar dados iniciais
    carregarDadosDiretoria(hojeIso);

    // 5. Iniciar escuta Server-Sent Events (SSE) para atualização em tempo real
    iniciarRealtimeDiretoria();

    // 6. Auto-Refresh automático a cada 5 minutos
    autoRefreshTimer = setInterval(() => {
        const dt = inputData ? inputData.value : getBrasiliaIsoDate();
        carregarDadosDiretoria(dt, true);
    }, 5 * 60 * 1000);
});

function getBrasiliaIsoDate() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(new Date());
}

async function carregarDadosDiretoria(dataAlvo, isAuto = false) {
    const token = localStorage.getItem('cco_token') || sessionStorage.getItem('cco_token');
    const btnRefresh = document.getElementById('btnRefreshExec');
    if (btnRefresh && !isAuto) {
        btnRefresh.classList.add('loading');
        btnRefresh.textContent = '↻ Atualizando...';
    }

    try {
        const res = await fetch(`/api/v1/diretoria/stats?data=${dataAlvo}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (res.status === 401 || res.status === 403) {
            window.location.href = 'login.html?sessao_expirada=1';
            return;
        }

        const json = await res.json();
        if (!json.success) {
            throw new Error(json.error || 'Erro ao carregar indicadores executivos');
        }

        renderizarPainel(json);
        atualizarHorarioUltimaSync();

    } catch (err) {
        console.error('Falha ao obter dados da diretoria:', err);
    } finally {
        if (btnRefresh && !isAuto) {
            btnRefresh.classList.remove('loading');
            btnRefresh.innerHTML = '↻ Atualizar';
        }
    }
}

function renderizarPainel(data) {
    const { cards, setores, plantao_detalhado, evolucao_diaria, relatorios_do_dia, data_selecionada } = data;

    // Subtítulo do Topo
    const dataSub = document.getElementById('displayDataSub');
    if (dataSub) {
        const partes = data_selecionada.split('-');
        dataSub.textContent = `DATA: ${partes[2]}/${partes[1]}/${partes[0]} • FUSO OFICIAL DE BRASÍLIA`;
    }

    // 1. CARDS EXECUTIVOS PRINCIPAIS
    document.getElementById('valPostosDisponiveis').textContent = cards.postos_disponiveis;
    document.getElementById('valPostosFiscalizados').textContent = cards.postos_fiscalizados;
    const valEmPreench = document.getElementById('valEmPreenchimento');
    if (valEmPreench) {
        valEmPreench.textContent = cards.postos_em_preenchimento || 0;
    }
    document.getElementById('valCobertura').textContent = `${cards.cobertura_percentual}%`;
    document.getElementById('valPendentes').textContent = cards.postos_pendentes;

    // Subtítulos informativos dos cards
    document.getElementById('subCobertura').textContent = `${cards.postos_fiscalizados} de ${cards.postos_disponiveis} postos ativos`;
    document.getElementById('subPendentes').textContent = cards.postos_pendentes === 0 
        ? 'Todos os postos fiscalizados' 
        : `${cards.postos_pendentes} aguardando fiscalização`;
    const subEmPreench = document.getElementById('subEmPreenchimento');
    if (subEmPreench) {
        subEmPreench.textContent = (cards.postos_em_preenchimento || 0) > 0 
            ? `${cards.postos_em_preenchimento} postos em vistoria ativa`
            : 'Nenhum preenchimento ativo';
    }

    // 1.1 FISCAIS EM ATIVIDADE (TEMPO REAL)
    renderFiscaisEmAtividadeDiretoria(data.fiscais_em_atividade);

    // 1.2 TABELA CONSOLIDADA EXECUTIVA POR SETOR
    renderTabelaExecutiva(setores);

    // 2. FISCALIZAÇÃO POR SETOR (METAS E BARRAS)
    // 2.1 Tinguá (Oficial: 12)
    renderSetorBox('tingua', setores.tingua.fiscalizados, setores.tingua.oficial, setores.tingua.percentual);

    // 2.2 Guandu (Oficial: 19)
    renderSetorBox('guandu', setores.guandu.fiscalizados, setores.guandu.oficial, setores.guandu.percentual);

    // 2.3 Laranjal (Oficial: 6)
    renderSetorBox('laranjal', setores.laranjal.fiscalizados, setores.laranjal.oficial, setores.laranjal.percentual);

    // 2.4 Plantão (Dinâmico: Todos os postos ativos)
    renderSetorBox('plantao', setores.plantao.fiscalizados, setores.plantao.oficial, setores.plantao.percentual, true);

    // 3. DETALHAMENTO DO PLANTÃO
    renderDetalhamentoPlantao(plantao_detalhado);

    // 4. EVOLUÇÃO DIÁRIA (GRÁFICO)
    renderGraficoEvolucao(evolucao_diaria);

    // 5. RELATÓRIOS DO DIA
    renderRelatoriosDoDia(relatorios_do_dia);
}

function renderSetorBox(key, fisc, oficial, pct, isDinamico = false) {
    const elFisc = document.getElementById(`fisc_${key}`);
    const elOficial = document.getElementById(`oficial_${key}`);
    const elPct = document.getElementById(`pct_${key}`);
    const elBar = document.getElementById(`bar_${key}`);
    const elBadge = document.getElementById(`badge_${key}`);

    if (elFisc) elFisc.textContent = fisc;
    if (elOficial) elOficial.textContent = oficial;
    if (elPct) elPct.textContent = `${pct}%`;

    const clampedPct = Math.min(100, Math.max(0, pct));
    if (elBar) {
        elBar.style.width = `${clampedPct}%`;
        elBar.className = 'progress-fill ' + (clampedPct >= 100 ? 'fill-green' : (clampedPct > 0 ? 'fill-blue' : 'fill-amber'));
    }

    if (elBadge) {
        if (clampedPct >= 100) {
            elBadge.textContent = '100% CONCLUÍDO';
            elBadge.className = 'setor-badge badge-complete';
        } else if (clampedPct > 0) {
            elBadge.textContent = isDinamico ? 'ROTA ATIVA' : 'PARCIAL';
            elBadge.className = 'setor-badge badge-partial';
        } else {
            elBadge.textContent = 'PENDENTE';
            elBadge.className = 'setor-badge badge-pending';
        }
    }
}

function renderDetalhamentoPlantao(det) {
    const tableBody = document.getElementById('tabelaDistribuicaoPlantao');
    const postosList = document.getElementById('listaPostosPlantao');
    const countTotalEl = document.getElementById('plantaoTotalCount');

    if (countTotalEl) {
        countTotalEl.textContent = `${det.total_fiscalizado_plantao} postos fiscalizados pelo Plantão`;
    }

    // Tabela de distribuição por setor de origem do posto
    if (tableBody) {
        if (!det.distribuicao_por_setor_posto || det.distribuicao_por_setor_posto.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#64748b; padding:1.25rem;">Nenhum posto fiscalizado pelo Plantão nesta data.</td></tr>`;
        } else {
            let html = '';
            det.distribuicao_por_setor_posto.forEach(row => {
                html += `
                    <tr>
                        <td><strong>${escapeHtml(row.setor_do_posto)}</strong></td>
                        <td class="num-col">${row.total_fiscalizados}</td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }
    }

    // Lista com detalhes dos postos
    if (postosList) {
        if (!det.postos_fiscalizados_lista || det.postos_fiscalizados_lista.length === 0) {
            postosList.innerHTML = `<div style="text-align:center; padding:1.5rem; color:#64748b;">Nenhuma fiscalização do Plantão registrada.</div>`;
        } else {
            let html = '';
            det.postos_fiscalizados_lista.forEach(p => {
                html += `
                    <div class="posto-item-card">
                        <div>
                            <div class="posto-item-title">${escapeHtml(p.posto_nome)}</div>
                            <div class="posto-item-sub">
                                Setor de Origem: <strong>${escapeHtml(p.setor_origem_posto)}</strong> &bull; Fiscal: ${escapeHtml(p.fiscal_nome || 'Plantão')}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:0.75rem; font-weight:800; color:#0284c7; background:#e0f2fe; padding:0.2rem 0.5rem; border-radius:4px;">
                                🕒 ${escapeHtml(p.horario_supervisao || '--:--')}
                            </span>
                            <div style="font-size:0.65rem; color:#64748b; margin-top:2px;">Turno ${escapeHtml(p.turno)}</div>
                        </div>
                    </div>
                `;
            });
            postosList.innerHTML = html;
        }
    }
}

function renderGraficoEvolucao(evolucao) {
    const canvas = document.getElementById('chartEvolucaoDiaria');
    if (!canvas || !window.Chart) return;

    const labels = evolucao.map(d => d.data_formatada);
    const dadosFiscalizados = evolucao.map(d => d.postos_fiscalizados);
    const dadosPendentes = evolucao.map(d => d.postos_pendentes);
    const dadosCobertura = evolucao.map(d => d.cobertura_percentual);

    if (evolucaoChart) {
        evolucaoChart.destroy();
    }

    evolucaoChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Postos Fiscalizados',
                    data: dadosFiscalizados,
                    backgroundColor: '#10b981',
                    borderRadius: 4,
                    order: 2
                },
                {
                    label: 'Postos Pendentes',
                    data: dadosPendentes,
                    backgroundColor: '#e2e8f0',
                    borderRadius: 4,
                    order: 3
                },
                {
                    label: 'Cobertura (%)',
                    data: dadosCobertura,
                    type: 'line',
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#0284c7',
                    pointRadius: 4,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        font: { size: 11, weight: '700' }
                    }
                },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            const idx = context[0].dataIndex;
                            return `Taxa de Cobertura: ${dadosCobertura[idx]}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'Qtd Postos', font: { size: 10 } }
                },
                y1: {
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: { callback: v => `${v}%` },
                    title: { display: true, text: 'Cobertura %', font: { size: 10 } }
                }
            }
        }
    });
}

function renderRelatoriosDoDia(relatorios) {
    const listEl = document.getElementById('listaRelatoriosDia');
    if (!listEl) return;

    if (!relatorios || relatorios.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:1.5rem; color:#64748b;">Nenhum expediente registrado nesta data.</div>`;
        return;
    }

    let html = '';
    relatorios.forEach(r => {
        const isConcluido = r.status === 'concluido' || r.status === null;
        const statusBadge = isConcluido 
            ? `<span style="background:#ecfdf5; color:#10b981; font-weight:800; font-size:0.7rem; padding:0.2rem 0.5rem; border-radius:4px;">CONCLUÍDO</span>`
            : `<span style="background:#fffbeb; color:#f59e0b; font-weight:800; font-size:0.7rem; padding:0.2rem 0.5rem; border-radius:4px;">EM ABERTO</span>`;

        html += `
            <div style="padding:0.75rem 1rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <div>
                    <div style="font-weight:800; color:#002B49; font-size:0.9rem;">
                        ${escapeHtml(r.setor_nome)} &bull; ${escapeHtml(r.turno)}
                    </div>
                    <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
                        Fiscal: <strong>${escapeHtml(r.fiscal_nome || 'Não informado')}</strong> &bull; Viatura: ${escapeHtml(r.viatura_modelo || '--')} (${escapeHtml(r.viatura_placa || '--')})
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.85rem; font-weight:800; color:#0284c7;">
                        ${r.fiscalizados_concluidos} postos fiscalizados
                    </div>
                    <div style="margin-top:2px;">${statusBadge}</div>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function renderTabelaExecutiva(setores) {
    const tbody = document.getElementById('tbodyExecutivaDiretoria');
    if (!tbody || !setores) return;

    const listaSetores = [
        setores.tingua,
        setores.guandu,
        setores.laranjal,
        setores.plantao
    ].filter(Boolean);

    tbody.innerHTML = listaSetores.map(s => {
        let statusBadge = '';
        if (s.status === 'CONCLUIDO') {
            statusBadge = '<span class="setor-badge badge-complete">🟢 CONCLUÍDO</span>';
        } else if (s.status === 'EM_PREENCHIMENTO') {
            statusBadge = '<span class="setor-badge badge-partial" style="background:#fef08a; color:#854d0e;">🟡 EM PREENCHIMENTO</span>';
        } else if (s.status === 'PARCIAL') {
            statusBadge = '<span class="setor-badge" style="background:#e0f2fe; color:#0369a1;">🔵 EM ANDAMENTO</span>';
        } else {
            statusBadge = '<span class="setor-badge badge-pending">⚪ NÃO INICIADO</span>';
        }

        const totalStr = s.escopo_dinamico ? 'Dinâmico' : s.oficial;
        const pendentesStr = s.escopo_dinamico ? '--' : s.pendentes;

        return `
            <tr>
                <td style="font-weight: 700; color: #002B49;">${escapeHtml(s.nome)}</td>
                <td style="text-align: center; font-weight: 700;">${totalStr}</td>
                <td style="text-align: center; font-weight: 800; color: #10b981;">${s.fiscalizados}</td>
                <td style="text-align: center; font-weight: 800; color: #d97706;">${s.em_preenchimento || 0}</td>
                <td style="text-align: center; font-weight: 700; color: #64748b;">${pendentesStr}</td>
                <td style="text-align: right;">${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

function renderFiscaisEmAtividadeDiretoria(lista) {
    const container = document.getElementById('containerFiscaisDir');
    const badgeCount = document.getElementById('badgeFiscaisAtividadeCountDir');
    if (!container) return;

    if (!lista || lista.length === 0) {
        if (badgeCount) badgeCount.textContent = '0 em andamento';
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #64748b; padding: 1.25rem; background: #ffffff; border-radius: 6px; border: 1px dashed var(--cedae-border); font-size: 0.85rem;">
                ⚪ Nenhum fiscal em preenchimento nesta data.
            </div>
        `;
        return;
    }

    if (badgeCount) {
        badgeCount.textContent = `${lista.length} ${lista.length === 1 ? 'fiscal preenchendo' : 'fiscais preenchendo'}`;
    }

    container.innerHTML = lista.map(f => `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(245,158,11,0.08); display: flex; flex-direction: column; justify-content: space-between;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                <div>
                    <div style="font-size: 0.95rem; font-weight: 800; color: #002B49;">👮 ${escapeHtml(f.fiscal_nome)}</div>
                    <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                        Setor: <strong style="color: #004b87;">${escapeHtml(f.setor_nome)}</strong> &bull; Turno: <strong>${escapeHtml(f.turno)}</strong>
                    </div>
                </div>
                <span style="background: #fef08a; color: #854d0e; font-weight: 800; font-size: 0.7rem; padding: 3px 8px; border-radius: 4px; white-space: nowrap;">
                    🟡 EM PREENCHIMENTO
                </span>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; color: #334155; margin-bottom: 4px;">
                    <span>Progresso: <strong>${escapeHtml(f.progresso_texto)}</strong></span>
                    <span style="color: #b45309; font-weight: 800;">${f.percentual}%</span>
                </div>
                <div style="height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${f.percentual}%; background: linear-gradient(90deg, #eab308 0%, #ca8a04 100%); transition: width 0.3s ease;"></div>
                </div>
            </div>
            <div style="margin-top: 8px; font-size: 0.72rem; color: #94a3b8; text-align: right; border-top: 1px solid #fef3c7; padding-top: 4px;">
                Última atualização: <strong style="color: #475569;">${escapeHtml(f.ultima_atualizacao)}</strong>
            </div>
        </div>
    `).join('');
}

let diretoriaEventSource = null;
let diretoriaFallbackTimer = null;

function iniciarRealtimeDiretoria() {
    try {
        if (typeof EventSource !== 'undefined') {
            diretoriaEventSource = new EventSource('/api/v1/realtime/stream');
            
            diretoriaEventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'EM_PREENCHIMENTO' || data.type === 'ENVIADO' || data.type === 'EXCLUIDO') {
                        const inputData = document.getElementById('inputDataFiscalizacao');
                        const dt = inputData ? inputData.value : getBrasiliaIsoDate();
                        carregarDadosDiretoria(dt, true);
                    }
                } catch (_) {}
            };

            diretoriaEventSource.onerror = () => {
                diretoriaEventSource?.close();
                diretoriaEventSource = null;
            };
        }
    } catch (e) {
        console.warn('Realtime SSE indisponível no ambiente:', e.message);
    }

    // Fallback de polling a cada 8 segundos para garantir sincronização contínua
    if (!diretoriaFallbackTimer) {
        diretoriaFallbackTimer = setInterval(() => {
            const inputData = document.getElementById('inputDataFiscalizacao');
            const dt = inputData ? inputData.value : getBrasiliaIsoDate();
            carregarDadosDiretoria(dt, true);
        }, 8000);
    }
}

function atualizarHorarioUltimaSync() {
    const el = document.getElementById('timestampUltimaSync');
    if (!el) return;
    const agora = new Date();
    const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    el.textContent = `Última sincronização: ${hora} (Auto 5 min)`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

let currentPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) return;
    
    await loadPlantoes();
    
    const filters = document.querySelectorAll('.filter-input');
    filters.forEach(f => f.addEventListener('change', () => {
        currentPage = 1;
        loadPlantoes();
    }));
});

async function loadPlantoes() {
    showLoading('tableContainer');
    try {
        const query = new URLSearchParams({
            setor: document.getElementById('filterSetor')?.value || '',
            dataInicio: document.getElementById('dateStart')?.value || '',
            dataFim: document.getElementById('dateEnd')?.value || ''
        });
        
        const data = await apiGet(`/plantoes?${query}`);
        const items = Array.isArray(data) ? data : (data.items || []);
        renderTable(items);
        if (data.total) renderPagination(data.total, data.limit);
    } catch (e) {
        showToast('Erro ao carregar plantões: ' + e.message, 'error');
    } finally {
        hideLoading('tableContainer');
    }
}

function renderTable(items) {
    const tbody = document.getElementById('plantoesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:1.5rem;">Nenhum plantão registrado para os filtros selecionados.</td></tr>';
        return;
    }

    items.forEach(item => {
        const sup = item.supervisor_nome || item.responsavel_nome || (Array.isArray(item.supervisores) ? item.supervisores.join(', ') : item.supervisores) || '-';
        const vtr = item.viatura_placa ? `${item.viatura_modelo ? item.viatura_modelo + ' ' : ''}(${item.viatura_placa})` : (item.viatura_outros_texto || '-');
        const dataFormatada = formatDate(item.data_servico || item.data_plantao);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${item.id}</td>
            <td><strong>${dataFormatada}</strong></td>
            <td><span class="badge badge-primary">${item.setor_nome || 'Setor ' + item.setor_id}</span></td>
            <td><strong>${sup}</strong></td>
            <td>${vtr}</td>
            <td><strong>${item.km_rodado ?? 0} km</strong></td>
            <td><button class="btn btn-sm btn-primary" onclick="verDetalhes(${item.id})">VER RELATÓRIO</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function verDetalhes(id) {
    try {
        const data = await apiGet(`/plantoes/${id}`);
        
        document.getElementById('detalheSetor').textContent = data.setor_nome || '-';
        document.getElementById('detalheData').textContent = formatDate(data.data_servico || data.data_plantao);
        document.getElementById('detalheEquipe').textContent = data.supervisor_nome || data.responsavel_nome || (Array.isArray(data.supervisores) ? data.supervisores.join(', ') : data.supervisores) || '-';
        document.getElementById('detalheViatura').textContent = data.viatura_placa ? `${data.viatura_modelo || 'VTR'} (${data.viatura_placa})` : (data.viatura_outros_texto || '-');
        
        document.getElementById('detalheKmIni').textContent = data.km_inicial ?? '-';
        document.getElementById('detalheKmFim').textContent = data.km_final ?? '-';
        document.getElementById('detalheKmRodado').textContent = (data.km_rodado ?? '-') + ' km';
        
        let ocorrenciasTxt = 'Nenhuma ocorrência registrada.';
        if (Array.isArray(data.ocorrencias) && data.ocorrencias.length > 0) {
            ocorrenciasTxt = data.ocorrencias.map(o => `• [${o.posto_nome || 'Geral'}] ${o.descricao} (Providência: ${o.providencias_adotadas || 'Registrada'})`).join('\n');
        } else if (typeof data.ocorrencias === 'string' && data.ocorrencias.trim()) {
            ocorrenciasTxt = data.ocorrencias;
        }
        document.getElementById('detalheOcorrencias').textContent = ocorrenciasTxt;
        
        const tbody = document.getElementById('detalhePostosBody');
        tbody.innerHTML = '';
        const listaPostos = data.postos || data.fiscalizacoes || [];
        listaPostos.forEach(f => {
            let badge = '<span class="badge badge-green" style="background:#dcfce7; color:#15803d; font-weight:700; padding:0.25rem 0.6rem; border-radius:9999px;">NORMAL</span>';
            if (f.supervisionado === 0 || f.status_supervisao === 'NAO_SUPERVISIONADO') {
                badge = `<span class="badge badge-red" style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:0.25rem 0.6rem; border-radius:9999px;">NÃO SUPERVISIONADO</span><br><small style="color:#b91c1c; font-weight:700;">Motivo: ${f.motivo_nao_supervisao || 'Não informado'}</small>`;
            } else if (f.status_supervisao === 'COM_OCORRENCIA') {
                badge = '<span class="badge badge-red" style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:0.25rem 0.6rem; border-radius:9999px;">COM OCORRÊNCIA</span>';
            } else if (f.status_supervisao === 'PENDENCIA') {
                badge = '<span class="badge badge-yellow" style="background:#fef9c3; color:#854d0e; font-weight:700; padding:0.25rem 0.6rem; border-radius:9999px;">PENDÊNCIA</span>';
            } else if (f.status_supervisao === 'SEM_ALTERACAO') {
                badge = '<span class="badge" style="background:#64748b; color:#fff; font-weight:700; padding:0.25rem 0.6rem; border-radius:9999px;">SEM ALTERAÇÃO</span>';
            }

            const hora = f.horario_supervisao ? `⏱️ <strong>${f.horario_supervisao}</strong>` : '<span style="color:#94a3b8;">-</span>';
            const km = (f.km_posto !== null && f.km_posto !== undefined && f.km_posto !== '') ? `🛣️ <strong>${f.km_posto} km</strong>` : '<span style="color:#94a3b8;">-</span>';
            const efetivo = (f.efetivo_completo === 0) 
                ? `<span style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:0.25rem 0.6rem; border-radius:4px; font-size:0.8rem; display:inline-block;">⚠️ FALTA (${f.falta_efetivo_qtd || '1'})</span>`
                : `<span style="background:#dcfce7; color:#15803d; font-weight:700; padding:0.25rem 0.6rem; border-radius:4px; font-size:0.8rem; display:inline-block;">✓ COMPLETO</span>`;
            const ocorrencia = (f.tem_ocorrencia === 1 || (f.descricao_ocorrencia && f.descricao_ocorrencia.trim()))
                ? `<span style="background:#fee2e2; border:1px solid #fecaca; color:#b91c1c; font-weight:800; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.8rem;">🚨 SIM</span><div style="font-size:0.8rem; color:#991b1b; margin-top:4px; font-weight:600; line-height:1.25;">${f.descricao_ocorrencia || 'Alteração informada'}</div>`
                : `<span style="color:#64748b; font-weight:700; font-size:0.85rem;">NÃO</span>`;

            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:0.75rem 0.85rem;"><strong>${f.posto_nome}</strong></td>
                    <td style="padding:0.75rem 0.85rem; white-space:nowrap;">${hora}</td>
                    <td style="padding:0.75rem 0.85rem; white-space:nowrap;">${km}</td>
                    <td style="padding:0.75rem 0.85rem; text-align:center;">${badge}</td>
                    <td style="padding:0.75rem 0.85rem; text-align:center;">${efetivo}</td>
                    <td style="padding:0.75rem 0.85rem;">${ocorrencia}</td>
                </tr>
            `;
        });
        
        document.getElementById('modalDetalhes').style.display = 'block';
    } catch (e) {
        showToast('Erro ao carregar detalhes', 'error');
    }
}

function closeModal() {
    document.getElementById('modalDetalhes').style.display = 'none';
}

function imprimirRelatorio() {
    window.print();
}

function renderPagination(total, limit) {
    // Basic pagination logic if needed
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) return;
    await loadAuditoria();
    
    setInterval(loadAuditoria, 2 * 60 * 1000);
});

async function loadAuditoria() {
    showLoading('tableContainer');
    try {
        const data = await apiGet('/auditoria');
        updateSummary(data);
        renderTable(data);
    } catch (e) {
        showToast('Erro ao carregar auditoria', 'error');
    } finally {
        hideLoading('tableContainer');
    }
}

function updateSummary(data) {
    let normal = 0, atencao = 0, critico = 0, nunca = 0;
    
    data.forEach(item => {
        const c = classificarAuditoria(item.horas_sem_fiscalizacao).classe;
        if (c === 'normal') normal++;
        else if (c === 'atencao') atencao++;
        else if (c === 'critico') critico++;
        else if (c === 'nunca') nunca++;
    });
    
    document.getElementById('countTotal').textContent = data.length;
    document.getElementById('countNormal').textContent = normal;
    document.getElementById('countAtencao').textContent = atencao;
    document.getElementById('countCritico').textContent = critico;
    document.getElementById('countNunca').textContent = nunca;
}

function renderTable(data) {
    const tbody = document.getElementById('auditoriaTableBody');
    if (!tbody) return;
    
    // Sort by most critical first
    data.sort((a, b) => b.horas_sem_fiscalizacao - a.horas_sem_fiscalizacao);
    
    tbody.innerHTML = '';
    data.forEach(item => {
        const audit = classificarAuditoria(item.horas_sem_fiscalizacao);
        const isPulse = audit.classe === 'nunca' ? 'pulse-danger' : '';
        
        const tr = document.createElement('tr');
        tr.className = isPulse;
        tr.innerHTML = `
            <td>${item.nome}</td>
            <td>${item.setor_nome}</td>
            <td>${formatDateTime(item.ultima_fiscalizacao) || 'NUNCA'}</td>
            <td>
                <span class="badge" style="background-color: ${audit.cor}; color: white;">
                    ${audit.label}
                </span>
            </td>
            <td>${item.horas_sem_fiscalizacao === Infinity ? '-' : Math.round(item.horas_sem_fiscalizacao) + 'h'}</td>
        `;
        tbody.appendChild(tr);
    });
}

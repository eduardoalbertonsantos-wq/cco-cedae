document.addEventListener('DOMContentLoaded', () => {
    if (!isAuthenticated()) return;
    
    document.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', () => {
            const type = card.dataset.type;
            showReportFilters(type);
        });
    });

    document.getElementById('btnGerarRelatorio')?.addEventListener('click', gerarRelatorio);
});

function showReportFilters(type) {
    document.getElementById('reportTypeInput').value = type;
    document.getElementById('reportFiltersSection').style.display = 'block';
    
    // Adjust visible filters based on type
    const setorFilter = document.getElementById('filterSetorContainer');
    if (type === 'geral') {
        setorFilter.style.display = 'none';
    } else {
        setorFilter.style.display = 'block';
    }
}

async function gerarRelatorio() {
    const type = document.getElementById('reportTypeInput').value;
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const setor = document.getElementById('filterSetor').value;
    
    showLoading('reportPreview');
    try {
        const data = await apiPost('/relatorios/gerar', {
            tipo: type,
            data_inicio: dataInicio,
            data_fim: dataFim,
            setor_id: setor
        });
        
        renderReportPreview(data);
    } catch (e) {
        showToast('Erro ao gerar relatório', 'error');
    } finally {
        hideLoading('reportPreview');
    }
}

function renderReportPreview(data) {
    const container = document.getElementById('reportPreview');
    // Basic rendering logic based on data structure
    container.innerHTML = `
        <div id="printArea">
            <h3>Relatório Gerado</h3>
            <pre>${JSON.stringify(data, null, 2)}</pre>
        </div>
        <div class="mt-4">
            <button class="btn" onclick="printContent('printArea')">Imprimir</button>
            <button class="btn" onclick="exportCSV(data.items, 'relatorio')">Exportar CSV</button>
        </div>
    `;
}

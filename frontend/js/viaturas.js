document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) return;
    await loadViaturas();
});

async function loadViaturas() {
    showLoading('tableContainer');
    try {
        const data = await apiGet('/viaturas');
        const tbody = document.getElementById('viaturasTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.veiculo}</td>
                <td>${item.placa}</td>
                <td>${item.setor_nome || 'N/A'}</td>
                <td>${item.km_acumulado || 0} km</td>
                <td>${item.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                    <button class="btn btn-sm" onclick='editarViatura(${JSON.stringify(item).replace(/'/g, "&apos;")})'>Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Erro ao carregar viaturas', 'error');
    } finally {
        hideLoading('tableContainer');
    }
}

function editarViatura(v) {
    document.getElementById('viaturaId').value = v.id;
    document.getElementById('veiculo').value = v.veiculo;
    document.getElementById('placa').value = v.placa;
    document.getElementById('setor').value = v.setor_id || '';
    document.getElementById('modalViatura').style.display = 'block';
}

function closeModal() {
    document.getElementById('modalViatura').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) return;
    await loadSupervisores();
});

async function loadSupervisores() {
    showLoading('tableContainer');
    try {
        const data = await apiGet('/supervisores');
        const tbody = document.getElementById('supervisoresTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.nome}</td>
                <td>${item.matricula}</td>
                <td>${item.setor_nome || 'N/A'}</td>
                <td>${item.total_plantoes || 0}</td>
                <td>${item.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                    <button class="btn btn-sm" onclick='editarSupervisor(${JSON.stringify(item).replace(/'/g, "&apos;")})'>Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Erro ao carregar supervisores', 'error');
    } finally {
        hideLoading('tableContainer');
    }
}

function editarSupervisor(sup) {
    document.getElementById('supId').value = sup.id;
    document.getElementById('nome').value = sup.nome;
    document.getElementById('matricula').value = sup.matricula;
    document.getElementById('setor').value = sup.setor_id || '';
    document.getElementById('modalSupervisor').style.display = 'block';
}

function closeModal() {
    document.getElementById('modalSupervisor').style.display = 'none';
}

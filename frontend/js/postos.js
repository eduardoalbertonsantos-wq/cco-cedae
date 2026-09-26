document.addEventListener('DOMContentLoaded', async () => {
    if (!isAuthenticated()) return;
    await loadPostos();
    
    document.getElementById('btnNovoPosto')?.addEventListener('click', () => {
        document.getElementById('postoForm').reset();
        document.getElementById('postoId').value = '';
        document.getElementById('modalPosto').style.display = 'block';
    });
    
    document.getElementById('postoForm')?.addEventListener('submit', salvarPosto);
});

async function loadPostos() {
    showLoading('tableContainer');
    try {
        const data = await apiGet('/postos');
        const tbody = document.getElementById('postosTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        data.forEach(item => {
            const audit = classificarAuditoria(item.horas_sem_fiscalizacao);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.nome}</td>
                <td>${item.setor_nome}</td>
                <td>
                    <span class="badge" style="background-color: ${audit.cor}; color: white;">
                        ${audit.label} (${Math.round(item.horas_sem_fiscalizacao)}h)
                    </span>
                </td>
                <td>${item.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                    <button class="btn btn-sm" onclick='editarPosto(${JSON.stringify(item).replace(/'/g, "&apos;")})'>Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="toggleStatus(${item.id})">${item.ativo ? 'Desativar' : 'Ativar'}</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Erro ao carregar postos', 'error');
    } finally {
        hideLoading('tableContainer');
    }
}

function editarPosto(posto) {
    document.getElementById('postoId').value = posto.id;
    document.getElementById('nome').value = posto.nome;
    document.getElementById('setor').value = posto.setor_id;
    document.getElementById('endereco').value = posto.endereco || '';
    document.getElementById('lat').value = posto.lat || '';
    document.getElementById('lng').value = posto.lng || '';
    document.getElementById('modalPosto').style.display = 'block';
}

async function salvarPosto(e) {
    e.preventDefault();
    const id = document.getElementById('postoId').value;
    const data = {
        nome: document.getElementById('nome').value,
        setor_id: document.getElementById('setor').value,
        endereco: document.getElementById('endereco').value,
        lat: document.getElementById('lat').value,
        lng: document.getElementById('lng').value
    };
    
    try {
        if (id) {
            await apiPut(`/postos/${id}`, data);
            showToast('Posto atualizado com sucesso', 'success');
        } else {
            await apiPost('/postos', data);
            showToast('Posto criado com sucesso', 'success');
        }
        closeModal();
        loadPostos();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function toggleStatus(id) {
    if (await confirmDialog('Deseja alterar o status deste posto?')) {
        try {
            await apiPut(`/postos/${id}/status`, {});
            loadPostos();
            showToast('Status alterado', 'success');
        } catch (e) {
            showToast('Erro ao alterar status', 'error');
        }
    }
}

function closeModal() {
    document.getElementById('modalPosto').style.display = 'none';
}

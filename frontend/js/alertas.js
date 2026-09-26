async function fetchAlertas() {
    try {
        return await apiGet('/alertas');
    } catch (e) {
        console.error('Erro ao buscar alertas', e);
        return [];
    }
}

function renderAlertas(container, alertas) {
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!alertas || alertas.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Nenhum alerta no momento.</p>';
        return;
    }
    
    alertas.forEach(alerta => {
        let icon = '🔵', colorClass = 'border-info';
        if (alerta.nivel === 'critico') { icon = '🔴'; colorClass = 'border-danger'; }
        else if (alerta.nivel === 'atencao') { icon = '🟡'; colorClass = 'border-warning'; }
        else if (alerta.nivel === 'sucesso') { icon = '🟢'; colorClass = 'border-success'; }
        
        const el = document.createElement('div');
        el.className = `alerta-item card mb-2 p-3 border-left ${colorClass}`;
        el.style.borderLeftWidth = '4px';
        el.style.cursor = 'pointer';
        
        el.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="mr-3">${icon}</div>
                <div>
                    <p class="mb-1">${alerta.mensagem}</p>
                    <small class="text-muted">${formatDateTime(alerta.data_criacao)}</small>
                </div>
            </div>
        `;
        
        el.addEventListener('click', () => {
            if (alerta.link) window.location.href = alerta.link;
        });
        
        container.appendChild(el);
    });
}

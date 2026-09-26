// Global Chart defaults
if (window.Chart) {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
}

const colors = {
    green: '#22c55e',
    red: '#ef4444',
    gray: '#94a3b8',
    blue: '#3b82f6',
    navy: '#0f172a',
    yellow: '#eab308'
};

function initFiscalizacoesChart(ctx, data) {
    if (!ctx) return;
    if (window.charts.fiscalizacoes) {
        window.charts.fiscalizacoes.destroy();
    }
    
    window.charts.fiscalizacoes = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Efetivo Completo', 'Falta de Efetivo', 'Não Fiscalizado'],
            datasets: [{
                data: [data.efetivo_completo || 0, data.falta_efetivo || 0, data.nao_fiscalizado || 0],
                backgroundColor: [colors.green, colors.red, colors.gray],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function initSetoresChart(ctx, data) {
    if (!ctx || !data) return;
    if (window.charts.setores) window.charts.setores.destroy();

    window.charts.setores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.setor),
            datasets: [
                {
                    label: 'Fiscalizados',
                    data: data.map(d => d.fiscalizados),
                    backgroundColor: colors.blue,
                    borderRadius: 4
                },
                {
                    label: 'Não Fiscalizados',
                    data: data.map(d => d.nao_fiscalizados),
                    backgroundColor: colors.gray,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [2, 4] } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { position: 'top' } }
        }
    });
}

function initKmChart(ctx, data) {
    if (!ctx || !data) return;
    if (window.charts.km) window.charts.km.destroy();

    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    window.charts.km = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.data),
            datasets: [{
                label: 'KM Rodado',
                data: data.map(d => d.km),
                borderColor: colors.blue,
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: colors.navy
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [2, 4] } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function initProdutividadeChart(ctx, data) {
    if (!ctx || !data) return;
    if (window.charts.produtividade) window.charts.produtividade.destroy();

    window.charts.produtividade = new Chart(ctx, {
        type: 'bar',
        indexAxis: 'y',
        data: {
            labels: data.map(d => d.supervisor),
            datasets: [{
                label: 'Postos Fiscalizados',
                data: data.map(d => d.total),
                backgroundColor: colors.navy,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, grid: { borderDash: [2, 4] } },
                y: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

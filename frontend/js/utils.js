function getHojeBrasiliaISO() {
    try {
        const parts = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());
        const map = {};
        parts.forEach(p => map[p.type] = p.value);
        return `${map.year}-${map.month}-${map.day}`;
    } catch (e) {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
}

function getAgoraBrasiliaHora() {
    try {
        const parts = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(new Date());
        const map = {};
        parts.forEach(p => map[p.type] = p.value);
        let h = map.hour === '24' ? '00' : map.hour;
        return `${h}:${map.minute}`;
    } catch (e) {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const clean = dateStr.split('T')[0].split(' ')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && dateStr.includes('Z')) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date);
        }
    }
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const clean = dateStr.replace('T', ' ');
        const parts = clean.split(' ');
        const datePart = formatDate(parts[0]);
        const timePart = parts[1] ? parts[1].substring(0, 5) : '';
        return timePart ? `${datePart} ${timePart}` : datePart;
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('pt-BR');
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = '<div class="spinner"></div>';
    container.appendChild(spinner);
}

function hideLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const spinner = container.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function exportCSV(data, filename) {
    if (!data || !data.length) return;
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header] !== null && row[header] !== undefined ? row[header] : '';
            return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function printContent(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Impressão</title>
                <link rel="stylesheet" href="/css/style.css">
                <style>
                    body { padding: 20px; background: white; }
                    .no-print { display: none !important; }
                </style>
            </head>
            <body>
                ${element.innerHTML}
                <script>
                    window.onload = () => {
                        window.print();
                        window.close();
                    };
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

function generatePDF(elementId, filename) {
    // Fallback to print since html2pdf is an external lib we shouldn't use
    printContent(elementId);
}

function confirmDialog(message) {
    return new Promise((resolve) => {
        const confirmed = window.confirm(message);
        resolve(confirmed);
    });
}

function calcularHorasDesde(dateStr) {
    if (!dateStr) return Infinity;
    const past = new Date(dateStr).getTime();
    const now = new Date().getTime();
    return (now - past) / (1000 * 60 * 60);
}

function classificarAuditoria(horas) {
    if (horas === Infinity || horas === null || horas === undefined) {
        return { classe: 'nunca', label: 'NUNCA FISCALIZADO', cor: '#8b0000' };
    } else if (horas >= 72) {
        return { classe: 'critico', label: 'CRÍTICO', cor: '#dc3545' };
    } else if (horas >= 48) {
        return { classe: 'atencao', label: 'ATENÇÃO', cor: '#ffc107' };
    } else {
        return { classe: 'normal', label: 'NORMAL', cor: '#28a745' };
    }
}

function classificarAuditoriaSemanal(dias) {
    if (dias === null || dias === undefined || dias === Infinity) {
        return { classe: 'nunca', label: 'NUNCA VISTORIADO', cor: '#dc2626', badgeClass: 'badge-red' };
    } else if (dias >= 15) {
        return { classe: 'critico', label: `CRÍTICO (${dias}d)`, cor: '#dc2626', badgeClass: 'badge-red' };
    } else if (dias >= 7) {
        return { classe: 'atencao', label: `ATENÇÃO (${dias}d)`, cor: '#d97706', badgeClass: 'badge-yellow' };
    } else {
        return { classe: 'em_dia', label: `EM DIA (${dias}d)`, cor: '#16a34a', badgeClass: 'badge-green' };
    }
}


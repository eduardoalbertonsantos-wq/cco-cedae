const calcularKmRodado = (kmInicial, kmFinal) => {
    if (kmInicial === undefined || kmInicial === null || kmFinal === undefined || kmFinal === null) return 0;
    const diff = parseFloat(kmFinal) - parseFloat(kmInicial);
    return diff > 0 ? diff : 0;
};

const formatarData = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR');
};

const formatarDataHora = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR');
};

const calcularHorasDesde = (dateString) => {
    if (!dateString) return null;
    const past = new Date(dateString);
    const now = new Date();
    const diffMs = now - past;
    return diffMs / (1000 * 60 * 60);
};

const classificarAuditoria = (horas) => {
    if (horas === null) return 'nunca';
    if (horas < 48) return 'normal';
    if (horas < 72) return 'atencao';
    return 'critico';
};

const getPeriodoDatas = (periodo, dataInicio, dataFim) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    let inicio = new Date(hoje);
    let fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);

    switch(periodo) {
        case 'hoje':
            break;
        case 'ontem':
            inicio.setDate(inicio.getDate() - 1);
            fim.setDate(fim.getDate() - 1);
            break;
        case '7dias':
            inicio.setDate(inicio.getDate() - 7);
            break;
        case '30dias':
            inicio.setDate(inicio.getDate() - 30);
            break;
        case 'personalizado':
            if (dataInicio) inicio = new Date(dataInicio);
            if (dataFim) {
                fim = new Date(dataFim);
                fim.setHours(23, 59, 59, 999);
            }
            break;
        default:
            // Default 30 days
            inicio.setDate(inicio.getDate() - 30);
    }
    
    return { 
        inicio: inicio.toISOString().split('T')[0], 
        fim: fim.toISOString().split('T')[0] 
    };
};

const sanitizeString = (str) => {
    if (!str) return '';
    return str.replace(/[<>]/g, '');
};

module.exports = {
    calcularKmRodado,
    formatarData,
    formatarDataHora,
    calcularHorasDesde,
    classificarAuditoria,
    getPeriodoDatas,
    sanitizeString
};

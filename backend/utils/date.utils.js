/**
 * CCO — SISTEMA DE CONTROLE OPERACIONAL
 * Módulo Central de Data e Hora Oficial (America/Sao_Paulo / Horário de Brasília)
 */

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Obtém os componentes de data e hora atuais ou de uma data fornecida
 * no fuso horário oficial de Brasília (America/Sao_Paulo).
 * 
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {{
 *   isoDate: string,         // '2026-09-26'
 *   hora: string,            // '00:25:14'
 *   horaCurta: string,       // '00:25'
 *   dataHora: string,        // '2026-09-26 00:25:14' (padrão SQLite local)
 *   displayDate: string,     // '26/09/2026'
 *   displayDateTime: string  // '26/09/2026 00:25'
 * }}
 */
function getBrasiliaDateTime(dateInput = new Date()) {
    let date;
    if (dateInput instanceof Date) {
        date = isNaN(dateInput.getTime()) ? new Date() : dateInput;
    } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        // Se já for data pura YYYY-MM-DD, divide diretamente sem risco de skew de timezone
        const [ano, mes, dia] = dateInput.split('-');
        return {
            isoDate: dateInput,
            hora: '00:00:00',
            horaCurta: '00:00',
            dataHora: `${dateInput} 00:00:00`,
            displayDate: `${dia}/${mes}/${ano}`,
            displayDateTime: `${dia}/${mes}/${ano} 00:00`
        };
    } else {
        date = new Date(dateInput);
        if (isNaN(date.getTime())) date = new Date();
    }

    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) {
        map[p.type] = p.value;
    }

    let h = map.hour || '00';
    if (h === '24') h = '00';

    const isoDate = `${map.year}-${map.month}-${map.day}`;
    const hora = `${h}:${map.minute}:${map.second}`;
    const horaCurta = `${h}:${map.minute}`;
    const dataHora = `${isoDate} ${hora}`;
    const displayDate = `${map.day}/${map.month}/${map.year}`;
    const displayDateTime = `${displayDate} ${horaCurta}`;

    return {
        isoDate,
        hora,
        horaCurta,
        dataHora,
        displayDate,
        displayDateTime
    };
}

/**
 * Formata qualquer representação de data para DD/MM/AAAA
 * preservando a integridade operacional de São Paulo.
 */
function formatDisplayDate(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        const clean = val.replace('T', ' ').split(' ')[0];
        const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return `${match[3]}/${match[2]}/${match[1]}`;
        }
        const brMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (brMatch) return clean;
    }
    return getBrasiliaDateTime(val).displayDate;
}

/**
 * Formata qualquer representação para DD/MM/AAAA HH:MM
 */
function formatDisplayDateTime(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        const clean = val.replace('T', ' ');
        const parts = clean.split(' ');
        if (parts.length >= 2) {
            const d = formatDisplayDate(parts[0]);
            const h = parts[1].substring(0, 5);
            return `${d} ${h}`;
        }
    }
    return getBrasiliaDateTime(val).displayDateTime;
}

/**
 * Formata hora para HH:MM
 */
function formatDisplayTime(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        const clean = val.replace('T', ' ');
        if (clean.includes(' ')) {
            return clean.split(' ')[1].substring(0, 5);
        }
        if (/^\d{2}:\d{2}/.test(clean)) {
            return clean.substring(0, 5);
        }
    }
    return getBrasiliaDateTime(val).horaCurta;
}

module.exports = {
    TIMEZONE,
    getBrasiliaDateTime,
    formatDisplayDate,
    formatDisplayDateTime,
    formatDisplayTime
};

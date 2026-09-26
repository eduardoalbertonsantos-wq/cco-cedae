const { getDb } = require('../database/db');

class AuditoriaService {
    static verificarStatusPosto(posto_id) {
        const db = getDb();
        const ult = db.prepare(`
            SELECT pl.data_plantao, pl.hora_fim 
            FROM fiscalizacoes f
            JOIN plantoes pl ON f.plantao_id = pl.id
            WHERE f.posto_id = ? AND f.situacao != 'nao_fiscalizado'
            ORDER BY pl.data_plantao DESC, pl.hora_fim DESC LIMIT 1
        `).get(posto_id);
        
        if (!ult) return { status: 'crítico', horas: null };
        
        const diff = db.prepare(`SELECT (julianday('now') - julianday(? || ' ' || ?)) * 24 as horas`).get(ult.data_plantao, ult.hora_fim);
        const horas = diff ? diff.horas : 0;
        
        let status = 'crítico';
        if (horas < 24) status = 'ok';
        else if (horas < 72) status = 'alerta';
        
        return { status, horas };
    }
}

module.exports = AuditoriaService;

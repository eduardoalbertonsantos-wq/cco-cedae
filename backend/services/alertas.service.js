const { getDb } = require('../database/db');

class AlertasService {
    static gerarAlertas() {
        const db = getDb();
        const alertas = [];
        
        const postos = db.prepare('SELECT id, nome FROM postos WHERE status = ?').all();
        for (const posto of postos) {
            const ult = db.prepare(`
                SELECT pl.data_plantao, pl.hora_fim 
                FROM fiscalizacoes f
                JOIN plantoes pl ON f.plantao_id = pl.id
                WHERE f.posto_id = ? AND f.situacao != 'nao_fiscalizado'
                ORDER BY pl.data_plantao DESC, pl.hora_fim DESC LIMIT 1
            `).get(posto.id);
            
            if (!ult) {
                alertas.push({ tipo: 'auditoria', criticidade: 'alta', mensagem: `Posto ${posto.nome} sem registro` });
            } else {
                const diff = db.prepare(`SELECT (julianday('now') - julianday(? || ' ' || ?)) * 24 as horas`).get(ult.data_plantao, ult.hora_fim);
                if (diff && diff.horas > 72) {
                    alertas.push({ tipo: 'auditoria', criticidade: 'alta', mensagem: `Posto ${posto.nome} abandonado > 72h` });
                }
            }
        }
        
        return alertas;
    }
}

module.exports = AlertasService;

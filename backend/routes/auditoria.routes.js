const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin, requireSupervisor } = require('../middleware/permissions');

router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const postos = db.prepare('SELECT * FROM postos WHERE status = ?').all();
        
        const results = [];
        
        for (const posto of postos) {
            const ult = db.prepare(`
                SELECT pl.data_plantao, pl.hora_fim 
                FROM fiscalizacoes f
                JOIN plantoes pl ON f.plantao_id = pl.id
                WHERE f.posto_id = ? AND f.situacao != 'nao_fiscalizado'
                ORDER BY pl.data_plantao DESC, pl.hora_fim DESC LIMIT 1
            `).get(posto.id);
            
            let horas = null;
            let status_auditoria = 'crítico';
            
            if (ult) {
                const diff = db.prepare(`SELECT (julianday('now') - julianday(? || ' ' || ?)) * 24 as horas`).get(ult.data_plantao, ult.hora_fim);
                horas = diff ? diff.horas : null;
                
                if (horas < 24) status_auditoria = 'ok';
                else if (horas < 72) status_auditoria = 'alerta';
                else status_auditoria = 'crítico';
            }
            
            results.push({
                posto_id: posto.id,
                posto_nome: posto.nome,
                ultima_fiscalizacao: ult ? `${ult.data_plantao} ${ult.hora_fim}` : null,
                horas_sem_fiscalizacao: horas,
                status_auditoria
            });
        }
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logs de ações administrativas (criação, alteração de postos, setores, viaturas, supervisores)
router.get('/logs', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const logs = db.prepare(`
            SELECT id, tabela, registro_id, acao, detalhes, usuario_nome, created_at
            FROM auditoria_log
            ORDER BY id DESC
            LIMIT 200
        `).all();
        res.json({ success: true, count: logs.length, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin, requireSupervisor } = require('../middleware/permissions');

router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const alertas = [];
        
        // 1. Postos sem fiscalização há mais de 72h
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
                alertas.push({ tipo: 'auditoria', criticidade: 'alta', mensagem: `Posto ${posto.nome} nunca foi fiscalizado` });
            } else {
                const diff = db.prepare(`SELECT (julianday('now') - julianday(? || ' ' || ?)) * 24 as horas`).get(ult.data_plantao, ult.hora_fim);
                if (diff && diff.horas > 72) {
                    alertas.push({ tipo: 'auditoria', criticidade: 'alta', mensagem: `Posto ${posto.nome} sem fiscalização há mais de 72h` });
                }
            }
        }
        
        // 2. Faltas de efetivo recentes (últimos 3 dias)
        const faltas = db.prepare(`
            SELECT p.nome, pl.data_plantao 
            FROM fiscalizacoes f
            JOIN postos p ON f.posto_id = p.id
            JOIN plantoes pl ON f.plantao_id = pl.id
            WHERE f.situacao = 'falta_efetivo' AND pl.data_plantao >= date('now', '-3 days')
        `).all();
        
        for (const falta of faltas) {
            alertas.push({ tipo: 'operacional', criticidade: 'media', mensagem: `Falta de efetivo registrada no posto ${falta.nome} em ${falta.data_plantao}` });
        }
        
        res.json(alertas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

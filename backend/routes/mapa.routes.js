const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Endpoint que retorna a estrutura hierárquica completa:
// SETOR -> SUPERVISORES -> VIATURAS -> POSTOS
router.get('/hierarquia', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { setor_id } = req.query;
        
        let sql = "SELECT * FROM setores WHERE status = 'ativo'";
        if (setor_id) sql += ` AND id = ${parseInt(setor_id)}`;
        sql += " ORDER BY nome ASC";
        
        const setores = db.prepare(sql).all();
        
        const hierarquia = setores.map(setor => {
            const supervisores = db.prepare("SELECT * FROM supervisores WHERE setor_id = ? AND status = 'ativo' ORDER BY nome ASC").all(setor.id);
            const postos = (setor.id === 4)
                ? db.prepare("SELECT * FROM postos WHERE status = 'ativo' ORDER BY nome ASC").all()
                : db.prepare("SELECT * FROM postos WHERE setor_id = ? AND status = 'ativo' ORDER BY nome ASC").all(setor.id);
            
            const ultRel = db.prepare(`
                SELECT r.*, sup.nome as supervisor_nome, v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
                FROM relatorios r
                LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
                LEFT JOIN viaturas v ON r.viatura_id = v.id
                WHERE r.setor_id = ?
                ORDER BY r.data_servico DESC, r.id DESC LIMIT 1
            `).get(setor.id);
            
            return {
                setor,
                supervisores,
                viaturas,
                postos,
                ultimo_plantao: ultRel || null
            };
        });
        
        res.json(hierarquia);
    } catch (error) {
        console.error('Erro na hierarquia do mapa:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint com coordenadas para Leaflet (se houver)
router.get('/postos', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const postos = db.prepare(`
            SELECT p.*, s.nome as setor_nome
            FROM postos p
            JOIN setores s ON p.setor_id = s.id
            WHERE p.status = 'ativo' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        `).all();
        res.json(postos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
